// ==========================================
// Integration Node Handlers
// Event Log, Audit Trail, Database, Cache
// ==========================================

use serde_json::{json, Value};
use chrono::Utc;

use crate::config::system_config::attach_internal_token;
use crate::sdk::{NodeHandler, NodeMetadata, NodeCategory, NodeResult, ExecutionContext, ValidationError, ExecutionError};

/// Extract value from JSON using simplified JSONPath
/// Supports: $.field, $.field.nested, $.array[0], $['field with space']
fn extract_json_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    if path.is_empty() {
        return Some(value);
    }
    extract_json_path_internal(value, path)
}

fn extract_json_path_internal<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    if path == "$" || path.is_empty() {
        return Some(value);
    }
    
    let path = path.strip_prefix("$").unwrap_or(path);
    let path = path.strip_prefix(".").unwrap_or(path);
    
    let mut current = value;
    
    // Simple parser for JSONPath segments
    let mut chars = path.chars().peekable();
    let mut segment = String::new();
    
    while let Some(ch) = chars.next() {
        match ch {
            '.' => {
                if !segment.is_empty() {
                    current = current.get(&segment)?;
                    segment.clear();
                }
            }
            '[' => {
                if !segment.is_empty() {
                    current = current.get(&segment)?;
                    segment.clear();
                }
                // Parse array index or quoted field
                let mut inner = String::new();
                let quote_char = chars.peek().copied();
                
                if quote_char == Some('\'') || quote_char == Some('"') {
                    chars.next(); // consume opening quote
                    let quote = quote_char.unwrap();
                    for ch in &mut chars {
                        if ch == quote {
                            break;
                        }
                        inner.push(ch);
                    }
                    // consume closing bracket
                    if chars.next() != Some(']') {
                        return None;
                    }
                    current = current.get(&inner)?;
                } else {
                    // Array index
                    for ch in &mut chars {
                        if ch == ']' {
                            break;
                        }
                        inner.push(ch);
                    }
                    let idx: usize = inner.parse().ok()?;
                    current = current.get(idx)?;
                }
            }
            _ => segment.push(ch),
        }
    }
    
    // Don't forget the last segment
    if !segment.is_empty() {
        current = current.get(&segment)?;
    }
    
    Some(current)
}

/// Extract and parse Microflow request body
/// Microflow pattern has escaped JSON string in object.input_xxx.request
fn extract_microflow_request(body: &Value, object_input_path: Option<&str>) -> Option<Value> {
    // 1. Try the explicit configured path (or the conventional default).
    let path = object_input_path.unwrap_or("object.input_request.request");
    if let Some(escaped_str) = extract_json_path_internal(body, path).and_then(|v| v.as_str().map(|s| s.to_string())) {
        if let Ok(parsed) = serde_json::from_str::<Value>(&escaped_str) {
            return Some(parsed);
        }
    }

    // 2. Fallback: a microflow envelope wraps its business payload under a
    //    DYNAMIC key — `object.input_<flowName>.request` — that varies per flow,
    //    so a fixed path can't match it (objectInputPath is rarely configured).
    //    Walk `object.*.request` and parse the first escaped-JSON string found
    //    (mirrors the gateway's `$.object.*.request`). This keeps the audit
    //    field-diff = the real business fields instead of the raw envelope blob.
    let obj = body.get("object")?.as_object()?;
    for v in obj.values() {
        if let Some(req) = v.get("request").and_then(|r| r.as_str()) {
            if let Ok(parsed) = serde_json::from_str::<Value>(req) {
                return Some(parsed);
            }
        }
    }
    None
}

/// Create changes map by comparing old vs new values
/// Returns: { field: { old: value, new: value } }
fn create_changes_map(old: Option<&Value>, new: &Value) -> serde_json::Map<String, Value> {
    let mut changes = serde_json::Map::new();
    
    match (old, new) {
        // Both are objects - compare field by field
        (Some(Value::Object(old_obj)), Value::Object(new_obj)) => {
            // Check all keys from new object
            for (key, new_val) in new_obj {
                let old_val = old_obj.get(key).unwrap_or(&Value::Null);
                if old_val != new_val {
                    changes.insert(key.clone(), json!({
                        "old": old_val,
                        "new": new_val
                    }));
                }
            }
            // Check for deleted keys (in old but not in new)
            for (key, old_val) in old_obj {
                if !new_obj.contains_key(key) {
                    changes.insert(key.clone(), json!({
                        "old": old_val,
                        "new": null
                    }));
                }
            }
        }
        // Both are arrays - compare index by index
        (Some(Value::Array(old_arr)), Value::Array(new_arr)) => {
            let array_changes = compare_arrays(old_arr, new_arr, None);
            changes.insert("arrayChanges".to_string(), json!(array_changes));
        }
        // Only new value exists (CREATE)
        (None, Value::Object(new_obj)) => {
            for (key, new_val) in new_obj {
                changes.insert(key.clone(), json!({
                    "old": null,
                    "new": new_val
                }));
            }
        }
        // Only new array exists
        (None, Value::Array(new_arr)) => {
            let array_changes = compare_arrays(&[], new_arr, None);
            changes.insert("arrayChanges".to_string(), json!(array_changes));
        }
        // Only old value exists (DELETE)
        (Some(Value::Object(old_obj)), Value::Null) => {
            for (key, old_val) in old_obj {
                changes.insert(key.clone(), json!({
                    "old": old_val,
                    "new": null
                }));
            }
        }
        // Only old array exists
        (Some(Value::Array(old_arr)), Value::Null) => {
            let array_changes = compare_arrays(old_arr, &[], None);
            changes.insert("arrayChanges".to_string(), json!(array_changes));
        }
        // Simple value comparison
        (Some(old_val), new_val) if old_val != new_val => {
            changes.insert("value".to_string(), json!({
                "old": old_val,
                "new": new_val
            }));
        }
        _ => {}
    }
    
    changes
}

