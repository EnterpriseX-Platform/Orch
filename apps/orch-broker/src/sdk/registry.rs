// ==========================================
// Node Registry
// Central registry for node handlers
// ==========================================

use super::NodeMetadata;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Central registry for node handlers
#[derive(Clone)]
pub struct NodeRegistry {
    handlers: Arc<RwLock<HashMap<String, Arc<dyn super::NodeHandler>>>>,
    metadata: Arc<RwLock<HashMap<String, NodeMetadata>>>,
}

impl NodeRegistry {
    pub fn new() -> Self {
        Self {
            handlers: Arc::new(RwLock::new(HashMap::new())),
            metadata: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Register a new node handler
    pub async fn register(&self, handler: Arc<dyn super::NodeHandler>) {
        let meta = handler.metadata();
        let node_type = meta.node_type.clone();
        
        let mut handlers = self.handlers.write().await;
        let mut metadata = self.metadata.write().await;
        
        info!("Registering node handler: {} ({}", node_type, meta.label);
        
        handlers.insert(node_type.clone(), handler);
        metadata.insert(node_type, meta);
    }
    
    /// Unregister a node handler
    pub async fn unregister(&self, node_type: &str) -> bool {
        let mut handlers = self.handlers.write().await;
        let mut metadata = self.metadata.write().await;
        
        let removed = handlers.remove(node_type).is_some();
        metadata.remove(node_type);
        
        if removed {
            info!("Unregistered node handler: {}", node_type);
        }
        
        removed
    }
    
    /// Get handler by node type
    pub async fn get(&self, node_type: &str) -> Option<Arc<dyn super::NodeHandler>> {
        let handlers = self.handlers.read().await;
        handlers.get(node_type).cloned()
    }
    
    /// Check if handler exists
    pub async fn has(&self, node_type: &str) -> bool {
        let handlers = self.handlers.read().await;
        handlers.contains_key(node_type)
    }
    
    /// Get all registered node types
    pub async fn list_types(&self) -> Vec<String> {
        let handlers = self.handlers.read().await;
        handlers.keys().cloned().collect()
    }
    
    /// Get all metadata
    pub async fn get_all_metadata(&self) -> Vec<NodeMetadata> {
        let metadata = self.metadata.read().await;
        metadata.values().cloned().collect()
    }
    
    /// Get metadata for specific node type
    pub async fn get_metadata(&self, node_type: &str) -> Option<NodeMetadata> {
        let metadata = self.metadata.read().await;
        metadata.get(node_type).cloned()
    }
    
    /// Validate node configuration
    pub async fn validate_config(&self, node_type: &str, config: &Value) -> Result<(), Vec<super::ValidationError>> {
        match self.get(node_type).await {
            Some(handler) => handler.validate(config),
            None => Err(vec![super::ValidationError {
                field: "nodeType".to_string(),
                message: format!("Unknown node type: {}", node_type),
            }]),
        }
    }
    
    /// Get JSON schema for node configuration
    pub async fn get_config_schema(&self, node_type: &str) -> Option<Value> {
        match self.get(node_type).await {
            Some(handler) => handler.config_schema(),
            None => None,
        }
    }
    
    /// Register all built-in handlers
    pub async fn register_builtin_handlers(&self) {
        use super::handlers::*;
        
        info!("Registering built-in node handlers...");
        
        // Triggers
        self.register(Arc::new(HttpRequestHandler)).await;
        self.register(Arc::new(WebhookHandler)).await;
        self.register(Arc::new(KafkaTriggerHandler)).await;
        self.register(Arc::new(ScheduleHandler)).await;
        self.register(Arc::new(SubHandler)).await;        // Subscribe to Kafka (Trigger)
        
        // Extract
        self.register(Arc::new(ExtractHandler)).await;
        self.register(Arc::new(JsonPathHandler)).await;
        self.register(Arc::new(XPathHandler)).await;
        
        // Integration
        self.register(Arc::new(EventLogHandler)).await;
        self.register(Arc::new(AuditHandler)).await;
        self.register(Arc::new(DatabaseHandler)).await;
        self.register(Arc::new(CacheHandler)).await;
        
        // Actions
        self.register(Arc::new(ProxyHandler)).await;
        self.register(Arc::new(CallServiceHandler)).await;
        self.register(Arc::new(HttpCallHandler)).await;
        self.register(Arc::new(TransformHandler)).await;
        self.register(Arc::new(PubHandler)).await;        // Publish to Kafka
        self.register(Arc::new(ScriptHandler)).await;
        
        // Logic
        self.register(Arc::new(DecisionHandler)).await;
        self.register(Arc::new(SwitchHandler)).await;

        // Output
        self.register(Arc::new(ResponseHandler)).await;
        self.register(Arc::new(ErrorHandler)).await;
        self.register(Arc::new(EndHandler)).await;
        
        let count = self.list_types().await.len();
        info!("Registered {} built-in handlers", count);
    }
    
    /// Get registry statistics
    pub async fn stats(&self) -> RegistryStats {
        let handlers = self.handlers.read().await;
        RegistryStats {
            total_handlers: handlers.len(),
            by_category: self.count_by_category().await,
        }
    }
    
    async fn count_by_category(&self) -> HashMap<String, usize> {
        let metadata = self.metadata.read().await;
        let mut counts: HashMap<String, usize> = HashMap::new();
        
        for meta in metadata.values() {
            let category = meta.category.as_str().to_string();
            *counts.entry(category).or_insert(0) += 1;
        }
        
        counts
    }
}

/// Registry statistics
#[derive(Debug, Clone)]
pub struct RegistryStats {
    pub total_handlers: usize,
    pub by_category: HashMap<String, usize>,
}

impl Default for NodeRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Registry export for external tools
#[derive(Debug, Clone, serde::Serialize)]
pub struct RegistryExport {
    pub node_types: Vec<NodeTypeExport>,
    pub version: String,
    pub exported_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct NodeTypeExport {
    pub node_type: String,
    pub category: String,
    pub label: String,
    pub description: String,
    pub icon: String,
    pub color: String,
    pub version: String,
    pub config_schema: Option<Value>,
}

impl NodeRegistry {
    /// Export registry for frontend consumption
    pub async fn export(&self) -> RegistryExport {
        let metadata = self.metadata.read().await;
        let mut node_types = Vec::new();
        
        for (node_type, meta) in metadata.iter() {
            let schema = self.get_config_schema(node_type).await;
            node_types.push(NodeTypeExport {
                node_type: meta.node_type.clone(),
                category: meta.category.as_str().to_string(),
                label: meta.label.clone(),
                description: meta.description.clone(),
                icon: meta.icon.clone(),
                color: meta.color.clone(),
                version: meta.version.clone(),
                config_schema: schema,
            });
        }
        
        RegistryExport {
            node_types,
            version: env!("CARGO_PKG_VERSION").to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}
