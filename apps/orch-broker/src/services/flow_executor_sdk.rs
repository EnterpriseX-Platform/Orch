// ==========================================
// Flow Executor SDK
// Uses SDK with plugin architecture
// Supports: parallel branching, conditional routing, cycle detection
// ==========================================

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use tracing::{debug, error, info, warn};

use crate::sdk::{NodeRegistry, ExecutionContext, NodeResult, ExecutionError};
use crate::services::config_manager::{FlowConfig, ExecutionStrategy};
use crate::models::WorkerJob;

/// Execution mode for a node
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeExecutionMode {
    Sync,   // Execute immediately, wait for result
    Async,  // Send to worker queue, don't wait
}

impl From<&str> for NodeExecutionMode {
    fn from(value: &str) -> Self {
        match value.to_lowercase().as_str() {
            "async" => NodeExecutionMode::Async,
            _ => NodeExecutionMode::Sync,
        }
    }
}

/// Determine execution mode based on flow strategy and node config
fn determine_execution_mode(
    flow_strategy: ExecutionStrategy,
    node_config: &Value,
) -> NodeExecutionMode {
    match flow_strategy {
        // Fast: All nodes sync (in-memory)
        ExecutionStrategy::Fast => NodeExecutionMode::Sync,

        // Reliable: All nodes async (through Kafka)
        ExecutionStrategy::Reliable => NodeExecutionMode::Async,

        // Custom: Check node config
        ExecutionStrategy::Custom => {
            node_config["executionMode"]
                .as_str()
                .map(NodeExecutionMode::from)
                .unwrap_or(NodeExecutionMode::Sync)
        }
    }
}

/// Get queue configuration for custom strategy
fn get_queue_config(flow_config: &FlowConfig, node_config: &Value) -> (String, String) {
    // Default to Kafka
    let default_queue_type = "kafka".to_string();
    let default_queue_name = "default".to_string();

    match &flow_config.custom_queue_config {
        Some(config) => {
            let queue_type = config["type"]
                .as_str()
                .unwrap_or("kafka")
                .to_string();

            // For now only support Kafka, but structure ready for other queues
            let queue_name = node_config["worker"]["queue"]
                .as_str()
                .unwrap_or("default")
                .to_string();

            (queue_type, queue_name)
        }
        None => (default_queue_type, default_queue_name),
    }
}

/// Maximum number of nodes that can be executed in a single flow
/// Prevents runaway execution if cycle detection is bypassed
const MAX_EXECUTION_STEPS: usize = 500;

/// New Flow Executor using SDK registry
pub struct FlowExecutorSdk {
    registry: NodeRegistry,
}

impl FlowExecutorSdk {
    pub fn new(registry: NodeRegistry) -> Self {
        Self { registry }
    }

