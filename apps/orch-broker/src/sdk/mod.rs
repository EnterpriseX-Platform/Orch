// ==========================================
// Orch Broker SDK
// Plugin architecture for custom node types
// ==========================================

use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub mod context;
pub mod registry;
pub mod handlers;
pub mod audit_resolver;

pub use context::{
    ExecutionContext,
    HttpRequestData,
    HttpResponseData,
    VariableScope,
    NodeExecutionRecord,
    ExecutionStatus,
};
pub use registry::{
    NodeRegistry,
    RegistryStats,
    RegistryExport,
    NodeTypeExport,
};

/// Metadata for a node type
#[derive(Debug, Clone)]
pub struct NodeMetadata {
    pub node_type: String,
    pub category: NodeCategory,
    pub label: String,
    pub description: String,
    pub icon: String,
    pub color: String,
    pub version: String,
}

/// Node category for grouping
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeCategory {
    Trigger,
    Extract,
    Integration,
    Action,
    Output,
    Logic,
}

impl NodeCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            NodeCategory::Trigger => "trigger",
            NodeCategory::Extract => "extract",
            NodeCategory::Integration => "integration",
            NodeCategory::Action => "action",
            NodeCategory::Output => "output",
            NodeCategory::Logic => "logic",
        }
    }
}

/// Validation error
#[derive(Debug, Clone)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

/// Execution error
#[derive(Debug, Clone)]
pub struct ExecutionError {
    pub code: String,
    pub message: String,
    pub details: Option<Value>,
}

impl ExecutionError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.to_string(),
            message: message.to_string(),
            details: None,
        }
    }
    
    pub fn with_details(mut self, details: Value) -> Self {
        self.details = Some(details);
        self
    }
}

/// Result type for node execution
pub type NodeResult = Result<Value, ExecutionError>;

/// Core trait for node handlers
/// Note: We use Box::pin for async to support dyn compatibility
pub trait NodeHandler: Send + Sync {
    /// Get node metadata
    fn metadata(&self) -> NodeMetadata;
    
    /// Validate node configuration
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>>;
    
    /// Execute the node (returns boxed future for dyn compatibility)
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>>;
    
    /// Get JSON schema for configuration
    fn config_schema(&self) -> Option<Value> {
        None
    }
}

/// Helper macro for implementing NodeHandler
#[macro_export]
macro_rules! impl_node_handler {
    ($struct:ty, $meta:expr, $validate:expr, $execute:expr) => {
        impl NodeHandler for $struct {
            fn metadata(&self) -> NodeMetadata {
                $meta
            }
            
            fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
                $validate(self, config)
            }
            
            fn execute<'a>(
                &'a self,
                ctx: &'a mut ExecutionContext,
                config: &'a Value,
                input: &'a Value,
            ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
                Box::pin(async move { $execute(self, ctx, config, input).await })
            }
        }
    };
}

/// Type alias for handler storage
pub type HandlerRef = Arc<dyn NodeHandler>;

/// SDK configuration
#[derive(Debug, Clone)]
pub struct SdkConfig {
    pub enable_builtin_handlers: bool,
    pub max_execution_time_secs: u64,
    pub enable_caching: bool,
}

impl Default for SdkConfig {
    fn default() -> Self {
        Self {
            enable_builtin_handlers: true,
            max_execution_time_secs: 300,
            enable_caching: true,
        }
    }
}

/// Initialize SDK with default handlers
pub async fn init_sdk(config: SdkConfig) -> NodeRegistry {
    let registry = NodeRegistry::new();
    
    if config.enable_builtin_handlers {
        registry.register_builtin_handlers().await;
    }
    
    registry
}
