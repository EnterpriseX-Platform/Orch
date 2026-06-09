// ==========================================
// Orch Broker SDK
// Flow Engine SDK for building custom nodes
// ==========================================

pub mod config;
pub mod models;
pub mod services;
mod sdk;

// Public exports - Core SDK API
pub use sdk::{
    // Core trait and types
    NodeHandler,
    NodeMetadata,
    NodeCategory,
    ExecutionContext,
    HttpRequestData,
    HttpResponseData,
    VariableScope,
    NodeExecutionRecord,
    ExecutionStatus,
    
    // Registry
    NodeRegistry,
    HandlerRef,
    RegistryStats,
    RegistryExport,
    NodeTypeExport,
    
    // Errors
    ValidationError,
    ExecutionError,
    NodeResult,
    
    // Config
    SdkConfig,
    init_sdk,
};

// Built-in handlers
pub use sdk::handlers;

// Version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// SDK Builder for fluent API
pub struct SdkBuilder {
    config: SdkConfig,
    custom_handlers: Vec<HandlerRef>,
}

impl SdkBuilder {
    pub fn new() -> Self {
        Self {
            config: SdkConfig::default(),
            custom_handlers: Vec::new(),
        }
    }
    
    pub fn with_config(mut self, config: SdkConfig) -> Self {
        self.config = config;
        self
    }
    
    pub fn with_handler(mut self, handler: HandlerRef) -> Self {
        self.custom_handlers.push(handler);
        self
    }
    
    pub async fn build(self) -> NodeRegistry {
        let registry = NodeRegistry::new();
        
        if self.config.enable_builtin_handlers {
            registry.register_builtin_handlers().await;
        }
        
        for handler in self.custom_handlers {
            registry.register(handler).await;
        }
        
        registry
    }
}

impl Default for SdkBuilder {
    fn default() -> Self {
        Self::new()
    }
}
