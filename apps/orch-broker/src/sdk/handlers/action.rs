// ==========================================
// Action Node Handlers
// Proxy HTTP, Call Service, Transform, Pub/Sub, Script
// ==========================================

use std::sync::Arc;
use serde_json::{json, Value};

use crate::sdk::{NodeHandler, NodeMetadata, NodeCategory, NodeResult, ExecutionContext, ValidationError, ExecutionError};

/// Proxy HTTP Handler
pub struct ProxyHandler;

impl NodeHandler for ProxyHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "proxy".to_string(),
            category: NodeCategory::Action,
            label: "Proxy HTTP".to_string(),
            description: "Forward request to backend service".to_string(),
            icon: "P".to_string(),
            color: "#059669".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("targetUrl").is_none() && config.get("service").is_none() {
            errors.push(ValidationError {
                field: "targetUrl".to_string(),
                message: "Target URL or service name is required".to_string(),
            });
        }
        
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let target_url = config["targetUrl"]
                .as_str()
                .map(|s| ctx.substitute_template(s))
                .unwrap_or_else(|| ctx.backend_url.clone());
            
            let method = config["method"]
                .as_str()
                .unwrap_or_else(|| &ctx.request.method)
                .to_uppercase();
            
            let raw_timeout = config["timeout"].as_u64().unwrap_or(30000);
            // If timeout < 1000, treat as seconds (flow config uses seconds); otherwise milliseconds
            let timeout_ms = if raw_timeout > 0 && raw_timeout < 1000 { raw_timeout * 1000 } else { raw_timeout };

            tracing::info!("Proxy: {} {} (timeout: {}ms)", method, target_url, timeout_ms);

            // Circuit Breaker check (key = target URL host)
            let cb_key = crate::services::circuit_breaker::CircuitBreaker::key_from_url(&target_url);
            let cb = crate::services::circuit_breaker::global();
            let cb_state = cb.check(&cb_key);
            if matches!(cb_state, crate::services::circuit_breaker::CircuitState::Open) {
                tracing::warn!("Proxy: circuit breaker OPEN for {} — returning 503", cb_key);
                return Err(ExecutionError::new(
                    "CIRCUIT_OPEN",
                    &format!("Service Unavailable: circuit breaker open for {}", cb_key),
                )
                .with_details(json!({
                    "statusCode": 503,
                    "host": cb_key,
                    "state": "open",
                })));
            }

            // Body resolution priority (fixes HTTP proxy mangling when flow has audit/event nodes):
            // 1. forwardBody=true (from flow config) → use ORIGINAL request body from ctx.request.body
            //    (critical: intermediate nodes like Event Log, Audit Trail produce their own output
            //     which would otherwise replace the body when useInput=true default)
            // 2. useInput=true (legacy default) → use previous node's output as body
            // 3. config.body static → use fixed body
            let forward_original = config.get("forwardBody")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let body = if forward_original {
                ctx.request.body.clone().unwrap_or(json!({}))
            } else if config.get("useInput").and_then(|v| v.as_bool()).unwrap_or(true) {
                input.clone()
            } else {
                config.get("body").cloned().unwrap_or(json!({}))
            };
            
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_millis(timeout_ms))
                .build()
                .map_err(|e| ExecutionError::new("HTTP_ERROR", &e.to_string()))?;
            
            let mut request_builder = match method.as_str() {
                "GET" => client.get(&target_url),
                "POST" => client.post(&target_url),
                "PUT" => client.put(&target_url),
                "PATCH" => client.patch(&target_url),
                "DELETE" => client.delete(&target_url),
                _ => client.get(&target_url),
            };
            
            if let Some(headers) = config["headers"].as_object() {
                for (key, value) in headers {
                    if let Some(val_str) = value.as_str() {
                        request_builder = request_builder.header(key, val_str);
                    }
                }
            }
            
            let headers_to_forward = ["authorization", "content-type", "x-request-id"];
            for header in &headers_to_forward {
                if let Some(value) = ctx.request.headers.get(*header) {
                    request_builder = request_builder.header(*header, value);
                }
            }
            
            if method != "GET" && method != "DELETE" {
                request_builder = request_builder.json(&body);
            }
            
            let start = std::time::Instant::now();
            let response = match request_builder.send().await {
                Ok(r) => r,
                Err(e) => {
                    cb.record_failure(&cb_key);
                    return Err(ExecutionError::new("PROXY_ERROR", &e.to_string()));
                }
            };

            let duration_ms = start.elapsed().as_millis() as u64;
            let status = response.status().as_u16();

            // Treat 5xx as failures for circuit breaker
            if status >= 500 {
                cb.record_failure(&cb_key);
            } else {
                cb.record_success(&cb_key);
            }

            let response_body = response.json::<Value>().await
                .unwrap_or_else(|_| json!({}));
            
            let result = json!({
                "statusCode": status,
                "headers": {},
                "body": response_body.clone(),
                "durationMs": duration_ms,
                "targetUrl": target_url,
            });
            
            ctx.set_flow("proxy.response", response_body.clone());
            ctx.set_flow("proxy.statusCode", json!(status));
            ctx.set_flow("proxy.durationMs", json!(duration_ms));
            
            tracing::info!("Proxy completed: {} in {}ms", status, duration_ms);
            
            Ok(result)
        })
    }
}

