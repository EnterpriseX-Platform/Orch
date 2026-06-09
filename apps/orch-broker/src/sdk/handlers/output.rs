// ==========================================
// Output Node Handlers
// HTTP Response, Error Handler, End Flow
// ==========================================

use serde_json::{json, Value};

use crate::sdk::{NodeHandler, NodeMetadata, NodeCategory, NodeResult, ExecutionContext, ValidationError, ExecutionError};

/// HTTP Response Handler
pub struct ResponseHandler;

impl NodeHandler for ResponseHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "response".to_string(),
            category: NodeCategory::Output,
            label: "HTTP Response".to_string(),
            description: "Return HTTP response to client".to_string(),
            icon: "R".to_string(),
            color: "#DC2626".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, _config: &Value) -> Result<(), Vec<ValidationError>> {
        Ok(())
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let status_code = config["statusCode"].as_u64().unwrap_or(200) as u16;
            
            // Helper function to get value from context by path (dot notation)
            // Supports both flat keys ("nodes.node-1") and nested access ("nodes.node-1.body")
            let get_from_context = |path: &str| -> Option<Value> {
                let parts: Vec<&str> = path.split('.').collect();
                let all_vars = ctx.get_all_variables();
                
                // Try building key progressively from the start
                // e.g., for "nodes.node-1.body", try "nodes", then "nodes.node-1", then traverse
                for i in 1..=parts.len() {
                    let key = parts[..i].join(".");
                    if let Some(value) = all_vars.get(&key) {
                        // Found a prefix, now traverse remaining parts
                        let remaining = &parts[i..];
                        let mut current = value.clone();
                        for part in remaining {
                            if let Some(obj) = current.as_object() {
                                current = obj.get(*part)?.clone();
                            } else {
                                return None;
                            }
                        }
                        return Some(current);
                    }
                }
                
                // Fallback: try full path as flat key
                ctx.get(path).cloned()
            };
            
            let body = if let Some(body_path) = config["bodyPath"].as_str() {
                // Get specific path from context (e.g., "nodes.node-1.body" or "http.get.response")
                get_from_context(body_path)
                    .or_else(|| ctx.get(body_path).cloned())
                    .unwrap_or_else(|| {
                        tracing::warn!("bodyPath '{}' not found in context, using input", body_path);
                        input.clone()
                    })
            } else if let Some(body_source) = config["bodySource"].as_str() {
                match body_source {
                    "input" => input.clone(),
                    "proxy.response" => ctx.get("proxy.response").cloned().unwrap_or(json!({})),
                    "transform.output" => ctx.get("transform.output").cloned().unwrap_or(json!({})),
                    "http.response" => ctx.get("http.get.response").or_else(|| ctx.get("http.post.response")).cloned().unwrap_or(json!({})),
                    "extracted" => {
                        let mut extracted = serde_json::Map::new();
                        let vars = ctx.get_all_variables();
                        if let Some(obj) = vars.as_object() {
                            for (key, value) in obj {
                                if key.starts_with("extracted.") {
                                    let new_key = &key["extracted.".len()..];
                                    extracted.insert(new_key.to_string(), value.clone());
                                }
                            }
                        }
                        Value::Object(extracted)
                    }
                    _ => input.clone(),
                }
            } else if let Some(body_mapping) = config["bodyMapping"].as_object() {
                // Build custom body from mapping: { "user": "nodes.node-1.body", "status": "http.get.statusCode" }
                let mut body_obj = serde_json::Map::new();
                for (key, source_config) in body_mapping {
                    let source_path = source_config.as_str()
                        .or_else(|| source_config["source"].as_str())
                        .unwrap_or("");
                    
                    let value = if !source_path.is_empty() {
                        get_from_context(source_path)
                            .or_else(|| ctx.get(source_path).cloned())
                            .or_else(|| input.get(source_path).cloned())
                            .unwrap_or(Value::Null)
                    } else {
                        Value::Null
                    };
                    
                    body_obj.insert(key.clone(), value);
                }
                Value::Object(body_obj)
            } else if let Some(template) = config["bodyTemplate"].as_object() {
                let mut body_obj = serde_json::Map::new();
                for (key, value_config) in template {
                    if let Some(source) = value_config["source"].as_str() {
                        let value = ctx.get(source).cloned()
                            .or_else(|| input.get(source).cloned())
                            .unwrap_or(Value::Null);
                        body_obj.insert(key.clone(), value);
                    }
                }
                Value::Object(body_obj)
            } else {
                input.clone()
            };
            
            let mut headers = std::collections::HashMap::new();
            if let Some(config_headers) = config["headers"].as_object() {
                for (key, value) in config_headers {
                    if let Some(val_str) = value.as_str() {
                        headers.insert(key.clone(), ctx.substitute_template(val_str));
                    }
                }
            }
            
            ctx.set_response(status_code, headers.clone(), body.clone());
            
            tracing::info!("Response set: {} with {} headers", status_code, headers.len());
            
            Ok(json!({
                "statusCode": status_code,
                "headers": headers,
                "body": body,
                "type": "response",
            }))
        })
    }
}

/// Error Handler
pub struct ErrorHandler;

impl NodeHandler for ErrorHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "error".to_string(),
            category: NodeCategory::Output,
            label: "Error Handler".to_string(),
            description: "Return error response".to_string(),
            icon: "E".to_string(),
            color: "#DC2626".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("message").is_none() && config.get("errorCode").is_none() {
            errors.push(ValidationError {
                field: "message".to_string(),
                message: "Error message or error code is required".to_string(),
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
        _input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let status_code = config["statusCode"].as_u64().unwrap_or(500) as u16;
            let error_code = config["errorCode"].as_str().unwrap_or("INTERNAL_ERROR");
            let message = config["message"].as_str()
                .map(|m| ctx.substitute_template(m))
                .unwrap_or_else(|| "Internal server error".to_string());
            
            let details = config.get("details").cloned();
            
            let error_body = json!({
                "error": {
                    "code": error_code,
                    "message": message,
                    "requestId": ctx.request_id,
                    "details": details,
                }
            });
            
            let mut headers = std::collections::HashMap::new();
            headers.insert("Content-Type".to_string(), "application/json".to_string());
            
            ctx.set_response(status_code, headers, error_body.clone());
            
            tracing::error!("Error response: {} - {}", error_code, message);
            
            Err(ExecutionError::new(error_code, &message).with_details(error_body))
        })
    }
}

/// End Flow Handler
pub struct EndHandler;

impl NodeHandler for EndHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "end".to_string(),
            category: NodeCategory::Output,
            label: "End Flow".to_string(),
            description: "Terminate flow execution".to_string(),
            icon: "X".to_string(),
            color: "#DC2626".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, _config: &Value) -> Result<(), Vec<ValidationError>> {
        Ok(())
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let success = config["success"].as_bool().unwrap_or(true);
            
            tracing::info!("Flow ended: success={}", success);
            
            if ctx.response.is_none() {
                let status = if success { 200 } else { 400 };
                let body = if success {
                    json!({ "success": true, "data": input })
                } else {
                    json!({ "success": false, "error": "Flow ended unsuccessfully" })
                };
                
                let mut headers = std::collections::HashMap::new();
                headers.insert("Content-Type".to_string(), "application/json".to_string());
                
                ctx.set_response(status, headers, body);
            }
            
            Ok(json!({
                "type": "end",
                "success": success,
                "finalData": input,
            }))
        })
    }
}