/// Compare arrays in detail (index-by-index and item-by-item)
/// Returns: list of changes for each index
/// - keyField: if specified, compare by this key instead of index (e.g. "id")
fn compare_arrays(old_arr: &[Value], new_arr: &[Value], key_field: Option<&str>) -> Vec<Value> {
    let mut changes = Vec::new();
    let max_len = old_arr.len().max(new_arr.len());
    
    for i in 0..max_len {
        let old_item = old_arr.get(i);
        let new_item = new_arr.get(i);
        
        match (old_item, new_item) {
            // Both items exist - compare them
            (Some(old_val), Some(new_val)) => {
                if old_val != new_val {
                    // If objects, do deep comparison
                    if let (Value::Object(old_obj), Value::Object(new_obj)) = (old_val, new_val) {
                        let item_changes = create_changes_map(Some(old_val), new_val);
                        if !item_changes.is_empty() {
                            changes.push(json!({
                                "index": i,
                                "action": "modified",
                                "oldItem": old_val,
                                "newItem": new_val,
                                "fieldChanges": item_changes
                            }));
                        }
                    } else {
                        changes.push(json!({
                            "index": i,
                            "action": "modified",
                            "old": old_val,
                            "new": new_val
                        }));
                    }
                }
            }
            // New item added
            (None, Some(new_val)) => {
                changes.push(json!({
                    "index": i,
                    "action": "added",
                    "old": null,
                    "new": new_val
                }));
            }
            // Old item removed
            (Some(old_val), None) => {
                changes.push(json!({
                    "index": i,
                    "action": "removed",
                    "old": old_val,
                    "new": null
                }));
            }
            _ => {}
        }
    }
    
    changes
}

/// Compare arrays by key field (e.g. id) instead of index
/// Used when items may change index but have the same key
fn compare_arrays_by_key(old_arr: &[Value], new_arr: &[Value], key_field: &str) -> Vec<Value> {
    let mut changes = Vec::new();
    
    // Build lookup maps by key
    let old_map: std::collections::HashMap<String, &Value> = old_arr
        .iter()
        .filter_map(|item| {
            item.get(key_field)
                .and_then(|k| k.as_str())
                .map(|k| (k.to_string(), item))
        })
        .collect();
    
    let new_map: std::collections::HashMap<String, &Value> = new_arr
        .iter()
        .enumerate()
        .filter_map(|(idx, item)| {
            item.get(key_field)
                .and_then(|k| k.as_str())
                .map(|k| (k.to_string(), item))
        })
        .collect();
    
    // Check for added and modified items
    for (new_key, new_item) in &new_map {
        match old_map.get(new_key) {
            Some(old_item) => {
                if (*old_item).clone() != (*new_item).clone() {
                    let item_changes = create_changes_map(Some(old_item), new_item);
                    changes.push(json!({
                        "key": new_key,
                        "keyField": key_field,
                        "action": "modified",
                        "oldItem": old_item,
                        "newItem": new_item,
                        "fieldChanges": item_changes
                    }));
                }
            }
            None => {
                changes.push(json!({
                    "key": new_key,
                    "keyField": key_field,
                    "action": "added",
                    "old": null,
                    "new": new_item
                }));
            }
        }
    }
    
    // Check for removed items
    for (old_key, old_item) in &old_map {
        if !new_map.contains_key(old_key) {
            changes.push(json!({
                "key": old_key,
                "keyField": key_field,
                "action": "removed",
                "old": old_item,
                "new": null
            }));
        }
    }
    
    changes
}

/// HTTP Client for sending Audit Log to Orch. Reused by the audit/event
/// Kafka consumer (§5) as the actual delivery step, so it's pub(crate).
pub(crate) async fn send_audit_to_orch(audit_record: &Value) -> Result<(), String> {
    let api_base = crate::config::system::api_base_url();
    
    let client = reqwest::Client::new();
    let url = format!("{}/api/audit", api_base);
    
    // Normalize action to match AuditAction enum in database
    let action = audit_record["action"].as_str().unwrap_or("API_CALL");
    let normalized_action = match action {
        "CREATE" | "INSERT" => "CREATE",
        "UPDATE" | "MODIFY" => "UPDATE",
        "DELETE" | "REMOVE" => "DELETE",
        "LOGIN" => "LOGIN",
        "LOGOUT" => "LOGOUT",
        "EXPORT" => "EXPORT",
        "APPROVE" => "APPROVE",
        "REJECT" => "REJECT",
        "VIEW" => "VIEW",
        // All API-driven actions (POST_XXX, GET_YYY etc.) map to API_CALL
        _ => "API_CALL",
    };
    
    // Extract values from audit_record directly (already computed in Audit Handler)
    let old_values = audit_record.get("oldValues").cloned().unwrap_or(json!(null));
    let new_values = audit_record.get("newValues").cloned().unwrap_or(json!({}));
    let changes = audit_record.get("changes").cloned().unwrap_or(json!({}));
    let http_method = audit_record["httpMethod"].as_str().unwrap_or("GET");
    
    // Build audit request matching Orch schema
    let user_id = audit_record["userId"].as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("system");
    
    let description = if http_method == "GET" {
        format!("GET {}: Fetched {}", 
            audit_record["entityType"].as_str().unwrap_or("Unknown"),
            audit_record["entityId"].as_str().unwrap_or(""))
    } else {
        format!("{} {} on {}: {}", 
            http_method,
            action,
            audit_record["entityType"].as_str().unwrap_or("Unknown"),
            audit_record["entityId"].as_str().unwrap_or(""))
    };
    
    let audit_request = json!({
        "action": normalized_action,
        "entityType": audit_record["entityType"],
        "entityId": audit_record["entityId"],
        "changes": changes,
        "oldValues": old_values,
        "newValues": new_values,
        "userId": user_id,
        "userIp": audit_record["clientIp"],
        "timestamp": audit_record["timestamp"],
        "description": description
    });
    
    tracing::info!("📤 Sending audit request to {}: {:?}", url, audit_request);
    
    match attach_internal_token(client.post(&url))
        .json(&audit_request)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            if status.is_success() {
                let resp_body = response.text().await.unwrap_or_default();
                tracing::info!("✅ Audit record sent to Orch successfully: {}", resp_body);
                Ok(())
            } else {
                let body: String = response.text().await.unwrap_or_default();
                tracing::warn!("⚠️  Failed to send audit to Orch: {} - {}", status, body);
                Err(format!("HTTP {}: {}", status, body))
            }
        }
        Err(e) => {
            let err_msg: String = e.to_string();
            tracing::warn!("⚠️  Failed to send audit to Orch: {}", err_msg);
            Err(err_msg)
        }
    }
}

