// ==========================================
// Deploy Handler - Receive Flow Config from Orch
// POST /deploy/flows/:id
// ==========================================

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{info, warn};

use serde_json;

use crate::{
    services::{
        config_manager::FlowConfig,
        kafka_admin::{self, KafkaAdmin},
    },
    AppState,
};

/// Deploy Flow Request
#[derive(Debug, Clone, Deserialize)]
pub struct DeployFlowRequest {
    pub name: String,
    pub description: Option<String>,
    pub trigger_type: Option<String>, // "HTTP", "SCHEDULE", etc.
    pub trigger_config: Option<serde_json::Value>, // { path, method, enabled }
    pub nodes: Vec<serde_json::Value>, // ReactFlow nodes
    pub edges: Vec<serde_json::Value>, // ReactFlow edges
    pub is_active: Option<bool>,
    pub execution_strategy: Option<String>, // "fast", "reliable", "custom"
    pub custom_queue_config: Option<serde_json::Value>, // { type, config }
}

/// Deploy Flow Response
#[derive(Debug, Clone, Serialize)]
pub struct DeployFlowResponse {
    pub success: bool,
    pub message: String,
    pub flow_id: String,
    pub node_count: usize,
    pub deployed_at: String,
}

/// Deployed Flow Info (for list)
#[derive(Debug, Clone, Serialize)]
pub struct DeployedFlowInfo {
    pub id: String,
    pub name: String,
    pub trigger_type: String,
    pub is_active: bool,
    pub node_count: usize,
    pub deployed_at: String,
}

/// Deploy Flow Handler
/// POST /deploy/flows/:id
/// Receives a flow config from Orch and stores it in the local cache for execution
pub async fn deploy_flow(
    State(state): State<Arc<AppState>>,
    Path(flow_id): Path<String>,
    Json(request): Json<DeployFlowRequest>,
) -> Result<Json<DeployFlowResponse>, StatusCode> {
    info!("🚀 Deploying flow: {} - {}", flow_id, request.name);

    let node_count = request.nodes.len();

    // Auto-create Kafka topics from flow config
    let mut topics_created: Vec<String> = Vec::new();
    if let Some(admin) = kafka_admin::get_kafka_admin() {
        let nodes_json = serde_json::Value::Array(request.nodes.clone());
        match admin.ensure_topics_from_flow(&flow_id, &nodes_json).await {
            Ok(topics) => {
                topics_created = topics;
                if !topics_created.is_empty() {
                    info!("📝 Created {} Kafka topics for flow {}", topics_created.len(), flow_id);
                }
            }
            Err(e) => {
                warn!("⚠️  Failed to ensure topics for flow {}: {}", flow_id, e);
                // Don't fail deployment, just log warning
            }
        }
    } else {
        warn!("⚠️  KafkaAdmin not initialized, skipping topic auto-creation");
    }

    // Convert deploy request to FlowConfig
    let flow_config = FlowConfig {
        id: flow_id.clone(),
        name: request.name,
        trigger_type: request.trigger_type.unwrap_or_else(|| "HTTP".to_string()),
        trigger_config: request.trigger_config.unwrap_or(serde_json::json!({
            "path": format!("/api/v1/flows/{}", flow_id),
            "method": "POST",
            "enabled": true
        })),
        nodes: serde_json::Value::Array(request.nodes),
        edges: serde_json::Value::Array(request.edges),
        is_active: request.is_active.unwrap_or(true),
        execution_strategy: request.execution_strategy.unwrap_or_else(|| "fast".to_string()),
        custom_queue_config: request.custom_queue_config,
    };

    // Validate flow before deploying (cycle detection, node type validation)
    if let Err(validation_errors) = state.flow_executor_sdk.validate_flow(&flow_config).await {
        warn!("⚠️ Flow validation failed for {}: {:?}", flow_id, validation_errors);
        return Ok(Json(DeployFlowResponse {
            success: false,
            message: format!("Flow validation failed: {}", validation_errors.join("; ")),
            flow_id,
            node_count,
            deployed_at: chrono::Utc::now().to_rfc3339(),
        }));
    }

    // Store in local cache (via ConfigManager)
    state.config_manager.deploy_flow(flow_config);

    let message = if topics_created.is_empty() {
        "Flow deployed successfully to orch-broker".to_string()
    } else {
        format!(
            "Flow deployed successfully. Created {} topic(s): {}",
            topics_created.len(),
            topics_created.join(", ")
        )
    };

    info!("✅ Flow {} deployed successfully with {} nodes", flow_id, node_count);

    Ok(Json(DeployFlowResponse {
        success: true,
        message,
        flow_id,
        node_count,
        deployed_at: chrono::Utc::now().to_rfc3339(),
    }))
}

/// List Deployed Flows
/// GET /deploy/flows
/// Lists the flows currently deployed in the local cache
pub async fn list_deployed_flows(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<DeployedFlowInfo>>, StatusCode> {
    let flows = state.config_manager.list_deployed_flows();

    let flow_infos: Vec<DeployedFlowInfo> = flows
        .into_iter()
        .map(|f| DeployedFlowInfo {
            id: f.id,
            name: f.name,
            trigger_type: f.trigger_type,
            is_active: f.is_active,
            node_count: f.nodes.as_array().map(|a| a.len()).unwrap_or(0),
            deployed_at: chrono::Utc::now().to_rfc3339(),
        })
        .collect();

    info!("📋 Listed {} deployed flows", flow_infos.len());
    Ok(Json(flow_infos))
}

/// Get Deployed Flow
/// GET /deploy/flows/:id
pub async fn get_deployed_flow(
    State(state): State<Arc<AppState>>,
    Path(flow_id): Path<String>,
) -> Result<Json<FlowConfig>, StatusCode> {
    match state.config_manager.get_deployed_flow(&flow_id) {
        Some(flow) => {
            info!("📖 Retrieved deployed flow: {}", flow_id);
            Ok(Json(flow))
        }
        None => {
            warn!("❌ Deployed flow not found: {}", flow_id);
            Err(StatusCode::NOT_FOUND)
        }
    }
}

/// Undeploy Flow
/// DELETE /deploy/flows/:id
pub async fn undeploy_flow(
    State(state): State<Arc<AppState>>,
    Path(flow_id): Path<String>,
) -> Result<Json<DeployFlowResponse>, StatusCode> {
    match state.config_manager.undeploy_flow(&flow_id) {
        Some(_) => {
            info!("🗑️  Flow undeployed: {}", flow_id);
            Ok(Json(DeployFlowResponse {
                success: true,
                message: "Flow undeployed successfully".to_string(),
                flow_id,
                node_count: 0,
                deployed_at: chrono::Utc::now().to_rfc3339(),
            }))
        }
        None => {
            warn!("❌ Cannot undeploy - flow not found: {}", flow_id);
            Err(StatusCode::NOT_FOUND)
        }
    }
}
