// ==========================================
// Test Handler - For testing flows directly
// ==========================================

use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use crate::AppState;
use crate::sdk::{ExecutionContext, HttpRequestData};
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct TestExecuteRequest {
    pub input: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct TestExecuteResponse {
    pub success: bool,
    pub flow_id: String,
    pub request_id: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub execution_time_ms: u64,
}

/// Test execute a deployed flow directly (bypass API registration)
pub async fn test_execute_flow(
    State(state): State<Arc<AppState>>,
    Path(flow_id): Path<String>,
    Json(request): Json<TestExecuteRequest>,
) -> impl IntoResponse {
    let start_time = std::time::Instant::now();
    let request_id = uuid::Uuid::new_v4().to_string();
    
    tracing::info!(
        "🧪 Test executing flow: flow_id={}, request_id={}",
        flow_id, request_id
    );
    
    // Get flow config from config_manager
    let flow_config = match state.config_manager.get_deployed_flow(&flow_id) {
        Some(config) => config,
        None => {
            return Json(json!({
                "success": false,
                "flow_id": flow_id,
                "request_id": request_id,
                "error": format!("Flow not found: {}", flow_id),
                "execution_time_ms": start_time.elapsed().as_millis()
            }));
        }
    };
    
    // Create execution context
    let request_data = HttpRequestData {
        method: "POST".to_string(),
        path: format!("/test/{}", flow_id),
        headers: HashMap::new(),
        query_params: HashMap::new(),
        body: request.input.clone(),
        client_ip: "127.0.0.1".to_string(),
    };
    
    let mut ctx = ExecutionContext::new(
        request_id.clone(),
        flow_id.clone(),
        "test-user".to_string(),
        "".to_string(),
        request_data,
    );
    
    // Execute flow using SDK
    match state.flow_executor_sdk.execute_flow(&flow_config, ctx).await {
        Ok(result) => {
            let execution_time = start_time.elapsed().as_millis();
            tracing::info!(
                "✅ Flow test execution completed: flow_id={}, time={}ms",
                flow_id, execution_time
            );
            
            Json(json!({
                "success": true,
                "flow_id": flow_id,
                "request_id": request_id,
                "result": result,
                "execution_time_ms": execution_time
            }))
        }
        Err(e) => {
            let execution_time = start_time.elapsed().as_millis();
            tracing::error!(
                "❌ Flow test execution failed: flow_id={}, error={:?}, time={}ms",
                flow_id, e, execution_time
            );
            
            Json(json!({
                "success": false,
                "flow_id": flow_id,
                "request_id": request_id,
                "error": format!("{:?}", e),
                "execution_time_ms": execution_time
            }))
        }
    }
}
