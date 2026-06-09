// ==========================================
// Worker Consumer Service
// Consume jobs from Kafka and execute nodes asynchronously
// ==========================================

use rdkafka::{
    config::ClientConfig,
    consumer::{Consumer, StreamConsumer},
    Message,
};
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::timeout;
use tracing::{error, info, warn};

use crate::{
    config::system_config::attach_internal_token,
    models::{WorkerJob, WorkerJobStatus},
    sdk::{ExecutionContext, HttpRequestData, NodeRegistry, VariableScope},
    services::{flow_executor_sdk::FlowExecutorSdk, kafka_pipeline::get_kafka_producer},
};

/// Worker Consumer for processing async jobs
pub struct WorkerConsumer {
    consumer: StreamConsumer,
    registry: NodeRegistry,
    executor: Arc<FlowExecutorSdk>,
    queue_name: String,
}

impl WorkerConsumer {
    /// Create a new Worker Consumer
    pub async fn new(
        brokers: &str,
        queue_name: &str,
        registry: NodeRegistry,
        executor: Arc<FlowExecutorSdk>,
    ) -> anyhow::Result<Self> {
        let group_id = format!("orch-worker-{}", queue_name);
        let topic = format!("orch-worker-{}", queue_name);

        let consumer: StreamConsumer = ClientConfig::new()
            .set("group.id", &group_id)
            .set("bootstrap.servers", brokers)
            .set("auto.offset.reset", "earliest")
            .set("enable.auto.commit", "true")
            .set("auto.commit.interval.ms", "5000")
            .create()?;

        consumer.subscribe(&[&topic])?;

        info!(
            "✅ Worker Consumer created for queue: {} (topic: {})",
            queue_name, topic
        );

        Ok(Self {
            consumer,
            registry,
            executor,
            queue_name: queue_name.to_string(),
        })
    }

    /// Start consuming messages (non-blocking)
    pub async fn start(self: Arc<Self>) {
        info!(
            "🚀 Worker Consumer started for queue: {}",
            self.queue_name
        );
        
        let mut consecutive_errors = 0;
        let max_consecutive_errors = 10;

        loop {
            match self.consumer.recv().await {
                Ok(msg) => {
                    consecutive_errors = 0; // Reset error counter
                    
                    let payload = match msg.payload_view::<str>() {
                        Some(Ok(s)) => s,
                        Some(Err(e)) => {
                            error!("Failed to decode message payload: {}", e);
                            tokio::time::sleep(Duration::from_millis(100)).await;
                            continue;
                        }
                        None => {
                            warn!("Empty message payload");
                            tokio::time::sleep(Duration::from_millis(100)).await;
                            continue;
                        }
                    };

                    let partition = msg.partition();
                    let offset = msg.offset();

                    info!(
                        "📥 Received job: partition={}, offset={}",
                        partition, offset
                    );

                    // Parse WorkerJob
                    match serde_json::from_str::<WorkerJob>(payload) {
                        Ok(mut job) => {
                            // Update job with Kafka metadata
                            job.kafka_partition = Some(partition.to_string());
                            job.kafka_offset = Some(offset.to_string());

                            // Process job
                            let self_clone = Arc::clone(&self);
                            tokio::spawn(async move {
                                self_clone.process_job(job).await;
                            });
                        }
                        Err(e) => {
                            error!("Failed to parse WorkerJob: {}", e);
                        }
                    }
                    
                    // Small yield to prevent CPU spike
                    tokio::task::yield_now().await;
                }
                Err(e) => {
                    consecutive_errors += 1;
                    error!("Kafka consumer error ({}/{}): {}", consecutive_errors, max_consecutive_errors, e);
                    
                    if consecutive_errors >= max_consecutive_errors {
                        error!("❌ Too many consecutive errors, stopping worker for queue: {}", self.queue_name);
                        break;
                    }
                    
                    // Exponential backoff
                    let sleep_secs = std::cmp::min(consecutive_errors, 30);
                    tokio::time::sleep(Duration::from_secs(sleep_secs as u64)).await;
                }
            }
        }
        
        warn!("⚠️ Worker Consumer stopped for queue: {}", self.queue_name);
    }