/// HTTP Client for sending Event Log to Orch
pub(crate) async fn send_event_to_orch(event_record: &Value) -> Result<(), String> {
    let api_base = crate::config::system::api_base_url();
    
    let client = reqwest::Client::new();
    let url = format!("{}/api/events", api_base);
    
    // Build the event request matching the Orch schema
    let event_request = json!({
        "eventType": event_record["eventType"].as_str().unwrap_or("flow_event"),
        "level": event_record["level"].as_str().unwrap_or("info"),
        "message": event_record["message"],
        "data": event_record["data"],
        "flowId": event_record["flowId"],
        "flowName": event_record["flowName"],
        "requestId": event_record["requestId"],
        "userId": event_record["userId"],
        "userIp": event_record["userIp"],
        "timestamp": event_record["timestamp"],
    });
    
    match attach_internal_token(client.post(&url))
        .json(&event_request)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            if status.is_success() {
                tracing::info!("✅ Event log sent to Orch successfully");
                Ok(())
            } else {
                let body: String = response.text().await.unwrap_or_default();
                tracing::warn!("⚠️  Failed to send event to Orch: {} - {}", status, body);
                Err(format!("HTTP {}: {}", status, body))
            }
        }
        Err(e) => {
            let err_msg: String = e.to_string();
            tracing::warn!("⚠️  Failed to send event to Orch: {}", err_msg);
            Err(err_msg)
        }
    }
}

/// Deliver an audit/event record to the web API with bounded retry. HTTP is
/// the PRIMARY, reliable delivery path. Kafka-primary delivery proved
/// unreliable on this deployment — after a PVC reset the `audit-events`
/// consumer did not drain the topic even once it existed, so node-published
/// audits were silently lost while only the HTTP path actually delivered.
/// Audit is compliance-critical, so we deliver over HTTP directly and absorb a
/// transient web blip with retry rather than gating it behind a Kafka publish.
pub(crate) async fn deliver_to_orch_with_retry(record: &Value, is_audit: bool) {
    const MAX_ATTEMPTS: u32 = 8;
    let kind = if is_audit { "audit" } else { "event" };
    for attempt in 1..=MAX_ATTEMPTS {
        let res = if is_audit {
            send_audit_to_orch(record).await
        } else {
            send_event_to_orch(record).await
        };
        match res {
            Ok(()) => return,
            Err(e) => {
                tracing::warn!("{} delivery attempt {}/{} failed: {}", kind, attempt, MAX_ATTEMPTS, e);
                let backoff = std::cmp::min(attempt as u64, 8) * 500;
                tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
            }
        }
    }
    tracing::error!("{}: gave up delivering to Orch after {} attempts (record dropped)", kind, MAX_ATTEMPTS);
}

/// Event Log Handler
pub struct EventLogHandler;

impl NodeHandler for EventLogHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "eventLog".to_string(),
            category: NodeCategory::Integration,
            label: "Event Log".to_string(),
            description: "Log system events".to_string(),
            icon: "L".to_string(),
            color: "#64748B".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("event").is_none() && config.get("message").is_none() {
            errors.push(ValidationError {
                field: "event".to_string(),
                message: "Event name or message is required".to_string(),
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
            // Resolve template variables in event name and message
            let raw_event = config["event"].as_str()
                .or_else(|| config["message"].as_str())
                .unwrap_or("flow_event");
            let event_name = ctx.substitute_template(raw_event);
            let level = config["level"].as_str().unwrap_or("info");
            let raw_message = config["message"].as_str()
                .or_else(|| config["event"].as_str())
                .unwrap_or("");
            let message = ctx.substitute_template(raw_message);

            // Resolve template variables in data field recursively
            let raw_data = config.get("data").cloned().unwrap_or_else(|| input.clone());
            let resolved_data = ctx.substitute_template_json(&raw_data);

            // Build the event data with resolved values
            let event_data = json!({
                "eventType": event_name,
                "level": level,
                "message": message,
                "data": resolved_data,
                "flowId": ctx.flow_id,
                "flowName": config.get("flowName").and_then(|v| v.as_str()),
                "requestId": ctx.request_id,
                "userId": ctx.request.headers.get("X-User-Id").cloned(),
                "userIp": ctx.request.client_ip.clone(),
                "timestamp": Utc::now().to_rfc3339(),
            });

            // Store in the context (for downstream nodes)
            ctx.set_flow(&format!("events.{}", event_name), event_data.clone());

            // §5 mandatory delivery: deliver the event to the web API over
            // HTTP with retry (the reliable, primary path — see
            // deliver_to_orch_with_retry).
            let event_for_orch = event_data.clone();
            tokio::spawn(async move {
                deliver_to_orch_with_retry(&event_for_orch, false).await;
            });

            // Log via tracing (for debugging)
            match level {
                "error" => tracing::error!(event = %event_name, request_id = %ctx.request_id, "Flow event logged"),
                "warn" => tracing::warn!(event = %event_name, request_id = %ctx.request_id, "Flow event logged"),
                "debug" => tracing::debug!(event = %event_name, request_id = %ctx.request_id, "Flow event logged"),
                _ => tracing::info!(event = %event_name, request_id = %ctx.request_id, "Flow event logged"),
            }

            Ok(event_data)
        })
    }
}

/// Audit Trail Handler
pub struct AuditHandler;

