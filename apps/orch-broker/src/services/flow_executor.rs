// ==========================================
// Execution Context
// ==========================================
//
// Shared request/response context threaded through the Level-1 proxy
// path in `routes/execute.rs` (set request data, stash the backend
// response for the access log, etc.).
//
// The legacy node-based `FlowExecutor` that used to live here was
// removed — deployed flows execute exclusively via the SDK executor
// (`services/flow_executor_sdk.rs` + `sdk/handlers/`), which owns the
// live audit / event-log node logic. This module now only carries the
// plain data context the proxy helpers still rely on.

use serde_json::{json, Value};
use std::collections::HashMap;

/// Execution Context passed through each node
#[derive(Debug, Clone)]
pub struct ExecutionContext {
    pub request_id: String,
    pub backend_url: String,
    pub data: HashMap<String, Value>,
}

impl ExecutionContext {
    pub fn new(request_id: String, backend_url: String) -> Self {
        Self {
            request_id,
            backend_url,
            data: HashMap::new(),
        }
    }

    pub fn set(&mut self, key: &str, value: Value) {
        self.data.insert(key.to_string(), value);
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.data.get(key)
    }

    pub fn to_json(&self) -> Value {
        let mut map = serde_json::Map::new();
        for (k, v) in &self.data {
            map.insert(k.clone(), v.clone());
        }
        json!({
            "requestId": self.request_id,
            "backendUrl": self.backend_url,
            "data": Value::Object(map)
        })
    }
}
