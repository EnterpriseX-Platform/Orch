// ==========================================
// External Worker Handlers
// Registration, heartbeat, health management for external workers
// ==========================================

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};
use std::sync::Arc;
use tracing::{info, warn};

use crate::AppState;
use crate::services::worker_registry::{RegisterWorkerRequest, HeartbeatRequest};

/// POST /admin/workers/register - Register an external worker
pub async fn register_external_worker(
    State(state): State<Arc<AppState>>,
    Json(request): Json<RegisterWorkerRequest>,
) -> Result<Json<Value>, StatusCode> {
    info!("📝 Registering external worker: {} for queue: {}", request.name, request.queue);

    let worker = state.worker_registry.register(request);

    Ok(Json(json!({
        "success": true,
        "message": "Worker registered successfully",
        "worker": worker,
    })))
}

/// POST /admin/workers/external/:id/heartbeat - Worker heartbeat
pub async fn worker_heartbeat(
    State(state): State<Arc<AppState>>,
    Path(worker_id): Path<String>,
    Json(request): Json<HeartbeatRequest>,
) -> Result<Json<Value>, StatusCode> {
    match state.worker_registry.heartbeat(&worker_id, request) {
        Ok(worker) => {
            Ok(Json(json!({
                "success": true,
                "worker": worker,
            })))
        }
        Err(e) => {
            warn!("Heartbeat failed: {}", e);
            Err(StatusCode::NOT_FOUND)
        }
    }
}

/// DELETE /admin/workers/external/:id - Deregister an external worker
pub async fn deregister_external_worker(
    State(state): State<Arc<AppState>>,
    Path(worker_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    match state.worker_registry.deregister(&worker_id) {
        Ok(worker) => {
            Ok(Json(json!({
                "success": true,
                "message": "Worker deregistered",
                "worker": worker,
            })))
        }
        Err(e) => {
            warn!("Deregister failed: {}", e);
            Err(StatusCode::NOT_FOUND)
        }
    }
}

/// GET /admin/workers/external - List all external workers
pub async fn list_external_workers(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, StatusCode> {
    let workers = state.worker_registry.list_all();
    let stats = state.worker_registry.stats();

    Ok(Json(json!({
        "workers": workers,
        "stats": stats,
    })))
}

/// GET /admin/workers/external/:id - Get specific external worker
pub async fn get_external_worker(
    State(state): State<Arc<AppState>>,
    Path(worker_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    match state.worker_registry.get_worker(&worker_id) {
        Some(worker) => {
            Ok(Json(json!({
                "success": true,
                "worker": worker,
            })))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}