impl NodeHandler for AuditHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "audit".to_string(),
            category: NodeCategory::Integration,
            label: "Audit Trail".to_string(),
            description: "Record audit trail".to_string(),
            icon: "A".to_string(),
            color: "#64748B".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("action").is_none() {
            errors.push(ValidationError {
                field: "action".to_string(),
                message: "Audit action is required".to_string(),
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
            tracing::info!("📝 Audit Node: Starting execution");

            // ========================================
            // Check if audit is enabled
            // Priority: 1) MessageFormat audit_enabled flag  2) Flow node config has explicit action
            // This allows audit to work both from MessageFormat config AND explicit flow node usage
            // ========================================
            let audit_from_message_format = ctx.is_audit_enabled();
            let audit_from_node_config = config.get("action").is_some();
            let audit_enabled = audit_from_message_format || audit_from_node_config;
            tracing::info!("📝 Audit Node: audit_enabled={} (messageFormat={}, nodeConfig={})",
                audit_enabled, audit_from_message_format, audit_from_node_config);

            if !audit_enabled {
                tracing::debug!("Audit disabled: no MessageFormat audit flag and no node config action, skipping");
                return Ok(json!({
                    "type": "AUDIT_TRAIL",
                    "status": "skipped",
                    "reason": "audit_not_configured"
                }));
            }
            
            // ========================================
            // Get config from API Registration (if available) or node config
            // ========================================
            let api_reg = ctx.api_registration.as_ref();
            let http_method: String = api_reg.map(|api| api.method.clone()).unwrap_or_else(|| "GET".to_string());
            
            // Action: prefer MessageFormat name (for shared endpoints), then API name, then node config
            let action: String = ctx.message_format.as_ref()
                .map(|fmt| format!("{}_{}", http_method, fmt.name.to_uppercase().replace(" ", "_")))
                .or_else(|| api_reg.map(|api| format!("{}_{}", api.method, api.name.to_uppercase().replace(" ", "_"))))
                .unwrap_or_else(|| config["action"].as_str().unwrap_or("UNKNOWN").to_string());
            
            // Entity Type: from API endpoint path, or node config
            let entity_type: String = api_reg
                .map(|api| {
                    let path_parts: Vec<&str> = api.endpoint.split('/').collect();
                    path_parts.last()
                        .map(|p| p.trim_end_matches("/*").to_string())
                        .map(|p| {
                            let mut chars = p.chars();
                            match chars.next() {
                                None => String::new(),
                                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                            }
                        })
                        .unwrap_or_else(|| "Resource".to_string())
                })
                .unwrap_or_else(|| config["entityType"].as_str().unwrap_or("Flow").to_string());
            
            // Determine source before dropping api_reg borrow
            let source = api_reg.map(|_| "api_registration").unwrap_or("node_config");
            
            let flow_id = ctx.flow_id.clone();
            
            // ========================================
            // Get Audit Config from API Registration (Primary) or Node Config (Fallback)
            // ========================================
            // Priority: API Registration > Node Config > Defaults
            
            // Get request body from context (original HTTP request)
            let request_body = ctx.request.body.clone();
            
            // Get HTTP response from previous node (for extracting ID from response)
            let http_response_body = input.get("nodes.node-1")
                .and_then(|node| node.get("body"));
            
            // Get config from MessageFormat (via ctx) or API Registration
            let api_pk_xpath = ctx.get_pk_xpath().map(|s| s.to_string());
            let api_audit_fields = ctx.get_audit_fields().cloned();
            let api_extraction_config = ctx.get_extraction_config().cloned();
            let api_type = api_reg.map(|api| api.api_type.as_str()).unwrap_or("REST");

            // Check if this is a Microflow API
            let is_microflow = api_type == "MICROFLOW";
            let microflow_config = api_extraction_config.as_ref()
                .and_then(|ec: &Value| ec.get("microflow").cloned());
            let object_input_path = microflow_config.as_ref()
                .and_then(|m: &Value| m.get("objectInputPath"))
                .and_then(|v: &Value| v.as_str())
                .map(|s| s.to_string());

            // For Microflow: extract and parse the escaped JSON from request body
            let parsed_request_body = if is_microflow {
                tracing::info!("Microflow API detected, parsing escaped JSON from request body");
                request_body.as_ref()
                    .and_then(|body| extract_microflow_request(body, object_input_path.as_deref()))
                    .or_else(|| {
                        tracing::warn!("Failed to parse Microflow request body, using original");
                        request_body.clone()
                    })
            } else {
                request_body.clone()
            };

            // Merge config: MessageFormat (primary) -> Node Config (fallback)
            let pk_xpath = api_pk_xpath.as_deref()
                .or_else(|| config["auditPkXPath"].as_str());

            let array_path = api_audit_fields.as_ref()
                .and_then(|fields: &Value| fields.get("arrayPath").and_then(|v| v.as_str()))
                .or_else(|| config["arrayPath"].as_str());

            let array_key_field = api_audit_fields.as_ref()
                .and_then(|fields: &Value| fields.get("arrayKeyField").and_then(|v| v.as_str()))
                .or_else(|| config["arrayKeyField"].as_str());

            tracing::info!("Audit config (from MessageFormat/ctx):");
            tracing::info!("  pk_xpath: {:?}", pk_xpath);
            tracing::info!("  audit_fields: {:?}", api_audit_fields.is_some());
            tracing::info!("  array_path: {:?}", array_path);
            tracing::info!("  array_key_field: {:?}", array_key_field);
            
            // ========================================
            // Extract Entity ID
            // ========================================
            let entity_id = if let Some(xpath) = pk_xpath {
                tracing::info!("Extracting entity ID using xpath: {}", xpath);
                
                // Try from response first
                let from_response = http_response_body
                    .and_then(|body| extract_json_path(body, xpath))
                    .and_then(|v| match v {
                        Value::String(s) => Some(s.clone()),
                        Value::Number(n) => Some(n.to_string()),
                        _ => v.as_str().map(|s| s.to_string()),
                    });
                
                // Then try from request body (use parsed Microflow body if applicable)
                let from_request = parsed_request_body.as_ref()
                    .and_then(|body| extract_json_path(body, xpath))
                    .and_then(|v| match v {
                        Value::String(s) => Some(s.clone()),
                        Value::Number(n) => Some(n.to_string()),
                        _ => v.as_str().map(|s| s.to_string()),
                    });
                
                from_response.or(from_request)
                    .unwrap_or_else(|| {
                        tracing::warn!("Could not extract entity ID using xpath: {}", xpath);
                        // Fallback to node config entityId (with template resolution) or flow_id
                        config["entityId"].as_str()
                            .map(|s| ctx.substitute_template(s))
                            .unwrap_or_else(|| flow_id.clone())
                    })
            } else {
                // No xpath configured - use node config entityId (with template resolution) or flow_id
                config["entityId"].as_str()
                    .map(|s| ctx.substitute_template(s))
                    .unwrap_or_else(|| flow_id.clone())
            };

            // ========================================
            // Resolve template variables in changes config (if provided by flow node)
            // ========================================
            let node_changes_config = config.get("changes")
                .map(|c| ctx.substitute_template_json(c));

            // ========================================
            // Get OLD and NEW values for comparison
            // ========================================

            // Get HTTP response data from previous httpCall node (if exists)
            // Also try proxy response from flow variables
            let http_response = input.get("nodes.node-1")
                .and_then(|node| node.get("body"))
                .cloned()
                .or_else(|| ctx.get("proxy.response").cloned());
            
            // For GET requests: newValues = HTTP response (the fetched data)
            // For PUT/PATCH/POST: need to compare old vs new
            let http_method_str = http_method.as_str();
            let (old_values, new_values, changes) = match http_method_str {
                "GET" => {
                    // GET: No old values, new values = HTTP response
                    let new_vals = http_response.clone().unwrap_or(json!({}));
                    let changes_map = create_changes_map(None, &new_vals);
                    (json!(null), new_vals, json!(changes_map))
                }
                "POST" => {
                    // POST: Creating new - old = null, new = request body (what was sent)
                    // Use parsed Microflow body if applicable
                    let new_vals = parsed_request_body.clone().unwrap_or(json!({}));
                    let changes_map = create_changes_map(None, &new_vals);
                    (json!(null), new_vals, json!(changes_map))
                }
                "PUT" | "PATCH" => {
                    // PUT/PATCH: Updating - need to compare
                    // old = HTTP response (fetched before update), new = request body
                    // Use parsed Microflow body if applicable
                    let old_vals = http_response.clone().unwrap_or(json!({}));
                    let new_vals = parsed_request_body.clone().unwrap_or(json!({}));
                    
                    // Check if we need special array comparison
                    let changes_map = if let Some(path) = array_path {
                        // Extract arrays from both old and new values
                        let old_array = extract_json_path(&old_vals, path)
                            .and_then(|v| v.as_array())
                            .map(|a| a.to_vec())
                            .unwrap_or_default();
                        let new_array = extract_json_path(&new_vals, path)
                            .and_then(|v| v.as_array())
                            .map(|a| a.to_vec())
                            .unwrap_or_default();
                        
                        // Compare arrays using key field if specified
                        let array_changes = if let Some(key_field) = array_key_field {
                            compare_arrays_by_key(&old_array, &new_array, key_field)
                        } else {
                            compare_arrays(&old_array, &new_array, None)
                        };
                        
                        // Create overall changes with array comparison
                        let mut changes = create_changes_map(Some(&old_vals), &new_vals);
                        if !array_changes.is_empty() {
                            changes.insert("arrayChanges".to_string(), json!(array_changes));
                            changes.insert("arrayPath".to_string(), json!(path));
                            if let Some(key) = array_key_field {
                                changes.insert("arrayKeyField".to_string(), json!(key));
                            }
                        }
                        changes
                    } else {
                        create_changes_map(Some(&old_vals), &new_vals)
                    };
                    
                    (old_vals, new_vals, json!(changes_map))
                }
                "DELETE" => {
                    // DELETE: old = HTTP response (deleted data), new = null
                    let old_vals = http_response.clone().unwrap_or(json!({}));
                    let changes_map = create_changes_map(Some(&old_vals), &json!(null));
                    (old_vals, json!(null), json!(changes_map))
                }
                _ => {
                    // Default: use input as new values
                    let new_vals = input.clone();
                    let changes_map = create_changes_map(None, &new_vals);
                    (json!(null), new_vals, json!(changes_map))
                }
            };
            
            // Use node_changes_config (resolved templates) if available and changes is empty
            let final_changes = if let Some(ref nc) = node_changes_config {
                // Merge: node config changes take priority if present
                if changes.is_null() || changes.as_object().map_or(true, |m| m.is_empty()) {
                    nc.clone()
                } else {
                    // Merge both: http-derived changes + node config changes
                    let mut merged = changes.clone();
                    if let (Some(mc), Some(nco)) = (merged.as_object_mut(), nc.as_object()) {
                        for (k, v) in nco {
                            mc.insert(k.clone(), v.clone());
                        }
                    }
                    merged
                }
            } else {
                changes
            };

            // ════════════════════════════════════════════════════════
            // Audit enrichment — ported from the Next.js gateway
            // (format-resolver.ts). When a MessageFormat drives this
            // request, the broker now builds the full audit row itself:
            // write-action gate, refType→entityType, refId/refNo/refName,
            // transactionKey, masked body, username, datasets, button
            // provenance. Metadata is carried inside `changes` (the audit
            // UI reads changes.transactionKey / changes.dataCatalogs); the
            // real field diff lives under `changes.fieldChanges`.
            // ════════════════════════════════════════════════════════
            use crate::sdk::audit_resolver as ar;

            fn map_audit_action(t: &str) -> String {
                match t.to_ascii_uppercase().as_str() {
                    "CREATE" | "CLONE" => "CREATE",
                    "UPDATE" | "SIGNOFF" | "SUBMIT" => "UPDATE",
                    "DELETE" => "DELETE",
                    "APPROVE" => "APPROVE",
                    "REJECT" => "REJECT",
                    _ => "API_CALL",
                }
                .to_string()
            }
            fn is_write_action(t: &str) -> bool {
                matches!(
                    t.to_ascii_uppercase().as_str(),
                    "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT" | "SIGNOFF" | "SUBMIT" | "CLONE"
                )
            }
            fn val_to_string(v: Option<Value>) -> Option<String> {
                match v {
                    Some(Value::String(s)) => Some(s),
                    Some(Value::Number(n)) => Some(n.to_string()),
                    Some(Value::Bool(b)) => Some(b.to_string()),
                    Some(Value::Null) | None => None,
                    Some(other) => Some(other.to_string()),
                }
            }

            let has_message_format = ctx.message_format.is_some();
            let resolved = ctx.message_format.as_ref().map(ar::resolve_format);
            let enrich_body = parsed_request_body.clone().unwrap_or(Value::Null);
            let headers = ctx.request.headers.clone();
            let query = ctx.request.query_params.clone();

            // Snapshot owned MessageFormat fields (release ctx borrow).
            let (fmt_code, fmt_name, fmt_action_type, fmt_action_label, fmt_system,
                 fmt_screen_code, fmt_screen_name, fmt_tab_name) = ctx.message_format.as_ref()
                .map(|f| (f.code.clone(), Some(f.name.clone()), f.action_type.clone(),
                          f.action_label.clone(), f.system.clone(), f.screen_code.clone(),
                          f.screen_name.clone(), f.tab_name.clone()))
                .unwrap_or((None, None, None, None, None, None, None, None));

            let matched_button: Option<crate::services::api_resolver::ScreenButtonRow> =
                ctx.message_format.as_ref()
                    .and_then(|f| ar::match_screen_button(&headers, &query, &enrich_body, &f.buttons).cloned());

            let api_name = api_reg.map(|a| a.name.clone());

            // Write-action gate (gateway parity): a MessageFormat-driven
            // audit is persisted only for write ops; reads/exports → skip.
            if has_message_format && !fmt_action_type.as_deref().map(is_write_action).unwrap_or(false) {
                tracing::info!("📝 Audit: action {:?} is not a write op — skipping audit (event log only)", fmt_action_type);
                return Ok(json!({ "type": "AUDIT_TRAIL", "status": "skipped", "reason": "non_write_action" }));
            }

            let username = resolved.as_ref()
                .and_then(|r| ar::extract_username(&headers, &enrich_body, r))
                .unwrap_or_default();
            let ref_type = resolved.as_ref().and_then(|r| r.ref_type.clone());
            let ref_id = resolved.as_ref().and_then(|r| r.ref_id_path.clone())
                .and_then(|p| val_to_string(ar::json_path_get(&enrich_body, &p)));
            let ref_no = resolved.as_ref().and_then(|r| r.ref_no_path.clone())
                .and_then(|p| val_to_string(ar::json_path_get(&enrich_body, &p)));
            let ref_name = resolved.as_ref().and_then(|r| r.ref_name_path.clone())
                .and_then(|p| val_to_string(ar::json_path_get(&enrich_body, &p)));
            let transaction_key = resolved.as_ref().and_then(|r| ar::extract_transaction_key(&enrich_body, r));
            let data_catalogs = resolved.as_ref().map(|r| r.data_catalogs.clone()).unwrap_or_default();
            let mask_paths = resolved.as_ref().map(|r| r.mask_paths.clone()).unwrap_or_default();
            let masked_new = if mask_paths.is_empty() { new_values.clone() } else { ar::apply_mask(&new_values, &mask_paths) };
            let masked_old = if mask_paths.is_empty() { old_values.clone() } else { ar::apply_mask(&old_values, &mask_paths) };
            // Field diff stored under changes.fieldChanges. When masking is
            // active, recompute it from the MASKED bodies so redacted
            // fields never leak into the diff. This drops the
            // array-by-key view, but masked array fields would be *** too.
            let field_changes_out = if mask_paths.is_empty() {
                final_changes
            } else {
                let mo = if masked_old.is_null() { None } else { Some(&masked_old) };
                json!(create_changes_map(mo, &masked_new))
            };

            // Effective action / entity identity (gateway semantics).
            let eff_action = fmt_action_type.as_deref().map(map_audit_action).unwrap_or_else(|| action.clone());
            // entityType = configured business entity (refType) → API name
            // (a REAL identifier) → the node's own entityType. Never a
            // synthesized magic value (no synthesized constants).
            let eff_entity_type = ref_type.clone()
                .or_else(|| api_name.clone())
                .unwrap_or_else(|| entity_type.clone());
            let eff_entity_id = ref_id.clone()
                .or_else(|| fmt_code.clone())
                .or_else(|| api_name.clone())
                .unwrap_or_else(|| entity_id.clone());

            // Button-aware provenance (matchedButton overrides format).
            let prov_screen_code = matched_button.as_ref().and_then(|b| b.screen_code.clone()).or_else(|| fmt_screen_code.clone());
            let prov_screen_name = matched_button.as_ref().and_then(|b| b.screen_name.clone()).or_else(|| fmt_screen_name.clone());
            let prov_tab_name = matched_button.as_ref().and_then(|b| b.tab_name.clone()).or_else(|| fmt_tab_name.clone());
            let prov_btn_label = matched_button.as_ref().and_then(|b| b.button_label.clone());
            let prov_btn_id = matched_button.as_ref().map(|b| b.id.clone());

            // Metadata bag + real field diff under `fieldChanges`.
            let mut changes_obj = serde_json::Map::new();
            if has_message_format {
                changes_obj.insert("formatCode".into(), json!(fmt_code.clone()));
                changes_obj.insert("formatName".into(), json!(fmt_name.clone()));
                changes_obj.insert("actionType".into(), json!(fmt_action_type.clone()));
                changes_obj.insert("actionLabel".into(), json!(prov_btn_label.clone().or_else(|| fmt_action_label.clone())));
                changes_obj.insert("system".into(), json!(fmt_system.clone()));
                changes_obj.insert("screenCode".into(), json!(prov_screen_code.clone()));
                changes_obj.insert("screenName".into(), json!(prov_screen_name.clone()));
                changes_obj.insert("tabName".into(), json!(prov_tab_name.clone()));
                changes_obj.insert("buttonLabel".into(), json!(prov_btn_label.clone()));
                changes_obj.insert("buttonId".into(), json!(prov_btn_id.clone()));
                changes_obj.insert("refType".into(), json!(ref_type.clone()));
            }
            changes_obj.insert("refId".into(), json!(ref_id.clone()));
            changes_obj.insert("refNo".into(), json!(ref_no.clone()));
            changes_obj.insert("refName".into(), json!(ref_name.clone()));
            changes_obj.insert("transactionKey".into(), json!(transaction_key.clone()));
            if !data_catalogs.is_empty() {
                changes_obj.insert("dataCatalogs".into(), serde_json::to_value(&data_catalogs).unwrap_or_else(|_| json!([])));
            }
            changes_obj.insert("method".into(), json!(http_method.clone()));
            changes_obj.insert("requestId".into(), json!(ctx.request_id.clone()));
            changes_obj.insert("fieldChanges".into(), field_changes_out);
            let changes_out = Value::Object(changes_obj);

            // Description: "{action} · {screen} · {label}" (gateway format).
            let description = format!(
                "{} · {} · {}",
                fmt_action_type.clone().unwrap_or_else(|| eff_action.clone()),
                prov_screen_name.clone().or_else(|| prov_screen_code.clone()).unwrap_or_default(),
                prov_btn_label.clone().or_else(|| fmt_action_label.clone()).or_else(|| fmt_name.clone()).unwrap_or_default()
            );

            // userId: resolved username string (the /api/audit receiver
            // maps it to the users-table FK); fall back to X-User-Id.
            let resolved_user = if username.is_empty() {
                ctx.request.headers.get("X-User-Id").cloned().unwrap_or_default()
            } else {
                username.clone()
            };

            let audit_record = json!({
                "type": "AUDIT_TRAIL",
                "action": eff_action,
                "entityType": eff_entity_type,
                "entityId": eff_entity_id,
                "requestId": ctx.request_id.clone(),
                "flowId": flow_id,
                "userId": resolved_user,
                "username": username,
                "description": description,
                "timestamp": Utc::now().to_rfc3339(),
                "clientIp": ctx.request.client_ip.clone(),
                "oldValues": masked_old,
                "newValues": masked_new,
                "changes": changes_out,
                "source": source,
                "httpMethod": http_method,
            });
            
            ctx.set_flow("lastAudit", audit_record.clone());
            
            tracing::info!("Audit: {} on {}:{} method={} (source: {})", 
                action, entity_type, entity_id, http_method, source
            );
            tracing::debug!("Audit details: old={:?}, new={:?}, changes={:?}",
                audit_record["oldValues"].is_null(),
                !audit_record["newValues"].is_null(),
                audit_record["changes"]
            );
            
            // §5 mandatory delivery: deliver the audit to the web API over
            // HTTP with retry (the reliable, primary path — see
            // deliver_to_orch_with_retry). Audit is compliance-critical, so it
            // is not gated behind a Kafka publish.
            let audit_clone = audit_record.clone();
            tokio::spawn(async move {
                deliver_to_orch_with_retry(&audit_clone, true).await;
            });

            Ok(audit_record)
        })
    }
}

