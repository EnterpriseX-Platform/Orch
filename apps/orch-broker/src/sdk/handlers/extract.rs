// ==========================================
// Extract Node Handlers
// Field extraction, JSON Path, XPath
// ==========================================

use serde_json::{json, Value};

use crate::sdk::{NodeHandler, NodeMetadata, NodeCategory, NodeResult, ExecutionContext, ValidationError};

/// Extract Fields Handler
pub struct ExtractHandler;

impl NodeHandler for ExtractHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "extract".to_string(),
            category: NodeCategory::Extract,
            label: "Extract Fields".to_string(),
            description: "Extract fields from request/response".to_string(),
            icon: "E".to_string(),
            color: "#7C3AED".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if let Some(fields) = config.get("fields").and_then(|f| f.as_array()) {
            for (i, field) in fields.iter().enumerate() {
                if field.get("name").is_none() {
                    errors.push(ValidationError {
                        field: format!("fields[{}].name", i),
                        message: "Field name is required".to_string(),
                    });
                }
            }
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
            let mut extracted = serde_json::Map::new();
            
            if let Some(fields) = config.get("fields").and_then(|f| f.as_array()) {
                for field in fields {
                    let name = field["name"].as_str().unwrap_or("unknown");
                    let source = field["source"].as_str().unwrap_or("body");
                    let path = field["path"].as_str().unwrap_or(name);
                    let default = field.get("default").cloned();
                    
                    let value = match source {
                        "body" => {
                            input.get(path)
                                .or_else(|| ctx.get(&format!("request.body.{}", path)))
                                .cloned()
                                .or(default)
                                .unwrap_or(Value::Null)
                        }
                        "headers" => {
                            ctx.request.headers.get(path)
                                .map(|v| json!(v))
                                .or(default)
                                .unwrap_or(Value::Null)
                        }
                        "query" => {
                            ctx.request.query_params.get(path)
                                .map(|v| json!(v))
                                .or(default)
                                .unwrap_or(Value::Null)
                        }
                        "context" => {
                            // First check variables HashMap
                            ctx.get(path).cloned()
                                // Then check built-in context fields
                                .or_else(|| match path {
                                    "request.method" => Some(json!(ctx.request.method)),
                                    "request.path" => Some(json!(ctx.request.path)),
                                    "request.client_ip" => Some(json!(ctx.request.client_ip)),
                                    "request.clientIp" => Some(json!(ctx.request.client_ip)),
                                    "requestId" => Some(json!(ctx.request_id)),
                                    "flowId" => Some(json!(ctx.flow_id)),
                                    "flowName" => Some(json!(ctx.flow_name)),
                                    "backendUrl" => Some(json!(ctx.backend_url)),
                                    _ if path.starts_with("request.headers.") => {
                                        let header = &path["request.headers.".len()..];
                                        ctx.request.headers.get(header).map(|v| json!(v))
                                    }
                                    _ if path.starts_with("api_registration.") => {
                                        let field = &path["api_registration.".len()..];
                                        ctx.api_registration.as_ref().and_then(|api| match field {
                                            "id" => Some(json!(api.id)),
                                            "name" => Some(json!(api.name)),
                                            "endpoint" => Some(json!(api.endpoint)),
                                            "method" => Some(json!(api.method)),
                                            "backendUrl" | "backend_url" => Some(json!(api.backend_url)),
                                            "apiType" | "api_type" => Some(json!(api.api_type)),
                                            _ => None,
                                        })
                                    }
                                    _ => None,
                                })
                                .or(default)
                                .unwrap_or(Value::Null)
                        }
                        _ => Value::Null,
                    };
                    
                    extracted.insert(name.to_string(), value.clone());
                    ctx.set_flow(&format!("extracted.{}", name), value);
                }
            }
            
            Ok(Value::Object(extracted))
        })
    }
}

/// JSON Path Handler
pub struct JsonPathHandler;

impl NodeHandler for JsonPathHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "jsonPath".to_string(),
            category: NodeCategory::Extract,
            label: "JSON Path".to_string(),
            description: "Query JSON data using JSONPath".to_string(),
            icon: "J".to_string(),
            color: "#7C3AED".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("expression").is_none() {
            errors.push(ValidationError {
                field: "expression".to_string(),
                message: "JSONPath expression is required".to_string(),
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
            let expression = config["expression"].as_str().unwrap_or("$");
            let source = config["source"].as_str().unwrap_or("input");
            
            let data = match source {
                "input" => input.clone(),
                "body" => ctx.request.body.clone().unwrap_or(json!({})),
                "context" => ctx.get_all_variables(),
                _ => input.clone(),
            };
            
            let result = evaluate_jsonpath(&data, expression);
            ctx.set_flow("jsonpath.result", result.clone());
            
            Ok(result)
        })
    }
}

/// XPath Handler
pub struct XPathHandler;

impl NodeHandler for XPathHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "xpath".to_string(),
            category: NodeCategory::Extract,
            label: "XPath".to_string(),
            description: "Query XML data using XPath".to_string(),
            icon: "X".to_string(),
            color: "#7C3AED".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("expression").is_none() {
            errors.push(ValidationError {
                field: "expression".to_string(),
                message: "XPath expression is required".to_string(),
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
            let expression = config["expression"].as_str().unwrap_or("/");
            
            tracing::debug!("XPath expression: {}", expression);
            
            let result = json!({
                "expression": expression,
                "input": input,
                "note": "Full XPath support coming soon",
            });
            
            ctx.set_flow("xpath.result", result.clone());
            
            Ok(result)
        })
    }
}

/// Simple JSONPath evaluator (subset)
fn evaluate_jsonpath(data: &Value, path: &str) -> Value {
    if path == "$" {
        return data.clone();
    }
    
    let mut current = data;
    
    let path = if path.starts_with("$.") {
        &path[2..]
    } else if path.starts_with("$") {
        &path[1..]
    } else {
        path
    };
    
    for part in path.split('.') {
        if let Some(bracket_idx) = part.find('[') {
            let key = &part[..bracket_idx];
            let idx_str = &part[bracket_idx + 1..part.len() - 1];
            
            if let Ok(idx) = idx_str.parse::<usize>() {
                current = current
                    .get(key)
                    .and_then(|v| v.get(idx))
                    .unwrap_or(&Value::Null);
            } else {
                return Value::Null;
            }
        } else {
            current = current.get(part).unwrap_or(&Value::Null);
        }
        
        if current.is_null() {
            return Value::Null;
        }
    }
    
    current.clone()
}
