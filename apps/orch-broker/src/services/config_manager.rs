// ==========================================
// Config Manager Service
// Loads Flow Configurations from the API
// ==========================================

use crate::config::system_config::attach_internal_token;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

/// Flow Configuration from the database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowConfig {
    pub id: String,
    pub name: String,
    pub trigger_type: String,
    pub trigger_config: Value,
    pub nodes: Value,
    pub edges: Value,
    pub is_active: bool,
    
    // NEW: Flow-Level Execution Strategy
    // "fast" = in-memory only, "reliable" = all through kafka, "custom" = configurable
    #[serde(default = "default_execution_strategy")]
    pub execution_strategy: String,
    
    // NEW: Custom Queue Configuration for "custom" strategy
    // { "type": "kafka" | "rabbitmq" | "sqs", "config": {...} }
    #[serde(default)]
    pub custom_queue_config: Option<Value>,
}

fn default_execution_strategy() -> String {
    "fast".to_string()
}

/// Execution Strategy for a Flow
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionStrategy {
    Fast,      // In-memory execution (no Kafka)
    Reliable,  // All nodes through Kafka (durable)
    Custom,    // Configurable per flow
}

impl From<&str> for ExecutionStrategy {
    fn from(value: &str) -> Self {
        match value.to_lowercase().as_str() {
            "reliable" => ExecutionStrategy::Reliable,
            "custom" => ExecutionStrategy::Custom,
            _ => ExecutionStrategy::Fast,
        }
    }
}

impl ExecutionStrategy {
    pub fn as_str(&self) -> &'static str {
        match self {
            ExecutionStrategy::Fast => "fast",
            ExecutionStrategy::Reliable => "reliable",
            ExecutionStrategy::Custom => "custom",
        }
    }
}

/// Config Manager - manages Flow configurations
pub struct ConfigManager {
    api_base_url: String,
    cache: Arc<DashMap<String, FlowConfig>>, // key = flow_id, local cache
    remote_cache: Arc<RwLock<std::collections::HashMap<String, FlowConfig>>>, // cache from the API
    http_client: reqwest::Client,
}

impl ConfigManager {
    pub fn new(api_base_url: &str) -> Self {
        Self {
            api_base_url: api_base_url.to_string(),
            cache: Arc::new(DashMap::new()),
            remote_cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
            http_client: reqwest::Client::new(),
        }
    }

    /// Deploy a flow into the local cache (called from deploy.rs)
    pub fn deploy_flow(&self, flow: FlowConfig) {
        info!("🚀 Deploying flow to local cache: {}", flow.id);
        self.cache.insert(flow.id.clone(), flow);
    }

    /// Undeploy a flow from the local cache
    pub fn undeploy_flow(&self, flow_id: &str) -> Option<FlowConfig> {
        info!("🗑️  Undeploying flow from local cache: {}", flow_id);
        self.cache.remove(flow_id).map(|(_, v)| v)
    }

    /// List all deployed flows from the local cache
    pub fn list_deployed_flows(&self) -> Vec<FlowConfig> {
        self.cache.iter().map(|entry| entry.value().clone()).collect()
    }

    /// Get a flow from the local cache (deployed flows)
    pub fn get_deployed_flow(&self, flow_id: &str) -> Option<FlowConfig> {
        self.cache.get(flow_id).map(|entry| entry.value().clone())
    }

    /// Resolve a flow for the REQUEST path: explicit deploy cache first, then
    /// the active-flows cache (rebuilt from the DB on startup + every 30s via
    /// refresh_cache). Unlike get_flow() this never fetches/executes an
    /// inactive flow. This is what makes an active + wired flow run after a
    /// broker restart WITHOUT a manual re-deploy — the in-memory deploy cache
    /// alone doesn't survive a pod restart, but the active-flows cache is
    /// reloaded from the DB on boot.
    pub async fn get_executable_flow(&self, flow_id: &str) -> Option<FlowConfig> {
        if let Some(flow) = self.cache.get(flow_id) {
            return Some(flow.value().clone());
        }
        let cache = self.remote_cache.read().await;
        cache.get(flow_id).cloned()
    }

    /// Fetch a flow config for execution (try the local cache first, then fall back to the API)
    pub async fn get_flow(&self, flow_id: &str) -> Option<FlowConfig> {
        // 1. Try local deployed cache first (from deploy.rs)
        if let Some(flow) = self.cache.get(flow_id) {
            return Some(flow.value().clone());
        }

        // 2. Try remote cache (from refresh_cache)
        {
            let cache = self.remote_cache.read().await;
            if let Some(flow) = cache.get(flow_id) {
                return Some(flow.clone());
            }
        }

        // 3. Fetch from API
        match self.fetch_flow(flow_id).await {
            Ok(Some(flow)) => {
                // Store in remote cache
                let mut cache = self.remote_cache.write().await;
                cache.insert(flow_id.to_string(), flow.clone());
                Some(flow)
            }
            Ok(None) => {
                warn!("Flow not found: {}", flow_id);
                None
            }
            Err(e) => {
                error!("Failed to fetch flow {}: {}", flow_id, e);
                None
            }
        }
    }

