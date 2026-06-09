// ==========================================
// Job Status Handlers
// Proxy job queries to Next.js API for status tracking
// ==========================================

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tracing::{error, info};

use crate::config::system_config::attach_internal_token;
use crate::AppState;

/// Query parameters for listing jobs
#[derive(Debug, Deserialize)]
pub struct ListJobsQuery {
    pub request_id: Option<String>,
    pub flow_id: Option<String>,
    pub status: Option<String>,
    pub queue_name: Option<String>,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

/// GET /admin/jobs - List worker jobs (proxy to Next.js)
pub async fn list_jobs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListJobsQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let api_base = crate::config::system::api_base_url();

    let mut url = format!("{}/api/worker-jobs?", api_base);
    let mut params = vec![];

    if let Some(ref request_id) = query.request_id {
        params.push(format!("requestId={}", request_id));
    }
    if let Some(ref flow_id) = query.flow_id {
        params.push(format!("flowId={}", flow_id));
    }
    if let Some(ref status) = query.status {
        params.push(format!("status={}", status));
    }
    if let Some(ref queue_name) = query.queue_name {
        params.push(format!("queueName={}", queue_name));
    }
    if let Some(page) = query.page {
        params.push(format!("page={}", page));
    }
    if let Some(limit) = query.limit {
        params.push(format!("limit={}", limit));
    }

    url.push_str(&params.join("&"));

    match attach_internal_token(state.http_client.get(&url)).send().await {
        Ok(resp) => {
            let status = resp.status();
            match resp.json::<Value>().await {
                Ok(body) => Ok(Json(body)),
                Err(e) => {
                    error!("Failed to parse job list response: {}", e);
                    Err(StatusCode::BAD_GATEWAY)
                }
            }
        }
        Err(e) => {
            error!("Failed to fetch job list: {}", e);
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /admin/jobs/:id - Get single job status (proxy to Next.js)
pub async fn get_job_status(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let api_base = crate::config::system::api_base_url();

    let url = format!("{}/api/worker-jobs/{}", api_base, job_id);

    match attach_internal_token(state.http_client.get(&url)).send().await {
        Ok(resp) => {
            if resp.status() == reqwest::StatusCode::NOT_FOUND {
                return Err(StatusCode::NOT_FOUND);
            }
            match resp.json::<Value>().await {
                Ok(body) => Ok(Json(body)),
                Err(e) => {
                    error!("Failed to parse job status response: {}", e);
                    Err(StatusCode::BAD_GATEWAY)
                }
            }
        }
        Err(e) => {
            error!("Failed to fetch job status: {}", e);
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /admin/jobs/by-request/:requestId - Get all jobs for a request
pub async fn get_jobs_by_request(
    State(state): State<Arc<AppState>>,
    Path(request_id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let api_base = crate::config::system::api_base_url();

    let url = format!("{}/api/worker-jobs/by-request/{}", api_base, request_id);

    match attach_internal_token(state.http_client.get(&url)).send().await {
        Ok(resp) => {
            match resp.json::<Value>().await {
                Ok(body) => Ok(Json(body)),
                Err(e) => {
                    error!("Failed to parse jobs by request response: {}", e);
                    Err(StatusCode::BAD_GATEWAY)
                }
            }
        }
        Err(e) => {
            error!("Failed to fetch jobs by request: {}", e);
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}