/// User info extracted from JWT token
#[derive(Debug, Clone)]
struct UserInfo {
    user_id: String,
    username: String,
    email: Option<String>,
    roles: Option<String>,
}

/// Extract user info from JWT Bearer token
fn extract_user_info_from_token(ctx: &crate::sdk::ExecutionContext) -> Option<UserInfo> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    
    // Get Authorization header
    let auth_header = ctx.request.headers.get("authorization")?;
    
    // Extract Bearer token
    let token = if auth_header.to_lowercase().starts_with("bearer ") {
        &auth_header[7..]
    } else {
        return None;
    };
    
    // JWT format: header.payload.signature
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    
    // Decode payload (base64url)
    let payload_bytes = URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
    let payload_str = std::str::from_utf8(&payload_bytes).ok()?;
    let payload: Value = serde_json::from_str(payload_str).ok()?;
    
    // Extract claims (Keycloak/JWT standard claims)
    let user_id = payload["sub"].as_str()
        .or_else(|| payload["user_id"].as_str())
        .or_else(|| payload["id"].as_str())?
        .to_string();
    
    let username = payload["preferred_username"].as_str()
        .or_else(|| payload["username"].as_str())
        .or_else(|| payload["sub"].as_str())?
        .to_string();
    
    let email = payload["email"].as_str().map(|s| s.to_string());
    
    // Extract roles (Keycloak format or standard JWT)
    let roles = if let Some(realm_access) = payload["realm_access"]["roles"].as_array() {
        // Keycloak realm roles
        Some(realm_access.iter()
            .filter_map(|r| r.as_str())
            .collect::<Vec<_>>()
            .join(","))
    } else if let Some(roles_array) = payload["roles"].as_array() {
        // Standard JWT roles array
        Some(roles_array.iter()
            .filter_map(|r| r.as_str())
            .collect::<Vec<_>>()
            .join(","))
    } else if let Some(roles_str) = payload["roles"].as_str() {
        Some(roles_str.to_string())
    } else {
        None
    };
    
    Some(UserInfo {
        user_id,
        username,
        email,
        roles,
    })
}

/// Call Service Handler - Call internal/external services via HTTP
/// Supports service discovery from environment variables or direct URL
pub struct CallServiceHandler;

impl CallServiceHandler {
    /// Resolve service URL from service name
    fn resolve_service_url(&self, service: &str, config: &Value) -> Option<String> {
        // 1. Direct URL in config
        if let Some(url) = config["url"].as_str() {
            return Some(url.to_string());
        }
        
        // 2. Environment variable: SERVICE_PAYMENT_API_URL
        let env_key = format!("SERVICE_{}_URL", service.to_uppercase().replace("-", "_"));
        if let Ok(url) = std::env::var(&env_key) {
            return Some(url);
        }
        
        // 3. Service registry from env: SERVICE_REGISTRY=s1=http://host:port,s2=http://host2
        if let Ok(registry) = std::env::var("SERVICE_REGISTRY") {
            for line in registry.split(',') {
                let parts: Vec<&str> = line.splitn(2, '=').collect();
                if parts.len() == 2 && parts[0].trim() == service {
                    return Some(parts[1].trim().to_string());
                }
            }
        }
        
        // 4. Default for development
        Some(format!("http://localhost:8080"))
    }
    
