// ==========================================
// Workers Handler - Worker management and monitoring
// ==========================================

use axum::{
    extract::{State, Path},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use crate::AppState;
use crate::services::worker_manager::WorkerConfig;

#[derive(Debug, Deserialize)]
pub struct CreateWorkerRequest {
    pub queue: String,
    #[allow(dead_code)]
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RenameWorkerRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateConfigRequest {
    pub auto_restart: Option<bool>,
    pub enable_logging: Option<bool>,
    pub high_priority: Option<bool>,
    pub max_retries: Option<u32>,
    pub timeout: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct WorkerResponse {
    pub id: String,
    pub name: String,
    pub queue: String,
    pub status: String,
    pub host: String,
    pub pid: u32,
    pub started_at: String,
    pub last_activity: Option<String>,
    pub processed: u64,
    pub failed: u64,
    pub cpu: f64,
    pub memory: f64,
    pub config: WorkerConfig,
}

impl WorkerResponse {
    fn from_queue(queue: &str, custom_name: Option<String>, status: &str, config: WorkerConfig) -> Self {
        let name = custom_name.unwrap_or_else(|| {
            format!("Worker-{}{}", 
                queue.chars().next().unwrap().to_uppercase().collect::<String>(),
                &queue[1..]
            )
        });
        
        Self {
            id: format!("worker-{}", queue),
            name,
            queue: queue.to_string(),
            status: status.to_string(),
            host: "localhost".to_string(),
            pid: std::process::id(),
            started_at: chrono::Utc::now().to_rfc3339(),
            last_activity: Some(chrono::Utc::now().to_rfc3339()),
            processed: 0,
            failed: 0,
            cpu: 0.0,
            memory: 0.0,
            config,
        }
    }
}

/// Get worker statistics and list all workers
pub async fn get_workers(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let stats = state.worker_manager.get_stats().await;
    let worker_details = state.worker_manager.list_worker_details().await;
    
    // Collect configs first
    let mut workers = Vec::new();
    for w in &worker_details {
        let config = state.worker_manager.get_config(&w.queue_name).await;
        workers.push(WorkerResponse {
            id: format!("worker-{}", w.queue_name),
            name: format!("Worker-{}", w.queue_name),
            queue: w.queue_name.clone(),
            status: match w.status.as_str() {
                "Running" => "running",
                "Stopped" => "stopped",
                "Stopping" => "paused",
                _ => "error",
            }.to_string(),
            host: "localhost".to_string(),
            pid: std::process::id(),
            started_at: w.created_at.clone(),
            last_activity: w.last_activity.clone(),
            processed: w.messages_processed,
            failed: w.messages_failed,
            cpu: 0.0,
            memory: 0.0,
            config,
        });
    }
    
    let response_stats = serde_json::json!({
        "total": stats.total_workers,
        "running": stats.running,
        "paused": 0usize,
        "stopped": stats.stopped,
        "error": stats.error,
        "total_processed": workers.iter().map(|w| w.processed).sum::<u64>(),
        "total_failed": workers.iter().map(|w| w.failed).sum::<u64>(),
    });
    
    Json(json!({
        "success": true,
        "stats": response_stats,
        "workers": workers,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

/// Get detailed worker statistics
pub async fn get_worker_stats(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let stats = state.worker_manager.get_stats().await;
    
    Json(json!({
        "success": true,
        "data": {
            "total": stats.total_workers,
            "running": stats.running,
            "stopped": stats.stopped,
            "error": stats.error,
            "queues": stats.queue_names,
        },
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

/// Get worker config
pub async fn get_worker_config(
    State(state): State<Arc<AppState>>,
    Path(queue): Path<String>,
) -> impl IntoResponse {
    let config = state.worker_manager.get_config(&queue).await;
    
    Json(json!({
        "success": true,
        "queue": queue,
        "config": config,
    }))
}

/// Update worker config
pub async fn update_worker_config(
    State(state): State<Arc<AppState>>,
    Path(queue): Path<String>,
    Json(req): Json<UpdateConfigRequest>,
) -> impl IntoResponse {
    let mut config = state.worker_manager.get_config(&queue).await;
    
    // Update fields if provided
    if let Some(auto_restart) = req.auto_restart {
        config.auto_restart = auto_restart;
    }
    if let Some(enable_logging) = req.enable_logging {
        config.enable_logging = enable_logging;
    }
    if let Some(high_priority) = req.high_priority {
        config.high_priority = high_priority;
    }
    if let Some(max_retries) = req.max_retries {
        config.max_retries = max_retries;
    }
    if let Some(timeout) = req.timeout {
        config.timeout = timeout;
    }
    
    // Save config
    state.worker_manager.set_config(&queue, config.clone()).await;
    
    tracing::info!("Updated config for worker '{}': {:?}", queue, config);
    
    Json(json!({
        "success": true,
        "queue": queue,
        "config": config,
    }))
}

/// Create new worker
pub async fn create_worker(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateWorkerRequest>,
) -> impl IntoResponse {
    match state.worker_manager.add_worker(&req.queue).await {
        Ok(instance) => {
            let config = state.worker_manager.get_config(&instance.queue_name).await;
            let worker = WorkerResponse::from_queue(&instance.queue_name, req.name, "running", config);
            Json(json!({
                "success": true,
                "worker": worker,
            }))
        }
        Err(e) => {
            Json(json!({
                "success": false,
                "error": e,
            }))
        }
    }
}

/// Rename worker
pub async fn rename_worker(
    State(_state): State<Arc<AppState>>,
    Path(queue): Path<String>,
    Json(req): Json<RenameWorkerRequest>,
) -> impl IntoResponse {
    tracing::info!("Rename worker '{}' to '{}' requested (not persisted)", queue, req.name);
    
    Json(json!({
        "success": true,
        "id": queue,
        "name": req.name,
        "message": "Rename accepted (name not persisted in this version)",
    }))
}

/// Remove worker
pub async fn remove_worker(
    State(state): State<Arc<AppState>>,
    Path(queue): Path<String>,
) -> impl IntoResponse {
    match state.worker_manager.remove_worker(&queue).await {
        Ok(_) => {
            Json(json!({
                "success": true,
                "id": queue,
                "deleted": true,
            }))
        }
        Err(e) => {
            Json(json!({
                "success": false,
                "error": e,
            }))
        }
    }
}

/// Stop worker
pub async fn stop_worker(
    State(state): State<Arc<AppState>>,
    Path(queue): Path<String>,
) -> impl IntoResponse {
    match state.worker_manager.remove_worker(&queue).await {
        Ok(_) => {
            Json(json!({
                "success": true,
                "worker": {
                    "id": queue,
                    "status": "stopped",
                    "action": "stop",
                },
            }))
        }
        Err(e) => {
            Json(json!({
                "success": false,
                "error": e,
            }))
        }
    }
}

/// Restart worker
pub async fn restart_worker(
    State(state): State<Arc<AppState>>,
    Path(queue): Path<String>,
) -> impl IntoResponse {
    let _ = state.worker_manager.remove_worker(&queue).await;
    
    match state.worker_manager.add_worker(&queue).await {
        Ok(instance) => {
            let config = state.worker_manager.get_config(&instance.queue_name).await;
            let worker = WorkerResponse::from_queue(&instance.queue_name, None, "running", config);
            Json(json!({
                "success": true,
                "worker": worker,
            }))
        }
        Err(e) => {
            Json(json!({
                "success": false,
                "error": e,
            }))
        }
    }
}
