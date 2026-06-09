// ==========================================
// Execution Context
// Shared state during flow execution
// ==========================================

use serde_json::{json, Value};
use std::collections::HashMap;
use chrono::Utc;

use crate::services::api_resolver::{ApiRegistration, MessageFormat, ApiAuthConfig};

/// Variable scope for nested contexts
#[derive(Debug, Clone)]
pub enum VariableScope {
    Global,      // Persist across all nodes
    Flow,        // Persist for current flow execution
    Node,        // Local to current node
}

/// Execution context passed between nodes
#[derive(Debug, Clone)]
pub struct ExecutionContext {
    /// Unique request ID
    pub request_id: String,
    
    /// Backend URL for proxy
    pub backend_url: String,
    
    /// Original HTTP request data
    pub request: HttpRequestData,
    
    /// Variables stored by scope
    variables: HashMap<String, (Value, VariableScope)>,
    
    /// Node execution history
    pub execution_history: Vec<NodeExecutionRecord>,
    
    /// Flow metadata
    pub flow_id: String,
    pub flow_name: String,
    
    /// Execution start time
    pub started_at: chrono::DateTime<Utc>,
    
    /// Current node being executed
    pub current_node_id: Option<String>,
    
    /// Response to be returned (set by output nodes)
    pub response: Option<HttpResponseData>,
    
    /// API Registration config (for audit, auth, etc.)
    pub api_registration: Option<ApiRegistration>,

    /// Resolved message format (from discriminator matching)
    pub message_format: Option<MessageFormat>,

    /// Auth config (from API or Application level)
    pub auth_config: Option<ApiAuthConfig>,
}

/// HTTP request data
#[derive(Debug, Clone)]
pub struct HttpRequestData {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub query_params: HashMap<String, String>,
    pub body: Option<Value>,
    pub client_ip: String,
}

/// HTTP response data
#[derive(Debug, Clone, serde::Serialize)]
pub struct HttpResponseData {
    pub status_code: u16,
    pub headers: HashMap<String, String>,
    pub body: Value,
}

/// Node execution record for audit/debugging
#[derive(Debug, Clone)]
pub struct NodeExecutionRecord {
    pub node_id: String,
    pub node_type: String,
    pub started_at: chrono::DateTime<Utc>,
    pub completed_at: Option<chrono::DateTime<Utc>>,
    pub status: ExecutionStatus,
    pub input: Value,
    pub output: Option<Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub enum ExecutionStatus {
    Running,
    Completed,
    Failed,
    Skipped,
}

impl ExecutionContext {
    pub fn new(
        request_id: String,
        flow_id: String,
        flow_name: String,
        backend_url: String,
        request: HttpRequestData,
    ) -> Self {
        Self {
            request_id,
            backend_url,
            request,
            variables: HashMap::new(),
            execution_history: Vec::new(),
            flow_id,
            flow_name,
            started_at: Utc::now(),
            current_node_id: None,
            response: None,
            api_registration: None,
            message_format: None,
            auth_config: None,
        }
    }

    /// Set API Registration
    pub fn set_api_registration(&mut self, api: ApiRegistration) {
        self.api_registration = Some(api);
    }

    /// Set resolved message format
    pub fn set_message_format(&mut self, fmt: MessageFormat) {
        self.message_format = Some(fmt);
    }

    /// Set auth config
    pub fn set_auth_config(&mut self, config: ApiAuthConfig) {
        self.auth_config = Some(config);
    }

    /// Check if audit is enabled (from MessageFormat or default false)
    pub fn is_audit_enabled(&self) -> bool {
        self.message_format.as_ref()
            .map(|fmt| fmt.audit_enabled)
            .unwrap_or(false)
    }

    /// Get audit fields from message format
    pub fn get_audit_fields(&self) -> Option<&serde_json::Value> {
        self.message_format.as_ref()
            .and_then(|fmt| fmt.audit_fields.as_ref())
    }

    /// Get pk_xpath from message format
    pub fn get_pk_xpath(&self) -> Option<&str> {
        self.message_format.as_ref()
            .and_then(|fmt| fmt.pk_xpath.as_deref())
    }

    /// Get extraction config from message format
    pub fn get_extraction_config(&self) -> Option<&serde_json::Value> {
        self.message_format.as_ref()
            .and_then(|fmt| fmt.extraction_config.as_ref())
    }
    
    /// Set variable with scope
    pub fn set(&mut self, key: &str, value: Value, scope: VariableScope) {
        self.variables.insert(key.to_string(), (value, scope));
    }
    
    /// Set global variable
    pub fn set_global(&mut self, key: &str, value: Value) {
        self.set(key, value, VariableScope::Global);
    }
    
    /// Set flow variable
    pub fn set_flow(&mut self, key: &str, value: Value) {
        self.set(key, value, VariableScope::Flow);
    }
    
    /// Get variable
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.variables.get(key).map(|(v, _)| v)
    }
    
    /// Get variable with fallback
    pub fn get_or(&self, key: &str, default: Value) -> Value {
        self.get(key).cloned().unwrap_or(default)
    }
    