/// Database Handler
pub struct DatabaseHandler;

impl NodeHandler for DatabaseHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "database".to_string(),
            category: NodeCategory::Integration,
            label: "Database".to_string(),
            description: "Execute database queries".to_string(),
            icon: "D".to_string(),
            color: "#64748B".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("query").is_none() {
            errors.push(ValidationError {
                field: "query".to_string(),
                message: "SQL query is required".to_string(),
            });
        }
        
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
    
    fn config_schema(&self) -> Option<Value> {
        Some(json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "SQL query to execute"
                },
                "parameters": {
                    "type": "array",
                    "description": "Query parameters"
                },
                "connection": {
                    "type": "string",
                    "description": "Database connection name"
                }
            },
            "required": ["query"]
        }))
    }
    
    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        _input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let query_template = config["query"].as_str().unwrap_or("");
            let connection = config["connection"].as_str().unwrap_or("default");

            let query = ctx.substitute_template(query_template);

            // Safety: only allow SELECT queries
            let trimmed = query.trim_start().to_uppercase();
            if !trimmed.starts_with("SELECT") && !trimmed.starts_with("WITH") {
                return Err(ExecutionError::new(
                    "DB_SAFETY",
                    "Only SELECT/WITH queries are allowed for safety. Use dedicated service calls for writes.",
                ));
            }

            tracing::info!("Database: executing on '{}': {}", connection, &query[..std::cmp::min(query.len(), 100)]);

            let pool_manager = crate::services::db_pool_manager::get_db_pool_manager()
                .ok_or_else(|| ExecutionError::new("DB_ERROR", "DB Pool Manager not initialized"))?;

            let pool = pool_manager.get_or_create(connection).await
                .map_err(|e| ExecutionError::new("DB_ERROR", &format!("Failed to connect: {}", e)))?;

            // Execute query and convert rows to JSON dynamically
            let rows = sqlx::query(&query)
                .fetch_all(&pool)
                .await
                .map_err(|e| ExecutionError::new("DB_ERROR", &format!("Query failed: {}", e)))?;

            let json_rows: Vec<Value> = rows.iter().map(|row| {
                use sqlx::{Row, Column, TypeInfo};
                let mut obj = serde_json::Map::new();
                for col in row.columns() {
                    let name = col.name().to_string();
                    let val: Value = match col.type_info().to_string().as_str() {
                        "INT4" => row.try_get::<i32, _>(col.ordinal()).map(|v| json!(v)).unwrap_or(Value::Null),
                        "INT8" => row.try_get::<i64, _>(col.ordinal()).map(|v| json!(v)).unwrap_or(Value::Null),
                        "FLOAT4" => row.try_get::<f32, _>(col.ordinal()).map(|v| json!(v)).unwrap_or(Value::Null),
                        "FLOAT8" => row.try_get::<f64, _>(col.ordinal()).map(|v| json!(v)).unwrap_or(Value::Null),
                        "BOOL" => row.try_get::<bool, _>(col.ordinal()).map(|v| json!(v)).unwrap_or(Value::Null),
                        "JSON" | "JSONB" => row.try_get::<Value, _>(col.ordinal()).unwrap_or(Value::Null),
                        "TIMESTAMPTZ" => row.try_get::<chrono::DateTime<chrono::Utc>, _>(col.ordinal())
                            .map(|v| json!(v.to_rfc3339())).unwrap_or(Value::Null),
                        "TIMESTAMP" => row.try_get::<chrono::NaiveDateTime, _>(col.ordinal())
                            .map(|v| json!(v.to_string())).unwrap_or(Value::Null),
                        _ => row.try_get::<String, _>(col.ordinal()).map(|v| json!(v)).unwrap_or(Value::Null),
                    };
                    obj.insert(name, val);
                }
                Value::Object(obj)
            }).collect();

            let result = json!({
                "executed": true,
                "query": query,
                "connection": connection,
                "rowCount": json_rows.len(),
                "rows": json_rows,
            });

            ctx.set_flow("db.lastResult", result.clone());
            ctx.set_flow("db.rowCount", json!(json_rows.len()));

            tracing::info!("Database: {} rows returned", json_rows.len());

            Ok(result)
        })
    }
}