    fn build_url(&self, base_url: &str, endpoint: &str) -> String {
        let base = base_url.trim_end_matches('/');
        let path = endpoint.trim_start_matches('/');
        format!("{}/{}", base, path)
    }
}

impl NodeHandler for CallServiceHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "callService".to_string(),
            category: NodeCategory::Action,
            label: "Call Service".to_string(),
            description: "Call internal/external HTTP service with service discovery".to_string(),
            icon: "S".to_string(),
            color: "#059669".to_string(),
            version: "2.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("service").is_none() && config.get("url").is_none() {
            errors.push(ValidationError {
                field: "service".to_string(),
                message: "Service name or URL is required".to_string(),
            });
        }
        
        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }
    
    fn config_schema(&self) -> Option<Value> {
        Some(json!({
            "type": "object",
            "properties": {
                "service": { "type": "string", "description": "Service name" },
                "url": { "type": "string", "description": "Direct URL (overrides service discovery)" },
                "endpoint": { "type": "string", "default": "/" },
                "method": { "type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"], "default": "GET" },
                "headers": { "type": "object" },
                "timeout": { "type": "integer", "default": 30 },
                "retry": { "type": "integer", "default": 3 },
                "executionMode": { "type": "string", "enum": ["sync", "async"], "default": "sync" },
                "forwardAuth": { 
                    "type": "boolean", 
                    "default": true,
                    "description": "Forward Authorization header (Bearer token)"
                },
                "forwardUserInfo": { 
                    "type": "boolean", 
                    "default": false,
                    "description": "Forward user info as X-Forwarded-* headers (Keycloak/Spring Security)"
                },
                "forwardCookies": { 
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Cookie names to forward (e.g., KEYCLOAK_SESSION, JSESSIONID)"
                }
            }
        }))
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let service = config["service"].as_str().unwrap_or("");
            let endpoint = config["endpoint"].as_str().unwrap_or("/");
            let method = config["method"].as_str().unwrap_or("GET").to_uppercase();
            let timeout_secs = config["timeout"].as_u64().unwrap_or(30);
            let max_retries = config["retry"].as_u64().unwrap_or(3) as usize;
            
            let base_url = match self.resolve_service_url(service, config) {
                Some(url) => url,
                None => return Err(ExecutionError::new("SERVICE_NOT_FOUND", &format!("Could not resolve: {}", service))),
            };
            
            let url = self.build_url(&base_url, endpoint);
            tracing::info!("Call Service: {} {} (timeout: {}s)", method, url, timeout_secs);
            
            let body = if config.get("useInput").and_then(|v| v.as_bool()).unwrap_or(true) {
                input.clone()
            } else {
                config.get("body").cloned().unwrap_or(json!({}))
            };
            
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(timeout_secs))
                .build()
                .map_err(|e| ExecutionError::new("HTTP_ERROR", &e.to_string()))?;
            
            // Retry loop
            let mut last_error = None;
            for attempt in 1..=max_retries + 1 {
                let mut req = match method.as_str() {
                    "GET" => client.get(&url),
                    "POST" => client.post(&url),
                    "PUT" => client.put(&url),
                    "PATCH" => client.patch(&url),
                    "DELETE" => client.delete(&url),
                    _ => client.get(&url),
                };
                
                // Headers from config
                if let Some(headers) = config["headers"].as_object() {
                    for (k, v) in headers {
                        if let Some(vs) = v.as_str() {
                            req = req.header(k, ctx.substitute_template(vs));
                        }
                    }
                }
                
                // Forward Authorization header (Bearer token from Keycloak/OIDC)
                let forward_auth = config["forwardAuth"].as_bool().unwrap_or(true);
                if forward_auth {
                    if let Some(auth) = ctx.request.headers.get("authorization") {
                        req = req.header("Authorization", auth);
                        tracing::debug!("Forwarded Authorization header");
                    }
                }
                
                // Forward Keycloak/UserInfo headers for Spring Security
                let forward_user_info = config["forwardUserInfo"].as_bool().unwrap_or(false);
                if forward_user_info {
                    // Try to extract user info from JWT token if available
                    let user_info = extract_user_info_from_token(&ctx);
                    
                    // Forward extracted or existing user info
                    if let Some(ref info) = user_info {
                        req = req.header("X-Forwarded-User", &info.user_id);
                        req = req.header("X-Forwarded-Username", &info.username);
                        if let Some(ref email) = info.email {
                            req = req.header("X-Forwarded-Email", email);
                        }
                        if let Some(ref roles) = info.roles {
                            req = req.header("X-Forwarded-Roles", roles);
                        }
                        tracing::debug!("Forwarded user info from JWT: user_id={}, username={}", info.user_id, info.username);
                    } else {
                        // Fallback to existing headers
                        if let Some(user_id) = ctx.request.headers.get("x-user-id") {
                            req = req.header("X-Forwarded-User", user_id);
                        }
                        if let Some(username) = ctx.request.headers.get("x-username") {
                            req = req.header("X-Forwarded-Username", username);
                        }
                        if let Some(email) = ctx.request.headers.get("x-user-email") {
                            req = req.header("X-Forwarded-Email", email);
                        }
                        if let Some(roles) = ctx.request.headers.get("x-user-roles") {
                            req = req.header("X-Forwarded-Roles", roles);
                        }
                        if let Some(realm) = ctx.request.headers.get("x-realm") {
                            req = req.header("X-Forwarded-Realm", realm);
                        }
                    }
                }
                
                // Forward specified cookies (e.g., KEYCLOAK_SESSION, JSESSIONID)
                if let Some(cookie_names) = config["forwardCookies"].as_array() {
                    if let Some(cookie_header) = ctx.request.headers.get("cookie") {
                        let cookies: Vec<&str> = cookie_header.split(';').collect();
                        let mut forwarded_cookies = Vec::new();
                        
                        for name in cookie_names {
                            if let Some(cookie_name) = name.as_str() {
                                for cookie in &cookies {
                                    let cookie = cookie.trim();
                                    if cookie.starts_with(&format!("{}=", cookie_name)) {
                                        forwarded_cookies.push(cookie.to_string());
                                    }
                                }
                            }
                        }
                        
                        if !forwarded_cookies.is_empty() {
                            req = req.header("Cookie", forwarded_cookies.join("; "));
                            tracing::debug!("Forwarded cookies: {:?}", forwarded_cookies);
                        }
                    }
                }
                
                if method != "GET" && method != "DELETE" {
                    req = req.json(&body);
                }
                
                let start = std::time::Instant::now();
                match req.send().await {
                    Ok(resp) => {
                        let status = resp.status().as_u16();
                        let body = resp.json::<Value>().await.unwrap_or(json!(null));
                        let duration = start.elapsed().as_millis() as u64;
                        
                        tracing::info!("Service call success: {} ({}ms)", status, duration);
                        
                        let result = json!({
                            "success": true,
                            "service": service,
                            "url": url,
                            "statusCode": status,
                            "body": body,
                            "durationMs": duration,
                            "attempts": attempt,
                        });
                        
                        ctx.set_flow(&format!("service.{}", service), result.clone());
                        return Ok(result);
                    }
                    Err(e) => {
                        last_error = Some(e);
                        if attempt <= max_retries {
                            tokio::time::sleep(std::time::Duration::from_millis(100 * attempt as u64)).await;
                        }
                    }
                }
            }
            
            Err(ExecutionError::new("SERVICE_CALL_FAILED", &format!("Failed after {} attempts: {:?}", max_retries + 1, last_error)))
        })
    }
}