    /// Execute a complete flow
    /// Supports: sequential, parallel branching (fork/join), conditional routing
    pub async fn execute_flow(
        &self,
        flow_config: &FlowConfig,
        mut ctx: ExecutionContext,
    ) -> anyhow::Result<Value> {
        let flow_strategy = ExecutionStrategy::from(flow_config.execution_strategy.as_str());

        info!("[{}] 🎬 Starting flow execution: {} (strategy: {:?})",
            ctx.request_id, flow_config.id, flow_strategy);

        let nodes = flow_config.nodes.as_array()
            .ok_or_else(|| anyhow::anyhow!("Invalid nodes format"))?;
        let edges = flow_config.edges.as_array()
            .ok_or_else(|| anyhow::anyhow!("Invalid edges format"))?;

        // Find start node
        let start_node_id = self.find_start_node(nodes, edges)?;

        // Build incoming edge count map for join detection
        let incoming_counts = self.build_incoming_counts(edges);

        // BFS/queue-based execution supporting parallel branching
        let mut ready_queue: VecDeque<String> = VecDeque::new();
        ready_queue.push_back(start_node_id);

        let mut visited: HashSet<String> = HashSet::new();
        let mut execution_order: Vec<String> = vec![];
        let mut completion_counts: HashMap<String, usize> = HashMap::new();
        let mut total_steps: usize = 0;

        while let Some(node_id) = ready_queue.pop_front() {
            // Safety: prevent infinite loops
            total_steps += 1;
            if total_steps > MAX_EXECUTION_STEPS {
                error!("[{}] ❌ Max execution steps ({}) exceeded — possible cycle",
                    ctx.request_id, MAX_EXECUTION_STEPS);
                return Err(anyhow::anyhow!(
                    "Max execution steps ({}) exceeded. Possible cycle in flow.", MAX_EXECUTION_STEPS
                ));
            }

            // Join detection: if node has multiple incoming edges, wait for all to arrive
            let expected_inputs = incoming_counts.get(&node_id).copied().unwrap_or(0);
            if expected_inputs > 1 {
                let completed = completion_counts.entry(node_id.clone()).or_insert(0);
                *completed += 1;
                if *completed < expected_inputs {
                    debug!("[{}] ⏸️ Join node {} waiting: {}/{} paths arrived",
                        ctx.request_id, node_id, completed, expected_inputs);
                    continue; // Wait for more paths to arrive
                }
                debug!("[{}] ✅ Join node {} all {} paths arrived, executing",
                    ctx.request_id, node_id, expected_inputs);
            }

            // Cycle guard: skip if already executed
            if !visited.insert(node_id.clone()) {
                debug!("[{}] ⚠️ Node {} already visited, skipping", ctx.request_id, node_id);
                continue;
            }

            execution_order.push(node_id.clone());

            // Find node config
            let node = nodes.iter()
                .find(|n| n["id"].as_str() == Some(&node_id))
                .ok_or_else(|| anyhow::anyhow!("Node not found: {}", node_id))?;

            // Get node type
            let node_type = node["data"]["type"].as_str()
                .or_else(|| node["type"].as_str())
                .ok_or_else(|| anyhow::anyhow!("Node type not found for {}", node_id))?;

            // Get handler from registry
            let handler = self.registry.get(node_type).await
                .ok_or_else(|| anyhow::anyhow!("No handler for node type: {}", node_type))?;

            // Get node config - support both node.data.config and node.data formats
            let config = if node["data"]["config"].is_object() {
                node["data"]["config"].clone()
            } else {
                node["data"].clone()
            };

            // Determine execution mode based on flow strategy
            let execution_mode = determine_execution_mode(flow_strategy, &config);

            info!("[{}] ▶️ Executing node: {} (type: {}, mode: {:?}, strategy: {:?})",
                ctx.request_id, node_id, node_type, execution_mode, flow_strategy);

            // Start node execution
            let input = self.prepare_node_input(&ctx, node);
            ctx.start_node(node_id.clone(), node_type.to_string(), input.clone());

            // Execute based on mode
            let result = match execution_mode {
                NodeExecutionMode::Async => {
                    // ASYNC: Send to worker queue via Kafka
                    match self.execute_node_async(&ctx, node_id.clone(), node_type.to_string(), &config, &input, flow_config).await {
                        Ok(output) => output,
                        Err(e) => {
                            error!("[{}] ❌ Async node {} failed: {}", ctx.request_id, node_id, e);
                            return Err(anyhow::anyhow!("Async execution failed: {}", e));
                        }
                    }
                }
                NodeExecutionMode::Sync => {
                    // SYNC: Execute immediately
                    match handler.execute(&mut ctx, &config, &input).await {
                        Ok(output) => {
                            ctx.complete_node(output.clone());
                            debug!("[{}] ✅ Node {} completed", ctx.request_id, node_id);
                            output
                        }
                        Err(e) => {
                            ctx.fail_node(e.message.clone());
                            error!("[{}] ❌ Node {} failed: {}", ctx.request_id, node_id, e.message);

                            // If error handler exists, try to handle
                            if node_type != "error" {
                                // Check if there's an error path
                                if let Some(error_output) = self.handle_error(&mut ctx, &e).await {
                                    error_output
                                } else {
                                    return Err(anyhow::anyhow!("Flow execution failed: {}", e.message));
                                }
                            } else {
                                return Err(anyhow::anyhow!("Flow execution failed: {}", e.message));
                            }
                        }
                    }
                }
            };

            // Store result in context
            ctx.set_flow(&format!("nodes.{}", node_id), result.clone());

            // Check if response was set (flow should end)
            if ctx.response.is_some() {
                info!("[{}] 📤 Response set, ending flow", ctx.request_id);
                break;
            }

            // Find next node(s) — supports conditional routing + parallel branching
            let output_handle = result.get("handle").and_then(|h| h.as_str());
            let next_nodes = self.find_all_next_nodes(edges, &node_id, output_handle);

            match next_nodes.len() {
                0 => {
                    debug!("[{}] 🏁 No next nodes from {}", ctx.request_id, node_id);
                }
                1 => {
                    ready_queue.push_back(next_nodes[0].clone());
                }
                n => {
                    info!("[{}] 🔀 Parallel fork from {} → {} branches", ctx.request_id, node_id, n);
                    for next_id in next_nodes {
                        ready_queue.push_back(next_id);
                    }
                }
            }
        }

        info!("[{}] ✅ Flow execution completed. Order: {:?}",
            ctx.request_id, execution_order);

        // Return final result
        let response_json = match &ctx.response {
            Some(r) => json!({
                "statusCode": r.status_code,
                "headers": r.headers,
                "body": r.body
            }),
            None => Value::Null,
        };

        info!("[{}] 📤 Response data: {:?}", ctx.request_id, response_json.is_object());

        Ok(json!({
            "executionOrder": execution_order,
            "variables": ctx.get_all_variables(),
            "requestId": ctx.request_id,
            "durationMs": ctx.execution_duration_ms(),
            "response": response_json,
        }))
    }

