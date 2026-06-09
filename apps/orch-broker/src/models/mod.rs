use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub event_type: EventType,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub source_ip: String,
    pub request_method: String,
    pub request_path: String,
    pub request_headers: HashMap<String, String>,
    pub request_body: Option<String>,
    pub response_status: Option<u16>,
    pub response_body: Option<String>,
    pub extracted_fields: HashMap<String, ExtractedValue>,
    pub flow_id: Option<String>,
    pub api_id: String,
    pub execution_time_ms: i64,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    ApiRequest,
    ApiResponse,
    AuditTrail,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ExtractedValue {
    String(String),
    Number(f64),
    Boolean(bool),
    Date(String),
    Json(serde_json::Value),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiRequest {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub query_params: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowContext {
    pub flow_id: String,
    pub step_index: usize,
    pub variables: HashMap<String, serde_json::Value>,
    pub execution_start: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String,
    pub username: String,
    pub roles: Vec<String>,
    pub department: Option<String>,
    pub exp: usize,
    pub iat: usize,
}

/// Worker Job for async node execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerJob {
    pub id: String,
    pub request_id: String,
    pub flow_id: String,
    pub node_id: String,
    pub node_type: String,
    pub queue_name: String,
    pub priority: i32,
    pub status: WorkerJobStatus,
    pub input_data: serde_json::Value,
    pub output_data: Option<serde_json::Value>,
    pub config: Option<serde_json::Value>,
    pub max_retries: i32,
    pub retry_count: i32,
    pub error_message: Option<String>,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub kafka_offset: Option<String>,
    pub kafka_partition: Option<String>,
    // Flow structure for continuing execution
    pub nodes: Option<serde_json::Value>,
    pub edges: Option<serde_json::Value>,
    pub execution_strategy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkerJobStatus {
    Pending,
    Queued,
    Processing,
    Success,
    Failed,
    Retrying,
    Cancelled,
}

impl WorkerJob {
    pub fn new(
        request_id: String,
        flow_id: String,
        node_id: String,
        node_type: String,
        queue_name: String,
        input_data: serde_json::Value,
        config: Option<serde_json::Value>,
        max_retries: i32,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            request_id,
            flow_id,
            node_id,
            node_type,
            queue_name,
            priority: 0,
            status: WorkerJobStatus::Pending,
            input_data,
            output_data: None,
            config,
            max_retries,
            retry_count: 0,
            error_message: None,
            scheduled_at: None,
            started_at: None,
            completed_at: None,
            created_at: now,
            updated_at: now,
            kafka_offset: None,
            kafka_partition: None,
            nodes: None,
            edges: None,
            execution_strategy: None,
        }
    }
}