/// HTTP Call Handler - call HTTP API directly
pub struct HttpCallHandler;

impl NodeHandler for HttpCallHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "httpCall".to_string(),
            category: NodeCategory::Action,
            label: "HTTP Call".to_string(),
            description: "Call external HTTP API directly".to_string(),
            icon: "H".to_string(),
            color: "#059669".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("url").is_none() {
            errors.push(ValidationError {
                field: "url".to_string(),
                message: "URL is required".to_string(),
            });
        }
        
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let url = config["url"].as_str().unwrap_or("");
            let method = config["method"].as_str().unwrap_or("GET").to_uppercase();
            let timeout_ms = config["timeout"].as_u64().unwrap_or(30000);
            
            tracing::info!("HTTP Call raw URL from config: '{}'", url);
            
            // Support template substitution for URL
            let url = ctx.substitute_template(url);
            
            tracing::info!("HTTP Call: {} {} (timeout: {}ms)", method, url, timeout_ms);
            
            if url.is_empty() {
                return Err(ExecutionError::new("HTTP_CONFIG_ERROR", "URL is empty"));
            }
            
            // Build body
            let body = if config.get("useInput").and_then(|v| v.as_bool()).unwrap_or(false) {
                input.clone()
            } else {
                config.get("body").cloned().unwrap_or(json!({}))
            };
            
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_millis(timeout_ms))
                .build()
                .map_err(|e| ExecutionError::new("HTTP_ERROR", &e.to_string()))?;
            
            let mut request_builder = match method.as_str() {
                "GET" => client.get(&url),
                "POST" => client.post(&url),
                "PUT" => client.put(&url),
                "PATCH" => client.patch(&url),
                "DELETE" => client.delete(&url),
                _ => client.get(&url),
            };
            
            // Add custom headers
            if let Some(headers) = config["headers"].as_object() {
                for (key, value) in headers {
                    if let Some(val_str) = value.as_str() {
                        let substituted = ctx.substitute_template(val_str);
                        request_builder = request_builder.header(key, substituted);
                    }
                }
            }
            
            // Add body for non-GET methods
            if method != "GET" && method != "DELETE" {
                request_builder = request_builder.json(&body);
            }
            
            let start = std::time::Instant::now();
            let response = request_builder.send().await
                .map_err(|e| ExecutionError::new("HTTP_CALL_ERROR", &e.to_string()))?;
            
            let duration_ms = start.elapsed().as_millis() as u64;
            let status = response.status().as_u16();
            
            // Try to parse as JSON, fallback to text
            let response_text = response.text().await
                .map_err(|e| ExecutionError::new("HTTP_READ_ERROR", &e.to_string()))?;
            
            let response_body: Value = serde_json::from_str(&response_text)
                .unwrap_or_else(|_| json!(response_text));
            
            let result = json!({
                "statusCode": status,
                "body": response_body,
                "durationMs": duration_ms,
                "url": url,
                "method": method,
            });
            
            ctx.set_flow(&format!("http.{}.response", method.to_lowercase()), response_body.clone());
            ctx.set_flow(&format!("http.{}.statusCode", method.to_lowercase()), json!(status));
            
            tracing::info!("HTTP Call completed: {} in {}ms", status, duration_ms);
            
            Ok(result)
        })
    }
}