    /// Process a single job
    async fn process_job(&self, mut job: WorkerJob) {
        info!(
            "🔧 Processing job: id={}, node_type={}",
            job.id, job.node_type
        );

        // Update status to PROCESSING
        job.status = WorkerJobStatus::Processing;
        job.started_at = Some(chrono::Utc::now());

        // Get handler from registry
        let handler = match self.registry.get(&job.node_type).await {
            Some(h) => h,
            None => {
                error!("Unknown node type: {}", job.node_type);
                job.status = WorkerJobStatus::Failed;
                job.error_message = Some(format!("Unknown node type: {}", job.node_type));
                job.completed_at = Some(chrono::Utc::now());
                self.save_job_result(&job).await;
                return;
            }
        };

        // Create execution context
        let request_data = HttpRequestData {
            method: "WORKER".to_string(),
            path: format!("/worker/{}", job.queue_name),
            headers: std::collections::HashMap::new(),
            query_params: std::collections::HashMap::new(),
            body: Some(job.input_data.clone()),
            client_ip: "worker".to_string(),
        };

        let mut ctx = ExecutionContext::new(
            job.request_id.clone(),
            job.flow_id.clone(),
            "worker".to_string(),
            "".to_string(), // backend_url not needed for worker
            request_data,
        );

        // Load config into context
        if let Some(config) = &job.config {
            ctx.set_flow("config", config.clone());
        }

        // Execute node with timeout
        let timeout_duration = Duration::from_secs(
            job.config
                .as_ref()
                .and_then(|c| c["worker"]["timeout"].as_u64())
                .unwrap_or(30)
        );

        let execute_result = timeout(
            timeout_duration,
            handler.execute(&mut ctx, &job.config.clone().unwrap_or(Value::Null), &job.input_data)
        ).await;

        match execute_result {
            Ok(Ok(output)) => {
                info!("✅ Job completed successfully: id={}", job.id);
                job.status = WorkerJobStatus::Success;
                job.output_data = Some(output.clone());
                job.error_message = None;
                
                // After successful execution, find and queue next node
                // NOTE: Skip chaining for publish node - it's an end node
                if job.node_type != "pub" {
                    if let Some(ref nodes) = job.nodes {
                        if let Some(ref edges) = job.edges {
                            self.process_next_node(&job, nodes, edges, &output).await;
                        }
                    }
                } else {
                    info!("⏹️ Publish node completed - no chaining (end node): job_id={}", job.id);
                }
            }
            Ok(Err(e)) => {
                error!("❌ Job execution failed: id={}, error={}", job.id, e.message);
                
                // Check if we should retry
                if job.retry_count < job.max_retries {
                    job.status = WorkerJobStatus::Retrying;
                    job.retry_count += 1;
                    job.error_message = Some(format!(
                        "Attempt {}/{} failed: {}",
                        job.retry_count, job.max_retries, e.message
                    ));
                    
                    // Schedule retry (in real implementation, this would re-queue)
                    warn!("🔄 Scheduling retry {} for job: {}", job.retry_count, job.id);
                } else {
                    job.status = WorkerJobStatus::Failed;
                    job.error_message = Some(format!(
                        "All {} attempts failed: {}",
                        job.max_retries, e.message
                    ));
                }
            }
            Err(_) => {
                error!("⏱️ Job timed out: id={}", job.id);
                
                if job.retry_count < job.max_retries {
                    job.status = WorkerJobStatus::Retrying;
                    job.retry_count += 1;
                    job.error_message = Some(format!(
                        "Timeout (attempt {}/{})",
                        job.retry_count, job.max_retries
                    ));
                } else {
                    job.status = WorkerJobStatus::Failed;
                    job.error_message = Some("Timeout - max retries exceeded".to_string());
                }
            }
        }

        job.completed_at = Some(chrono::Utc::now());
        self.save_job_result(&job).await;
    }
    