/// Cache Handler
pub struct CacheHandler;

impl NodeHandler for CacheHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "cache".to_string(),
            category: NodeCategory::Integration,
            label: "Cache".to_string(),
            description: "Redis/Cache operations".to_string(),
            icon: "C".to_string(),
            color: "#64748B".to_string(),
            version: "1.0.0".to_string(),
        }
    }
    
    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        
        if config.get("operation").is_none() {
            errors.push(ValidationError {
                field: "operation".to_string(),
                message: "Cache operation is required (get/set/delete)".to_string(),
            });
        }
        
        if config.get("key").is_none() {
            errors.push(ValidationError {
                field: "key".to_string(),
                message: "Cache key is required".to_string(),
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
            let operation = config["operation"].as_str().unwrap_or("get");
            let key = config["key"].as_str().unwrap_or("");
            let key = ctx.substitute_template(key);
            
            tracing::debug!("Cache {}: {}", operation, key);
            
            let result = match operation {
                "get" => {
                    if let Some(value) = ctx.get(&format!("cache.{}", key)) {
                        json!({ "hit": true, "value": value, "key": key })
                    } else {
                        json!({ "hit": false, "value": null, "key": key })
                    }
                }
                "set" => {
                    let value = config.get("value").unwrap_or(input);
                    let ttl = config["ttl"].as_u64().unwrap_or(300);
                    ctx.set_flow(&format!("cache.{}", key), value.clone());
                    json!({ "set": true, "key": key, "ttl": ttl })
                }
                "delete" => {
                    ctx.delete(&format!("cache.{}", key));
                    json!({ "deleted": true, "key": key })
                }
                _ => json!({ "error": "Unknown operation", "key": key }),
            };

            Ok(result)
        })
    }
}