/// Transform Handler
pub struct TransformHandler;

impl NodeHandler for TransformHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "transform".to_string(),
            category: NodeCategory::Action,
            label: "Transform".to_string(),
            description: "Transform/map data structure".to_string(),
            icon: "T".to_string(),
            color: "#059669".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("mappings").is_none() && config.get("template").is_none() {
            errors.push(ValidationError {
                field: "mappings".to_string(),
                message: "Mappings or template is required".to_string(),
            });
        }
        
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let mut result = serde_json::Map::new();
            
            if let Some(mappings) = config["mappings"].as_object() {
                for (key, mapping) in mappings {
                    let value = if let Some(source) = mapping["source"].as_str() {
                        get_value_by_path(input, source)
                            .or_else(|| ctx.get(source).cloned())
                            .unwrap_or_else(|| mapping["default"].clone())
                    } else if let Some(template) = mapping["template"].as_str() {
                        json!(ctx.substitute_template(template))
                    } else {
                        mapping.clone()
                    };
                    
                    result.insert(key.clone(), value);
                }
            }
            
            if let Some(template) = config["template"].as_object() {
                for (key, template_str) in template {
                    if let Some(tpl) = template_str.as_str() {
                        result.insert(key.clone(), json!(ctx.substitute_template(tpl)));
                    }
                }
            }
            
            let output = Value::Object(result);
            ctx.set_flow("transform.output", output.clone());
            
            Ok(output)
        })
    }
}

/// Pub (Publish) Handler - Publish message to Kafka topic (Output node)
pub struct PubHandler;