    /// Check if variable exists
    pub fn has(&self, key: &str) -> bool {
        self.variables.contains_key(key)
    }
    
    /// Get all variables as JSON object
    pub fn get_all_variables(&self) -> Value {
        let mut map = serde_json::Map::new();
        for (k, (v, _)) in &self.variables {
            map.insert(k.clone(), v.clone());
        }
        Value::Object(map)
    }
    
    /// Get variables by scope
    pub fn get_variables_by_scope(&self, scope: VariableScope) -> Value {
        let mut map = serde_json::Map::new();
        for (k, (v, s)) in &self.variables {
            if std::mem::discriminant(s) == std::mem::discriminant(&scope) {
                map.insert(k.clone(), v.clone());
            }
        }
        Value::Object(map)
    }
    
    /// Delete variable
    pub fn delete(&mut self, key: &str) -> Option<Value> {
        self.variables.remove(key).map(|(v, _)| v)
    }
    
    /// Clear variables by scope
    pub fn clear_scope(&mut self, scope: VariableScope) {
        self.variables.retain(|_, (_, s)| {
            std::mem::discriminant(s) != std::mem::discriminant(&scope)
        });
    }
    
    /// Start node execution
    pub fn start_node(&mut self, node_id: String, node_type: String, input: Value) {
        self.current_node_id = Some(node_id.clone());
        self.execution_history.push(NodeExecutionRecord {
            node_id,
            node_type,
            started_at: Utc::now(),
            completed_at: None,
            status: ExecutionStatus::Running,
            input,
            output: None,
            error: None,
        });
    }
    
    /// Complete node execution
    pub fn complete_node(&mut self, output: Value) {
        if let Some(record) = self.execution_history.last_mut() {
            record.completed_at = Some(Utc::now());
            record.status = ExecutionStatus::Completed;
            record.output = Some(output);
        }
    }
    
    /// Fail node execution
    pub fn fail_node(&mut self, error: String) {
        if let Some(record) = self.execution_history.last_mut() {
            record.completed_at = Some(Utc::now());
            record.status = ExecutionStatus::Failed;
            record.error = Some(error);
        }
    }
    
    /// Set response
    pub fn set_response(&mut self, status_code: u16, headers: HashMap<String, String>, body: Value) {
        self.response = Some(HttpResponseData {
            status_code,
            headers,
            body,
        });
    }
    
    /// Get execution duration
    pub fn execution_duration_ms(&self) -> i64 {
        Utc::now().signed_duration_since(self.started_at).num_milliseconds()
    }
    
    /// Template substitution: ${variable} → value
    pub fn substitute_template(&self, template: &str) -> String {
        let mut result = template.to_string();

        // Replace ${variable} patterns
        for (key, (value, _)) in &self.variables {
            let placeholder = format!("${{{}}}", key);
            if result.contains(&placeholder) {
                let replacement = match value {
                    Value::String(s) => s.clone(),
                    _ => value.to_string(),
                };
                result = result.replace(&placeholder, &replacement);
            }
        }

        // Special placeholders
        result = result.replace("${requestId}", &self.request_id);
        result = result.replace("${flowId}", &self.flow_id);
        result = result.replace("${backendUrl}", &self.backend_url);

        // Request data placeholders
        result = result.replace("${request.method}", &self.request.method);
        result = result.replace("${request.path}", &self.request.path);
        result = result.replace("${request.clientIp}", &self.request.client_ip);

        result
    }

    /// Recursively substitute templates in a JSON Value
    /// Walks through objects/arrays and resolves ${...} in all string values
    pub fn substitute_template_json(&self, value: &Value) -> Value {
        match value {
            Value::String(s) => {
                if s.contains("${") {
                    let resolved = self.substitute_template(s);
                    Value::String(resolved)
                } else {
                    value.clone()
                }
            }
            Value::Object(map) => {
                let mut new_map = serde_json::Map::new();
                for (k, v) in map {
                    new_map.insert(k.clone(), self.substitute_template_json(v));
                }
                Value::Object(new_map)
            }
            Value::Array(arr) => {
                Value::Array(arr.iter().map(|v| self.substitute_template_json(v)).collect())
            }
            _ => value.clone(),
        }
    }
    
    /// Convert to JSON for logging/debugging
    pub fn to_json(&self) -> Value {
        json!({
            "requestId": self.request_id,
            "flowId": self.flow_id,
            "flowName": self.flow_name,
            "backendUrl": self.backend_url,
            "request": {
                "method": self.request.method,
                "path": self.request.path,
                "headers": self.request.headers,
                "queryParams": self.request.query_params,
                "body": self.request.body,
                "clientIp": self.request.client_ip,
            },
            "variables": self.get_all_variables(),
            "executionHistory": self.execution_history.len(),
            "startedAt": self.started_at.to_rfc3339(),
            "durationMs": self.execution_duration_ms(),
            "hasResponse": self.response.is_some(),
        })
    }
}