#[cfg(test)]
mod audit_handler_tests {
    use super::*;
    use crate::sdk::HttpRequestData;
    use crate::services::api_resolver::{ApiRegistration, DataCatalogRef, FieldMappingLib, MessageFormat};
    use std::collections::HashMap;

    fn run<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(f)
    }

    /// End-to-end of the broker audit node: a microflow-style write request
    /// produces an enriched audit record with a real {old,new} field diff
    /// (the fix for "audit detail shows -"), masked body, refType→
    /// entityType, refId→entityId, resolved username, transactionKey and
    /// datasets. This is the data the /audit modal will now render.
    #[test]
    fn audit_node_builds_enriched_record() {
        let body = json!({
            "password": "secret",
            "ITEM_ID": "ITEM-001",
            "object": { "input_main": "{\"YEAR\":2025,\"ORG\":\"A07\"}" }
        });
        let mut headers = HashMap::new();
        headers.insert("X-User-Id".to_string(), "hdr-fallback".to_string());

        let req = HttpRequestData {
            method: "POST".to_string(),
            path: "/api/v1/example-api".to_string(),
            headers,
            query_params: HashMap::new(),
            body: Some(body),
            client_ip: "10.0.0.95".to_string(),
        };
        let mut ctx = ExecutionContext::new(
            "req-1".to_string(),
            "flow-1".to_string(),
            "Sample Save".to_string(),
            "http://backend".to_string(),
            req,
        );
        ctx.set_api_registration(ApiRegistration {
            id: "api1".to_string(),
            name: "example-api".to_string(),
            endpoint: "/api/v1/example-api".to_string(),
            method: "POST".to_string(),
            api_type: "REST".to_string(),
            ..Default::default()
        });
        ctx.set_message_format(MessageFormat {
            id: "fmt1".to_string(),
            name: "Sample Save".to_string(),
            audit_enabled: true,
            action_type: Some("CREATE".to_string()),
            action_label: Some("Save".to_string()),
            screen_name: Some("Item List".to_string()),
            ref_type: Some("ITEM_RECORD".to_string()),
            ref_id_path: Some("$.ITEM_ID".to_string()),
            username_source: Some("STATIC".to_string()),
            username_static: Some("john".to_string()),
            mask_paths: Some(vec!["$.password".to_string()]),
            data_catalogs: vec![DataCatalogRef {
                id: "dc1".to_string(),
                name: "Item Data".to_string(),
                category: "TRANSACTIONAL".to_string(),
            }],
            field_mapping: Some(FieldMappingLib {
                clob_path: Some("$.object.*".to_string()),
                transaction_key_fields: Some(vec!["YEAR".to_string(), "ORG".to_string()]),
                ..Default::default()
            }),
            ..Default::default()
        });

        let rec = run(AuditHandler.execute(&mut ctx, &json!({}), &json!({}))).expect("audit ok");

        // Defect 1: real field diff present and {old,new}-shaped.
        let fc = &rec["changes"]["fieldChanges"];
        assert!(fc.is_object(), "fieldChanges must be an object, got {fc:?}");
        assert_eq!(fc["ITEM_ID"]["new"], json!("ITEM-001"));
        // masking must also redact the value inside the diff
        assert_eq!(fc["password"]["new"], json!("***"));

        // Stored body is masked.
        assert_eq!(rec["newValues"]["password"], json!("***"));
        assert_eq!(rec["newValues"]["ITEM_ID"], json!("ITEM-001"));

        // Enrichment: action enum, entityType=refType, entityId=refId, user.
        assert_eq!(rec["action"], json!("CREATE"));
        assert_eq!(rec["entityType"], json!("ITEM_RECORD"));
        assert_eq!(rec["entityId"], json!("ITEM-001"));
        assert_eq!(rec["username"], json!("john"));

        // Metadata the /audit list reads off `changes`.
        assert_eq!(rec["changes"]["transactionKey"], json!("2025|A07"));
        assert_eq!(rec["changes"]["dataCatalogs"][0]["category"], json!("TRANSACTIONAL"));
        assert_eq!(rec["changes"]["refType"], json!("ITEM_RECORD"));
    }

    /// Read actions driven by a MessageFormat are not persisted (gateway
    /// parity: audit_logs is write-only).
    #[test]
    fn audit_node_skips_read_actions() {
        let req = HttpRequestData {
            method: "POST".to_string(),
            path: "/api/v1/x".to_string(),
            headers: HashMap::new(),
            query_params: HashMap::new(),
            body: Some(json!({ "a": 1 })),
            client_ip: "127.0.0.1".to_string(),
        };
        let mut ctx = ExecutionContext::new(
            "req-2".to_string(),
            "flow-2".to_string(),
            "Read".to_string(),
            "http://b".to_string(),
            req,
        );
        ctx.set_message_format(MessageFormat {
            id: "f2".to_string(),
            name: "Read".to_string(),
            audit_enabled: true,
            action_type: Some("READ".to_string()),
            ..Default::default()
        });

        let rec = run(AuditHandler.execute(&mut ctx, &json!({}), &json!({}))).expect("ok");
        assert_eq!(rec["status"], json!("skipped"));
        assert_eq!(rec["reason"], json!("non_write_action"));
    }
}