impl NodeHandler for PubHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "pub".to_string(),
            category: NodeCategory::Action,
            label: "Publish".to_string(),
            description: "Publish message to Kafka topic".to_string(),
            icon: "P".to_string(),
            color: "#059669".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("topic").is_none() {
            errors.push(ValidationError {
                field: "topic".to_string(),
                message: "Topic name is required".to_string(),
            });
        }
        
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let topic = config["topic"]
                .as_str()
                .unwrap_or("default");
            
            let message = if config.get("useInput").and_then(|v| v.as_bool()).unwrap_or(true) {
                input.clone()
            } else {
                config.get("message").cloned().unwrap_or(input.clone())
            };
            
            tracing::info!("Publishing to topic: {}", topic);
            
            // Publish directly to Kafka (always sync - it's an output action)
            if let Some(kafka) = crate::services::kafka_pipeline::get_kafka_producer() {
                let payload = serde_json::to_string(&message)
                    .map_err(|e| ExecutionError::new("SERIALIZE_ERROR", &e.to_string()))?;
                
                match kafka.send_message(topic, &ctx.request_id, &payload).await {
                    Ok((partition, offset)) => {
                        tracing::info!(
                            "Published to Kafka: topic={}, partition={}, offset={}",
                            topic, partition, offset
                        );
                        
                        let result = json!({
                            "published": true,
                            "topic": topic,
                            "messageId": format!("{}-{}", ctx.request_id, chrono::Utc::now().timestamp_millis()),
                            "kafkaPartition": partition,
                            "kafkaOffset": offset,
                        });
                        
                        ctx.set_flow(&format!("pub.{}.lastPublish", topic), result.clone());
                        Ok(result)
                    }
                    Err(e) => {
                        let error_msg = format!("{}", e);
                        tracing::error!("Failed to publish to Kafka: {}", error_msg);
                        Err(ExecutionError::new("KAFKA_ERROR", &error_msg))
                    }
                }
            } else {
                // Fallback: mock mode (for development without Kafka)
                tracing::warn!("Kafka not available, using mock mode");
                
                let result = json!({
                    "published": true,
                    "topic": topic,
                    "messageId": format!("{}-{}", ctx.request_id, chrono::Utc::now().timestamp_millis()),
                    "mock": true,
                    "warning": "Kafka not available, message not actually sent"
                });
                
                ctx.set_flow(&format!("pub.{}.lastPublish", topic), result.clone());
                Ok(result)
            }
        })
    }
}

/// Sub (Subscribe) Handler - Subscribe to Kafka topic and trigger flow (Trigger node)
/// This is used as a trigger node to start flows from Kafka messages
pub struct SubHandler;

impl NodeHandler for SubHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "sub".to_string(),
            category: NodeCategory::Trigger,  // Trigger node, not Action
            label: "Subscribe".to_string(),
            description: "Subscribe to Kafka topic to trigger flow execution".to_string(),
            icon: "S".to_string(),
            color: "#7c3aed".to_string(),  // Purple for trigger nodes
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("topic").is_none() {
            errors.push(ValidationError {
                field: "topic".to_string(),
                message: "Topic name to subscribe is required".to_string(),
            });
        }
        
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let topic = config["topic"]
                .as_str()
                .unwrap_or("default");
            
            tracing::info!("Subscribing to topic: {}", topic);
            
            // Sub node should be used as a trigger, not as a regular action
            // When executed, it just passes through the input (which would be the Kafka message)
            let result = json!({
                "subscribed": true,
                "topic": topic,
                "message": input,
                "note": "Subscribe node should be used as a flow trigger"
            });
            
            ctx.set_flow(&format!("sub.{}.lastMessage", topic), result.clone());
            Ok(result)
        })
    }
}

/// Script Handler (JavaScript/Python)
pub struct ScriptHandler;

impl NodeHandler for ScriptHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "script".to_string(),
            category: NodeCategory::Action,
            label: "Script".to_string(),
            description: "Execute custom code".to_string(),
            icon: "JS".to_string(),
            color: "#059669".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("code").is_none() {
            errors.push(ValidationError {
                field: "code".to_string(),
                message: "Script code is required".to_string(),
            });
        }
        
        let language = config["language"].as_str().unwrap_or("javascript");
        if !["javascript", "python", "lua"].contains(&language) {
            errors.push(ValidationError {
                field: "language".to_string(),
                message: "Unsupported language (javascript/python/lua)".to_string(),
            });
        }
        
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let code = config["code"].as_str().unwrap_or("");
            let language = config["language"].as_str().unwrap_or("javascript");

            tracing::info!("Script: executing {} ({} chars)", language, code.len());

            match language {
                "javascript" => {
                    let code_owned = code.to_string();
                    let input_clone = input.clone();
                    let flow_vars = json!({});

                    let js_result = tokio::task::spawn_blocking(move || {
                        execute_javascript(&code_owned, &input_clone, &flow_vars)
                    }).await
                        .map_err(|e| ExecutionError::new("SCRIPT_ERROR", &format!("Task join error: {}", e)))?;

                    match js_result {
                        Ok(output) => {
                            let result = json!({
                                "executed": true,
                                "language": "javascript",
                                "output": output,
                            });
                            ctx.set_flow("script.lastResult", result.clone());
                            Ok(result)
                        }
                        Err(err) => {
                            Err(ExecutionError::new("SCRIPT_ERROR", &err))
                        }
                    }
                }
                _ => {
                    let result = json!({
                        "executed": false,
                        "language": language,
                        "note": format!("{} runtime not yet supported. Use JavaScript.", language),
                    });
                    ctx.set_flow("script.lastResult", result.clone());
                    Ok(result)
                }
            }
        })
    }
}