    /// Find start node (node without incoming edges)
    fn find_start_node(&self, nodes: &[Value], edges: &[Value]) -> anyhow::Result<String> {
        let targets: HashSet<String> = edges.iter()
            .filter_map(|e| e["target"].as_str().map(|s| s.to_string()))
            .collect();

        for node in nodes {
            if let Some(id) = node["id"].as_str() {
                if !targets.contains(id) {
                    return Ok(id.to_string());
                }
            }
        }

        // Fallback to first node
        nodes.first()
            .and_then(|n| n["id"].as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow::anyhow!("No nodes found"))
    }

    /// Build a map of node_id → number of incoming edges (for join detection)
    fn build_incoming_counts(&self, edges: &[Value]) -> HashMap<String, usize> {
        let mut counts: HashMap<String, usize> = HashMap::new();
        for edge in edges {
            if let Some(target) = edge["target"].as_str() {
                *counts.entry(target.to_string()).or_insert(0) += 1;
            }
        }
        counts
    }

    /// Find ALL next nodes from current node, considering conditional edges.
    ///
    /// Behavior:
    /// - If output_handle is Some (decision/switch node), filter edges by sourceHandle
    /// - If output_handle is None (regular node), return ALL targets (parallel fan-out)
    fn find_all_next_nodes(
        &self,
        edges: &[Value],
        current_node_id: &str,
        output_handle: Option<&str>,
    ) -> Vec<String> {
        let outgoing: Vec<&Value> = edges.iter()
            .filter(|e| e["source"].as_str() == Some(current_node_id))
            .collect();

        if outgoing.is_empty() {
            return vec![];
        }

        // If decision/switch node with handle, filter by sourceHandle
        if let Some(handle) = output_handle {
            // Find edges matching the handle
            let matched: Vec<String> = outgoing.iter()
                .filter(|e| {
                    e["sourceHandle"].as_str().unwrap_or("") == handle
                })
                .filter_map(|e| e["target"].as_str().map(|s| s.to_string()))
                .collect();

            if !matched.is_empty() {
                return matched;
            }

            // Fallback: edges without sourceHandle (default path)
            let default_edges: Vec<String> = outgoing.iter()
                .filter(|e| {
                    e.get("sourceHandle").is_none() || e["sourceHandle"].is_null() || e["sourceHandle"].as_str() == Some("")
                })
                .filter_map(|e| e["target"].as_str().map(|s| s.to_string()))
                .collect();

            if !default_edges.is_empty() {
                return default_edges;
            }

            // Last resort: first edge only
            return outgoing.first()
                .and_then(|e| e["target"].as_str().map(|s| vec![s.to_string()]))
                .unwrap_or_default();
        }

        // Non-decision node: return ALL targets (parallel fan-out)
        outgoing.iter()
            .filter_map(|e| e["target"].as_str().map(|s| s.to_string()))
            .collect()
    }