    /// Find and process the next node(s) in the flow.
    /// Supports: parallel branching (multiple outgoing edges) and conditional routing (sourceHandle filtering).
    async fn process_next_node(&self, current_job: &WorkerJob, nodes: &Value, edges: &Value, output: &Value) {
        let current_node_id = &current_job.node_id;

        // Check if current node produced a routing handle (decision/switch node)
        let output_handle = output.get("handle").and_then(|h| h.as_str());

        if let Some(edges_array) = edges.as_array() {
            // Collect all outgoing edges from current node
            let outgoing: Vec<&Value> = edges_array.iter()
                .filter(|e| e["source"].as_str() == Some(current_node_id.as_str()))
                .collect();

            if outgoing.is_empty() {
                info!("🏁 No next node found after: {} (flow complete)", current_node_id);
                return;
            }

            // Filter edges by sourceHandle if decision/switch routing
            let target_edges: Vec<&Value> = if let Some(handle) = output_handle {
                // Filter by sourceHandle
                let matched: Vec<&Value> = outgoing.iter()
                    .filter(|e| e["sourceHandle"].as_str().unwrap_or("") == handle)
                    .cloned()
                    .collect();

                if !matched.is_empty() {
                    matched
                } else {
                    // Fallback: edges without sourceHandle (default path)
                    let defaults: Vec<&Value> = outgoing.iter()
                        .filter(|e| {
                            e.get("sourceHandle").is_none()
                                || e["sourceHandle"].is_null()
                                || e["sourceHandle"].as_str() == Some("")
                        })
                        .cloned()
                        .collect();

                    if !defaults.is_empty() {
                        defaults
                    } else {
                        // Last resort: first edge
                        outgoing.into_iter().take(1).collect()
                    }
                }
            } else {
                // No handle: follow ALL outgoing edges (parallel fan-out)
                outgoing
            };

            let target_count = target_edges.len();
            if target_count > 1 {
                info!("🔀 Parallel fan-out from {} → {} branches", current_node_id, target_count);
            }

            // Queue job for each target node
            for edge in target_edges {
                if let Some(target) = edge["target"].as_str() {
                    info!("🔄 Queueing next node: {} -> {}", current_node_id, target);

                    if let Some(nodes_array) = nodes.as_array() {
                        if let Some(node) = nodes_array.iter().find(|n| n["id"].as_str() == Some(target)) {
                            // Get node type
                            let node_type = node["data"]["type"].as_str()
                                .or_else(|| node["type"].as_str())
                                .unwrap_or("unknown");

                            // Get node config
                            let config = if node["data"]["config"].is_object() {
                                node["data"]["config"].clone()
                            } else {
                                node["data"].clone()
                            };

                            // Create next job
                            let mut next_job = WorkerJob::new(
                                current_job.request_id.clone(),
                                current_job.flow_id.clone(),
                                target.to_string(),
                                node_type.to_string(),
                                current_job.queue_name.clone(),
                                output.clone(),
                                Some(config),
                                current_job.max_retries,
                            );

                            // Copy flow structure
                            next_job.nodes = current_job.nodes.clone();
                            next_job.edges = current_job.edges.clone();
                            next_job.execution_strategy = current_job.execution_strategy.clone();

                            // Queue the next job
                            self.queue_job(&next_job).await;
                        }
                    }
                }
            }
        } else {
            info!("🏁 No edges in flow after: {} (flow complete)", current_node_id);
        }
    }
    
    /// Queue a job to Kafka
    async fn queue_job(&self, job: &WorkerJob) {
        match get_kafka_producer() {
            Some(kafka) => {
                match kafka.send_worker_job(&job.queue_name, job).await {
                    Ok((partition, offset)) => {
                        info!("✅ Next job queued: node={}, partition={}, offset={}", 
                            job.node_id, partition, offset);
                    }
                    Err(e) => {
                        error!("❌ Failed to queue next job: {}", e);
                    }
                }
            }
            None => {
                error!("❌ Kafka producer not available for queuing next job");
            }
        }
    }

    /// Persist job result to database via Next.js API (fire-and-forget)
    async fn save_job_result(&self, job: &WorkerJob) {
        info!(
            "💾 Job completed: id={}, queue={}, node_type={}, status={:?}",
            job.id, job.queue_name, job.node_type, job.status
        );

        let api_base_url = crate::config::system::api_base_url();

        let payload = serde_json::json!({
            "id": job.id,
            "requestId": job.request_id,
            "flowId": job.flow_id,
            "nodeId": job.node_id,
            "nodeType": job.node_type,
            "queueName": job.queue_name,
            "priority": job.priority,
            "status": format!("{:?}", job.status),
            "inputData": job.input_data,
            "outputData": job.output_data,
            "config": job.config,
            "maxRetries": job.max_retries,
            "retryCount": job.retry_count,
            "errorMessage": job.error_message,
            "startedAt": job.started_at,
            "completedAt": job.completed_at,
            "kafkaOffset": job.kafka_offset,
            "kafkaPartition": job.kafka_partition,
        });

        let url = format!("{}/api/worker-jobs", api_base_url);

        // Fire-and-forget: spawn a background task to persist without blocking the consumer
        tokio::spawn(async move {
            let client = match reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
            {
                Ok(c) => c,
                Err(e) => {
                    warn!("Failed to build HTTP client for job persistence: {}", e);
                    return;
                }
            };

            match attach_internal_token(client.post(&url)).json(&payload).send().await {
                Ok(resp) if resp.status().is_success() => {
                    info!("📊 Job result persisted to DB: {}", payload["id"]);
                }
                Ok(resp) => {
                    warn!("⚠️ Failed to persist job result: HTTP {}", resp.status());
                }
                Err(e) => {
                    warn!("⚠️ Failed to persist job result: {} (non-blocking)", e);
                }
            }
        });
    }
}

/// Start worker consumers for all queues
pub async fn start_worker_consumers(
    brokers: &str,
    registry: NodeRegistry,
    executor: Arc<FlowExecutorSdk>,
    queues: Vec<&str>,
) -> anyhow::Result<Vec<tokio::task::JoinHandle<()>>> {
    let mut handles = Vec::new();

    for queue in queues {
        let consumer = WorkerConsumer::new(brokers, queue, registry.clone(), executor.clone()).await?;
        let handle = tokio::spawn(async move {
            Arc::new(consumer).start().await;
        });
        handles.push(handle);
    }

    info!("🚀 Started {} worker consumers", handles.len());
    Ok(handles)
}