/// Execute JavaScript code using QuickJS (rquickjs)
/// Sandboxed: no network, no filesystem, memory limited
fn execute_javascript(code: &str, input: &Value, ctx_vars: &Value) -> Result<Value, String> {
    use rquickjs::{Runtime, Context, Value as JsValue};

    let rt = Runtime::new().map_err(|e| format!("Failed to create JS runtime: {}", e))?;
    rt.set_memory_limit(8 * 1024 * 1024); // 8MB memory limit
    rt.set_max_stack_size(512 * 1024);     // 512KB stack

    let ctx = Context::full(&rt).map_err(|e| format!("Failed to create JS context: {}", e))?;

    ctx.with(|ctx| {
        let globals = ctx.globals();

        // Inject input and ctx as JSON strings, then parse in JS
        let input_json = serde_json::to_string(input).unwrap_or_default();
        let ctx_json = serde_json::to_string(ctx_vars).unwrap_or_default();

        let bootstrap = format!(
            r#"var input = JSON.parse('{}'); var ctx = JSON.parse('{}');"#,
            input_json.replace('\\', "\\\\").replace('\'', "\\'"),
            ctx_json.replace('\\', "\\\\").replace('\'', "\\'"),
        );

        // Execute bootstrap to set up globals
        ctx.eval::<(), _>(bootstrap.as_bytes())
            .map_err(|e| format!("JS bootstrap error: {}", e))?;

        // Execute user code wrapped in an IIFE
        let wrapped = format!("(function() {{ {} }})()", code);
        let result: JsValue = ctx.eval(wrapped.as_bytes())
            .map_err(|e| format!("JS execution error: {}", e))?;

        // Convert JS result back to serde_json::Value
        js_to_json(&ctx, result)
    })
}

/// Convert a QuickJS value to serde_json::Value
fn js_to_json<'a>(ctx: &rquickjs::Ctx<'a>, val: rquickjs::Value<'a>) -> Result<Value, String> {
    if val.is_undefined() || val.is_null() {
        Ok(Value::Null)
    } else if let Some(b) = val.as_bool() {
        Ok(json!(b))
    } else if let Some(n) = val.as_int() {
        Ok(json!(n))
    } else if let Some(n) = val.as_float() {
        Ok(json!(n))
    } else if let Some(s) = val.clone().into_string() {
        let s = s.to_string().map_err(|e| format!("String conversion error: {}", e))?;
        Ok(json!(s))
    } else {
        // For objects/arrays, use JSON.stringify in JS then parse in Rust
        let globals = ctx.globals();
        let json_obj: rquickjs::Object = globals.get("JSON").map_err(|e| format!("{}", e))?;
        let stringify: rquickjs::Function = json_obj.get("stringify").map_err(|e| format!("{}", e))?;
        let json_str: String = stringify.call((val,)).map_err(|e| format!("JSON.stringify error: {}", e))?;
        serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {}", e))
    }
}

/// Helper: Get value by dot-notation path
fn get_value_by_path(value: &Value, path: &str) -> Option<Value> {
    let mut current = value;
    
    for part in path.split('.') {
        if let Some(bracket_idx) = part.find('[') {
            let key = &part[..bracket_idx];
            let idx_str = &part[bracket_idx + 1..part.len() - 1];
            
            current = current.get(key)?;
            if let Ok(idx) = idx_str.parse::<usize>() {
                current = current.get(idx)?;
            } else {
                return None;
            }
        } else {
            current = current.get(part)?;
        }
    }
    
    Some(current.clone())
}
