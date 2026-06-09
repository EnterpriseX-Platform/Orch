// ==========================================
// Orch Broker Configuration
// Port: 8047
// ==========================================

pub mod system_config;
/// Alias so callers can say `crate::config::system::kafka_bootstrap()` etc.
pub use system_config as system;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Gateway server port
pub const GATEWAY_PORT: u16 = 8047;

/// Database URL (from env or default).
/// Bootstrap: must come from env because the DB is where `system_configs`
/// lives — can't fetch it from the DB before we can connect to the DB.
pub fn database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:5447/orchiodb".to_string())
}

/// Kafka Brokers (DB `kafka.bootstrapServers` → env `KAFKA_BROKERS` → default).
/// Async version — call from async context.
pub async fn kafka_brokers_async() -> String {
    system::kafka_bootstrap().await
}

/// Sync legacy accessor. Prefer `kafka_brokers_async()` for runtime reads
/// (so admins can change the broker list without a redeploy). This variant
/// is kept for startup code paths that aren't yet async.
pub fn kafka_brokers() -> String {
    std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9047".to_string())
}

/// Flow Configuration stored in Gateway Memory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowConfig {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub flow_type: String,
    pub execution_mode: String, // "sync" or "async"
    pub async_config: Option<AsyncConfig>,
    pub nodes: Vec<FlowNode>,
    pub edges: Vec<FlowEdge>,
    pub is_active: bool,
    pub deployed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsyncConfig {
    pub topic: String,
    pub retry_count: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowNode {
    pub id: String,
    pub node_type: String,
    pub data: serde_json::Value,
    pub position: Option<Position>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
}

/// Route Configuration (match path to flow)
#[derive(Debug, Clone)]
pub struct RouteConfig {
    pub path_pattern: String,
    pub flow_id: String,
}

/// Node Types for Execution
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeType {
    Start,
    Input,
    Extract,
    Audit,
    Transform,
    Webhook,
    Kafka,
    Notification,
    Proxy,
    EventLog,      // NEW: Log to event store
    Response,      // NEW: Send HTTP response
    End,
    Output,
}

impl From<&str> for NodeType {
    fn from(value: &str) -> Self {
        match value {
            "start" => NodeType::Start,
            "input" => NodeType::Input,
            "extractNode" | "extract" => NodeType::Extract,
            "auditNode" | "audit" => NodeType::Audit,
            "transformNode" | "transform" => NodeType::Transform,
            "webhookNode" | "webhook" => NodeType::Webhook,
            "kafkaNode" | "kafka" => NodeType::Kafka,
            "notifyNode" | "notification" => NodeType::Notification,
            "proxyNode" | "proxy" => NodeType::Proxy,
            "eventLogNode" | "eventLog" | "event_log" => NodeType::EventLog,
            "responseNode" | "response" => NodeType::Response,
            "end" => NodeType::End,
            "output" => NodeType::Output,
            _ => NodeType::Output,
        }
    }
}

/// Execution Strategy
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionStrategy {
    Direct,     // Execute immediately (sync)
    Kafka,      // Route through Kafka topics
}

impl From<&str> for ExecutionStrategy {
    fn from(value: &str) -> Self {
        match value {
            "kafka" => ExecutionStrategy::Kafka,
            _ => ExecutionStrategy::Direct,
        }
    }
}

/// Execution Mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionMode {
    Sync,   // Realtime response
    Async,  // Via Kafka
}

impl From<&str> for ExecutionMode {
    fn from(value: &str) -> Self {
        match value {
            "async" => ExecutionMode::Async,
            _ => ExecutionMode::Sync,
        }
    }
}

/// Flow Cache - Store deployed flows in memory
pub type FlowCache = Arc<RwLock<HashMap<String, FlowConfig>>>;

/// Create new Flow Cache
pub fn create_flow_cache() -> FlowCache {
    Arc::new(RwLock::new(HashMap::new()))
}

/// Default routes (empty initially, populated on deploy)
pub fn get_default_routes() -> Vec<RouteConfig> {
    vec![]
}
