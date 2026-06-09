// ==========================================
// Flow Resolver Service
// Resolves a Flow from the incoming request Path
// ==========================================

use crate::config::system_config::attach_internal_token;
use crate::config::FlowConfig;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

/// Trigger Configuration from a Flow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerConfig {
    pub path: String,
    pub method: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// Flow Resolver - handles resolving a Flow from a Path
pub struct FlowResolver {
    api_base_url: String,
    cache: Arc<RwLock<HashMap<String, FlowConfig>>>,
    http_client: reqwest::Client,
}

impl FlowResolver {
    /// Create a new Flow Resolver
    pub fn new(api_base_url: &str) -> Self {
        Self {
            api_base_url: api_base_url.to_string(),
            cache: Arc::new(RwLock::new(HashMap::new())),
            http_client: reqwest::Client::new(),
        }
    }

    /// Resolve a Flow from path and method
    pub async fn resolve_flow(&self, path: &str, method: &str) -> anyhow::Result<Option<FlowConfig>> {
        // 1. Try the cache first
        {
            let cache = self.cache.read().await;

            // Find a flow that matches the path pattern
            for (flow_id, flow) in cache.iter() {
                if let Some(trigger) = self.extract_trigger_config(flow) {
                    if self.path_matches(&trigger.path, path) && 
                       self.method_matches(&trigger.method, method) {
                        info!("Flow found in cache: {} for {} {}", flow_id, method, path);
                        return Ok(Some(flow.clone()));
                    }
                }
            }
        }

        // 2. If not found in cache, fetch from the API
        info!("Flow not in cache, fetching from API: {} {}", method, path);

        match self.fetch_flow_from_api(path, method).await {
            Ok(Some(flow)) => {
                // Store in cache
                let mut cache = self.cache.write().await;
                cache.insert(flow.id.clone(), flow.clone());
                Ok(Some(flow))
            }
            Ok(None) => {
                warn!("No flow found for {} {}", method, path);
                Ok(None)
            }
            Err(e) => {
                error!("Failed to fetch flow from API: {}", e);
                Err(e)
            }
        }
    }

    /// Fetch a flow from the API
    async fn fetch_flow_from_api(&self, path: &str, method: &str) -> anyhow::Result<Option<FlowConfig>> {
        let url = format!("{}/api/flows/trigger-config", self.api_base_url);

        let response = attach_internal_token(self.http_client.get(&url))
            .query(&[("path", path), ("method", method)])
            .send()
            .await?;

        if response.status() == 404 {
            return Ok(None);
        }

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("API error: {}", error_text));
        }

        let api_response: serde_json::Value = response.json().await?;
        
        // Parse the flow from the API response
        if let Some(flow_data) = api_response.get("data") {
            let flow = self.parse_flow_from_api(flow_data)?;
            return Ok(Some(flow));
        }

        Ok(None)
    }

    /// Parse a flow from the API response
    fn parse_flow_from_api(&self, data: &serde_json::Value) -> anyhow::Result<FlowConfig> {
        let id = data["id"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing flow id"))?
            .to_string();
        
        let name = data["name"]
            .as_str()
            .unwrap_or(&id)
            .to_string();

        let execution_mode = data["executionMode"]
            .as_str()
            .unwrap_or("sync")
            .to_string();

        let nodes: Vec<crate::config::FlowNode> = serde_json::from_value(
            data["nodes"].clone()
        )?;

        let edges: Vec<crate::config::FlowEdge> = serde_json::from_value(
            data["edges"].clone()
        )?;

        Ok(FlowConfig {
            id,
            name,
            description: None,
            flow_type: "API_GATEWAY".to_string(),
            execution_mode,
            async_config: None,
            nodes,
            edges,
            is_active: true,
            deployed_at: None,
        })
    }

    /// Extract trigger config from a flow
    fn extract_trigger_config(&self, flow: &FlowConfig) -> Option<TriggerConfig> {
        // Find the trigger node (the first node that is an HTTP trigger)
        for node in &flow.nodes {
            if node.node_type == "httpRequest" || node.node_type == "trigger" {
                // Read the config from the node data
                if let Ok(config) = serde_json::from_value::<TriggerConfig>(node.data.clone()) {
                    return Some(config);
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

        // Wildcard match: /api/v1/payments/*
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

    /// Check whether the method matches
    fn method_matches(&self, flow_method: &str, request_method: &str) -> bool {
        let flow = flow_method.to_uppercase();
        let request = request_method.to_uppercase();
        
        flow == "ANY" || flow == request
    }

    /// Refresh the entire cache
    pub async fn refresh_cache(&self) -> anyhow::Result<()> {
        info!("Refreshing flow cache...");
        
        let mut cache = self.cache.write().await;
        cache.clear();
        
        info!("Flow cache cleared");
        Ok(())
    }

    /// Pre-load flows into the cache
    pub async fn preload_flows(&self) -> anyhow::Result<()> {
        info!("Pre-loading flows...");

        // Fetch all active flows and store them in the cache
        let url = format!("{}/api/flows?isActive=true", self.api_base_url);

        let response = attach_internal_token(self.http_client.get(&url))
            .send()
            .await?;

        if !response.status().is_success() {
            warn!("Failed to preload flows: {}", response.status());
            return Ok(());
        }

        let api_response: serde_json::Value = response.json().await?;
        
        if let Some(flows) = api_response.get("data").and_then(|d| d.as_array()) {
            let mut cache = self.cache.write().await;
            
            for flow_data in flows {
                if let Ok(flow) = self.parse_flow_from_api(flow_data) {
                    cache.insert(flow.id.clone(), flow);
                }
            }
            
            info!("Pre-loaded {} flows into cache", cache.len());
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_matching() {
        let resolver = FlowResolver::new("http://localhost:3047");
        
        // Exact match
        assert!(resolver.path_matches("/api/v1/payments", "/api/v1/payments"));
        
        // Wildcard
        assert!(resolver.path_matches("/api/v1/payments/*", "/api/v1/payments/123"));
        assert!(resolver.path_matches("/api/v1/*", "/api/v1/payments/123"));
        
        // Path params
        assert!(resolver.path_matches("/api/v1/payments/:id", "/api/v1/payments/123"));
        assert!(!resolver.path_matches("/api/v1/payments/:id", "/api/v1/payments/123/details"));
        
        // No match
        assert!(!resolver.path_matches("/api/v1/payments", "/api/v1/users"));
    }

    #[test]
    fn test_method_matching() {
        let resolver = FlowResolver::new("http://localhost:3047");
        
        assert!(resolver.method_matches("ANY", "GET"));
        assert!(resolver.method_matches("ANY", "POST"));
        assert!(resolver.method_matches("POST", "POST"));
        assert!(!resolver.method_matches("GET", "POST"));
    }
}