    /// Fetch a flow from the Next.js API
    async fn fetch_flow(&self, flow_id: &str) -> anyhow::Result<Option<FlowConfig>> {
        let url = format!("{}/api/flows/{}", self.api_base_url, flow_id);

        let response = attach_internal_token(self.http_client.get(&url))
            .send()
            .await?;

        if response.status() == 404 {
            return Ok(None);
        }

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("API error: {}", error_text));
        }

        let data: serde_json::Value = response.json().await?;
        
        // API returns { flow: {...} } or { ... } directly
        let flow_data = if let Some(flow) = data.get("flow") {
            flow
        } else {
            &data
        };

        Ok(Some(self.parse_flow_config(flow_data)?))
    }

    /// Parse a flow config from JSON
    fn parse_flow_config(&self, data: &serde_json::Value) -> anyhow::Result<FlowConfig> {
        Ok(FlowConfig {
            id: data["id"].as_str().unwrap_or("").to_string(),
            name: data["name"].as_str().unwrap_or("").to_string(),
            trigger_type: data["triggerType"].as_str().unwrap_or("HTTP").to_string(),
            trigger_config: data.get("triggerConfig").cloned().unwrap_or(serde_json::json!({})),
            nodes: data["nodes"].clone(),
            edges: data["edges"].clone(),
            is_active: data["isActive"].as_bool().unwrap_or(false),
            execution_strategy: data["executionStrategy"].as_str().unwrap_or("fast").to_string(),
            custom_queue_config: data.get("customQueueConfig").cloned(),
        })
    }

    /// Refresh the remote cache from the database (flows where isActive=true)
    pub async fn refresh_cache(&self) -> anyhow::Result<()> {
        info!("🔄 Refreshing flow config cache from API...");
        
        let url = format!("{}/api/flows?isActive=true&limit=1000", self.api_base_url);

        let response = attach_internal_token(self.http_client.get(&url))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to fetch flows: {}", response.status()));
        }

        let data: serde_json::Value = response.json().await?;
        
        // API returns { flows: [...] } or { data: [...] }
        let flows = if let Some(flows) = data.get("flows").and_then(|f| f.as_array()) {
            flows
        } else if let Some(flows) = data.get("data").and_then(|d| d.as_array()) {
            flows
        } else {
            return Err(anyhow::anyhow!("Unexpected API response format"));
        };
        
        let mut cache = self.remote_cache.write().await;
        cache.clear();
        
        for flow_data in flows {
            if let Ok(flow) = self.parse_flow_config(flow_data) {
                if flow.is_active {
                    cache.insert(flow.id.clone(), flow);
                }
            }
        }
        
        let deployed_count = self.cache.len();
        info!("✅ Flow config cache refreshed: {} active flows from API, {} deployed locally", 
            cache.len(), deployed_count);
        Ok(())
    }

    /// Get total cache size (local + remote)
    pub async fn cache_size(&self) -> usize {
        let remote_size = self.remote_cache.read().await.len();
        self.cache.len() + remote_size
    }

    /// Find a flow by path pattern (search the local cache first, then the remote cache)
    pub async fn find_flow_by_path(&self, path: &str, method: &str) -> Option<FlowConfig> {
        // 1. Search local deployed cache first
        for entry in self.cache.iter() {
            let flow = entry.value();
            if !flow.is_active {
                continue;
            }
            
            if let Some(trigger_path) = flow.trigger_config.get("path").and_then(|p| p.as_str()) {
                if self.path_matches(trigger_path, path) {
                    if let Some(trigger_method) = flow.trigger_config.get("method").and_then(|m| m.as_str()) {
                        if trigger_method.to_uppercase() != method.to_uppercase() {
                            continue;
                        }
                    }
                    return Some(flow.clone());
                }
            }
        }

        // 2. Search remote cache
        let cache = self.remote_cache.read().await;
        for (_, flow) in cache.iter() {
            if !flow.is_active {
                continue;
            }
            
            if let Some(trigger_path) = flow.trigger_config.get("path").and_then(|p| p.as_str()) {
                if self.path_matches(trigger_path, path) {
                    if let Some(trigger_method) = flow.trigger_config.get("method").and_then(|m| m.as_str()) {
                        if trigger_method.to_uppercase() != method.to_uppercase() {
                            continue;
                        }
                    }
                    return Some(flow.clone());
                }
            }
        }
        
        None
    }

    /// Check whether the path matches the pattern
    fn path_matches(&self, pattern: &str, path: &str) -> bool {
        // Exact match
        if pattern == path {
            return true;
        }

        // Wildcard: /api/v1/payments/*
        if pattern.ends_with("/*") {
            let prefix = &pattern[..pattern.len()-1];
            return path.starts_with(prefix);
        }

        // Path params: /api/v1/payments/:id
        if pattern.contains("/:") {
            let pattern_parts: Vec<&str> = pattern.split('/').collect();
            let path_parts: Vec<&str> = path.split('/').collect();

            if pattern_parts.len() != path_parts.len() {
                return false;
            }

            return pattern_parts.iter().enumerate().all(|(i, part)| {
                if part.starts_with(':') {
                    true // Path param matches anything
                } else {
                    part == &path_parts[i]
                }
            });
        }

        false
    }
}
