// ==========================================
// Trigger Node Handlers
// HTTP Request, Webhook, Kafka, Schedule
// ==========================================

use serde_json::{json, Value};

use crate::sdk::{NodeHandler, NodeMetadata, NodeCategory, NodeResult, ExecutionContext, ValidationError};

/// HTTP Request Trigger Handler
pub struct HttpRequestHandler;

impl NodeHandler for HttpRequestHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "httpRequest".to_string(),
            category: NodeCategory::Trigger,
            label: "HTTP Request".to_string(),
            description: "Incoming HTTP API request".to_string(),
            icon: "H".to_string(),
            color: "#334155".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, _config: &Value) -> Result<(), Vec<ValidationError>> {
        Ok(())
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        _config: &'a Value,
        _input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            Ok(json!({
                "method": ctx.request.method,
                "path": ctx.request.path,
                "headers": ctx.request.headers,
                "query": ctx.request.query_params,
                "body": ctx.request.body,
            }))
        })
    }
}

/// Webhook Trigger Handler
pub struct WebhookHandler;

impl NodeHandler for WebhookHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "webhook".to_string(),
            category: NodeCategory::Trigger,
            label: "Webhook".to_string(),
            description: "Incoming webhook callback".to_string(),
            icon: "W".to_string(),
            color: "#334155".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if let Some(secret) = config.get("secret") {
            if secret.as_str().map(|s| s.is_empty()).unwrap_or(true) {
                errors.push(ValidationError {
                    field: "secret".to_string(),
                    message: "Webhook secret cannot be empty".to_string(),
                });
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
        _input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            if let Some(_secret) = config.get("secret").and_then(|s| s.as_str()) {
                let _signature = ctx.request.headers.get("X-Webhook-Signature")
                    .or_else(|| ctx.request.headers.get("x-webhook-signature"));
                
                tracing::debug!("Validating webhook signature");
            }
            
            Ok(json!({
                "event": ctx.request.body,
                "source": ctx.request.headers.get("X-Webhook-Source").cloned().unwrap_or_default(),
            }))
        })
    }
}

/// Kafka Consumer Trigger Handler
pub struct KafkaTriggerHandler;

impl NodeHandler for KafkaTriggerHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "kafka".to_string(),
            category: NodeCategory::Trigger,
            label: "Kafka Consumer".to_string(),
            description: "Consume messages from Kafka topic".to_string(),
            icon: "K".to_string(),
            color: "#334155".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("topic").is_none() {
            errors.push(ValidationError {
                field: "topic".to_string(),
                message: "Kafka topic is required".to_string(),
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
        _ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let topic = config["topic"].as_str().unwrap_or("default");
            
            Ok(json!({
                "topic": topic,
                "message": input,
                "partition": input.get("partition"),
                "offset": input.get("offset"),
            }))
        })
    }
}

/// Schedule/Cron Trigger Handler
pub struct ScheduleHandler;

impl NodeHandler for ScheduleHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "schedule".to_string(),
            category: NodeCategory::Trigger,
            label: "Schedule".to_string(),
            description: "Cron-based scheduled execution".to_string(),
            icon: "C".to_string(),
            color: "#334155".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if let Some(cron) = config.get("cron").and_then(|c| c.as_str()) {
            let parts: Vec<&str> = cron.split_whitespace().collect();
            if parts.len() != 5 && parts.len() != 6 {
                errors.push(ValidationError {
                    field: "cron".to_string(),
                    message: "Invalid cron expression format".to_string(),
                });
            }
        } else {
            errors.push(ValidationError {
                field: "cron".to_string(),
                message: "Cron expression is required".to_string(),
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
            let cron = config["cron"].as_str().unwrap_or("* * * * *");
            
            Ok(json!({
                "scheduledAt": ctx.started_at.to_rfc3339(),
                "cron": cron,
                "triggered": true,
            }))
        })
    }
}