    /// Legacy: find single next node (for backward compatibility)
    #[allow(dead_code)]
    fn find_next_node(&self, edges: &[Value], current_node_id: &str) -> Option<String> {
        edges.iter()
            .find(|e| e["source"].as_str() == Some(current_node_id))
            .and_then(|e| e["target"].as_str().map(|s| s.to_string()))
    }

    /// Prepare input for node execution
    fn prepare_node_input(&self, ctx: &ExecutionContext, node: &Value) -> Value {
        // Get input mapping from node config
        let input_mapping = node["data"]["input"].clone();

        if input_mapping.is_null() || input_mapping.is_object() && input_mapping.as_object().unwrap().is_empty() {
            // Default: pass through all flow variables
            ctx.get_all_variables()
        } else if let Some(source) = input_mapping["source"].as_str() {
            // Get from specific source
            ctx.get(source).cloned().unwrap_or(json!({}))
        } else {
            // Use input mapping as-is
            input_mapping
        }
    }

    /// Handle execution error
    async fn handle_error(&self, ctx: &mut ExecutionContext, error: &ExecutionError) -> Option<Value> {
        // TODO: Implement error handling flow
        // For now, just return None to propagate error
        warn!("Error handling not yet implemented for: {}", error.message);
        None
    }

    /// Validate flow before execution (includes cycle detection)
    pub async fn validate_flow(&self, flow_config: &FlowConfig) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();

        let nodes = match flow_config.nodes.as_array() {
            Some(n) => n,
            None => {
                errors.push("Invalid nodes format".to_string());
                return Err(errors);
            }
        };

        let empty_edges = vec![];
        let edges = flow_config.edges.as_array().unwrap_or(&empty_edges);

        // Validate each node
        for node in nodes {
            let node_type = node["data"]["type"].as_str()
                .or_else(|| node["type"].as_str());

            let node_id = node["id"].as_str().unwrap_or("unknown");

            if let Some(node_type) = node_type {
                if !self.registry.has(node_type).await {
                    errors.push(format!("Node {}: Unknown type '{}'", node_id, node_type));
                    continue;
                }

                // Validate config - support both node.data.config and node.data formats
                let config = if node["data"]["config"].is_object() {
                    node["data"]["config"].clone()
                } else {
                    node["data"].clone()
                };
                if let Err(validation_errors) = self.registry.validate_config(node_type, &config).await {
                    for e in validation_errors {
                        errors.push(format!("Node {}: {} - {}", node_id, e.field, e.message));
                    }
                }
            } else {
                errors.push(format!("Node {}: Missing type", node_id));
            }
        }

        // Cycle detection using DFS with three-color marking
        if let Err(cycle_errors) = self.detect_cycles(nodes, edges) {
            for e in cycle_errors {
                errors.push(e);
            }
        }

        // Validate edges reference existing nodes
        let node_ids: HashSet<String> = nodes.iter()
            .filter_map(|n| n["id"].as_str().map(|s| s.to_string()))
            .collect();

        for edge in edges {
            if let Some(source) = edge["source"].as_str() {
                if !node_ids.contains(source) {
                    errors.push(format!("Edge references non-existent source node: {}", source));
                }
            }
            if let Some(target) = edge["target"].as_str() {
                if !node_ids.contains(target) {
                    errors.push(format!("Edge references non-existent target node: {}", target));
                }
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// Detect cycles in the flow graph using DFS with three-color marking.
    /// Returns Ok(()) if no cycles, or Err with cycle descriptions.
    fn detect_cycles(&self, nodes: &[Value], edges: &[Value]) -> Result<(), Vec<String>> {
        // Build adjacency list from edges
        let mut adj: HashMap<String, Vec<String>> = HashMap::new();
        for edge in edges {
            if let (Some(src), Some(tgt)) = (
                edge["source"].as_str(),
                edge["target"].as_str()
            ) {
                adj.entry(src.to_string()).or_default().push(tgt.to_string());
            }
        }

        // Collect all node IDs
        let all_nodes: Vec<String> = nodes.iter()
            .filter_map(|n| n["id"].as_str().map(|s| s.to_string()))
            .collect();

        // DFS states: 0=white (unvisited), 1=gray (in-stack), 2=black (done)
        let mut color: HashMap<String, u8> = HashMap::new();
        let mut errors: Vec<String> = Vec::new();

        for node_id in &all_nodes {
            if *color.get(node_id).unwrap_or(&0) == 0 {
                // Iterative DFS from this node
                let mut stack: Vec<(String, bool)> = vec![(node_id.clone(), false)];

                while let Some((current, processed)) = stack.pop() {
                    if processed {
                        color.insert(current, 2); // black - done
                        continue;
                    }

                    // Check if already in stack (gray)
                    if color.get(&current) == Some(&1) {
                        // This can happen if we pushed it again — skip
                        continue;
                    }

                    color.insert(current.clone(), 1); // gray - in progress
                    stack.push((current.clone(), true)); // will mark black when popped

                    if let Some(neighbors) = adj.get(&current) {
                        for next in neighbors {
                            match color.get(next).unwrap_or(&0) {
                                0 => {
                                    // White: unvisited, push to stack
                                    stack.push((next.clone(), false));
                                }
                                1 => {
                                    // Gray: back edge = cycle!
                                    errors.push(format!(
                                        "Cycle detected: {} → {} (back edge creates a loop)",
                                        current, next
                                    ));
                                }
                                _ => {
                                    // Black: already fully explored, safe
                                }
                            }
                        }
                    }
                }
            }
        }

        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }

    /// Execute node asynchronously via Kafka worker
    async fn execute_node_async(
        &self,
        ctx: &ExecutionContext,
        node_id: String,
        node_type: String,
        config: &Value,
        input: &Value,
        flow_config: &FlowConfig,
    ) -> anyhow::Result<Value> {
        use crate::services::kafka_pipeline::get_kafka_producer;

        info!("[{}] ⏳ Queueing async job for node: {}", ctx.request_id, node_id);

        // Get queue configuration based on flow strategy
        let (queue_type, queue_name) = get_queue_config(flow_config, config);

        let max_retries = config["worker"]["retry"]
            .as_u64()
            .unwrap_or(3) as i32;

        // Create WorkerJob with flow structure for continuing execution
        let mut job = WorkerJob::new(
            ctx.request_id.clone(),
            ctx.flow_id.clone(),
            node_id.clone(),
            node_type.clone(),
            queue_name.clone(),
            input.clone(),
            Some(config.clone()),
            max_retries,
        );

        // Include flow structure so worker can continue to next nodes
        job.nodes = Some(flow_config.nodes.clone());
        job.edges = Some(flow_config.edges.clone());
        job.execution_strategy = Some(flow_config.execution_strategy.clone());

        // Route to appropriate queue based on type
        match queue_type.as_str() {
            "kafka" => {
                match get_kafka_producer() {
                    Some(kafka) => {
                        match kafka.send_worker_job(&queue_name, &job).await {
                            Ok((partition, offset)) => {
                                info!("[{}] ✅ Job queued to Kafka: node={}, queue={}, partition={}, offset={}",
                                    ctx.request_id, node_id, queue_name, partition, offset);

                                Ok(json!({
                                    "status": "queued",
                                    "jobId": job.id,
                                    "nodeId": node_id,
                                    "nodeType": node_type,
                                    "queueType": "kafka",
                                    "queue": queue_name,
                                    "kafkaPartition": partition,
                                    "kafkaOffset": offset,
                                }))
                            }
                            Err(e) => {
                                error!("[{}] ❌ Failed to queue job to Kafka: {}", ctx.request_id, e);
                                Err(anyhow::anyhow!("Failed to queue job: {}", e))
                            }
                        }
                    }
                    None => {
                        error!("[{}] ❌ Kafka producer not available", ctx.request_id);
                        Err(anyhow::anyhow!("Kafka producer not available. Cannot execute async mode."))
                    }
                }
            }
            other => {
                // TODO: Support other queue types (RabbitMQ, SQS, etc.)
                error!("[{}] ❌ Queue type '{}' not yet supported", ctx.request_id, other);
                Err(anyhow::anyhow!("Queue type '{}' not yet supported", other))
            }
        }
    }

    /// Get execution statistics
    pub fn stats(&self) -> Value {
        json!({
            "version": "2.0",
            "registry": "active",
            "features": ["parallel_branching", "conditional_routing", "cycle_detection"],
        })
    }
}

impl Clone for FlowExecutorSdk {
    fn clone(&self) -> Self {
        Self {
            registry: self.registry.clone(),
        }
    }
}
