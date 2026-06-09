// ==========================================
// Logic Node Handlers
// Decision / Condition / Gateway
// ==========================================

use serde_json::{json, Value};
use tracing::{debug, info};

use crate::sdk::{
    ExecutionContext, ExecutionError, NodeCategory, NodeHandler, NodeMetadata, NodeResult,
    ValidationError,
};

// ==========================================
// Decision Handler
// Evaluates conditions and routes to different paths
// Output contains "handle" field used by executor for edge routing
// ==========================================

pub struct DecisionHandler;

impl NodeHandler for DecisionHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "decision".to_string(),
            category: NodeCategory::Logic,
            label: "Decision".to_string(),
            description: "Evaluate condition and route to different paths".to_string(),
            icon: "D".to_string(),
            color: "#F59E0B".to_string(),
            version: "1.0.0".to_string(),
        }
    }

    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        // Must have either "conditions" array or "expression" string
        if config.get("conditions").is_none() && config.get("expression").is_none() {
            return Err(vec![ValidationError {
                field: "conditions".to_string(),
                message: "At least one condition or expression is required".to_string(),
            }]);
        }
        Ok(())
    }

    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            info!(
                "[{}] 🔀 Decision node evaluating conditions",
                ctx.request_id
            );

            // Resolve templates in config
            let resolved_config = ctx.substitute_template_json(config);

            evaluate_conditions(ctx, &resolved_config, input)
        })
    }
}

/// Evaluate conditions and return result with routing handle
fn evaluate_conditions(
    ctx: &ExecutionContext,
    config: &Value,
    input: &Value,
) -> NodeResult {
    // Mode 1: Simple expression  e.g. { "expression": "amount > 1000" }
    if let Some(expr) = config["expression"].as_str() {
        let result = evaluate_expression(ctx, expr, input);
        let handle = if result { "true" } else { "false" };
        debug!("Decision expression '{}' evaluated to: {}", expr, result);
        return Ok(json!({
            "type": "decision",
            "expression": expr,
            "result": result,
            "handle": handle,
        }));
    }

    // Mode 2: Conditions array
    // e.g. { "conditions": [{ "field": "status", "operator": "==", "value": "approved", "handle": "approved" }], "defaultHandle": "rejected" }
    if let Some(conditions) = config["conditions"].as_array() {
        for (i, cond) in conditions.iter().enumerate() {
            let field_path = cond["field"].as_str().unwrap_or("");
            let operator = cond["operator"].as_str().unwrap_or("==");
            let expected = &cond["value"];
            let handle = cond["handle"]
                .as_str()
                .unwrap_or("true")
                .to_string();

            // Resolve field value from input or context
            let actual = resolve_value(ctx, input, field_path);

            debug!(
                "Decision condition[{}]: field={}, op={}, expected={}, actual={}",
                i, field_path, operator, expected, actual
            );

            if compare_values(&actual, operator, expected) {
                info!("Decision matched condition[{}]: handle={}", i, handle);
                return Ok(json!({
                    "type": "decision",
                    "matchedConditionIndex": i,
                    "matchedCondition": cond,
                    "result": true,
                    "handle": handle,
                }));
            }
        }

        // No condition matched — use default handle
        let default_handle = config["defaultHandle"]
            .as_str()
            .unwrap_or("false")
            .to_string();

        info!(
            "Decision: no condition matched, using defaultHandle={}",
            default_handle
        );
        return Ok(json!({
            "type": "decision",
            "result": false,
            "handle": default_handle,
        }));
    }

    Err(ExecutionError::new(
        "INVALID_CONFIG",
        "No conditions or expression provided",
    ))
}

/// Evaluate a simple expression against input/context
/// Supports: "field > value", "field == value", "field != value", etc.
fn evaluate_expression(ctx: &ExecutionContext, expr: &str, input: &Value) -> bool {
    // Parse expression: "field operator value"
    let operators = [">=", "<=", "!=", "==", ">", "<", "contains", "startsWith", "endsWith", "exists", "notExists", "regex"];

    for op in &operators {
        if let Some(pos) = expr.find(op) {
            let field = expr[..pos].trim();
            let value_str = expr[pos + op.len()..].trim();

            // Handle unary operators
            if *op == "exists" || *op == "notExists" {
                let actual = resolve_value(ctx, input, field);
                return if *op == "exists" {
                    !actual.is_null()
                } else {
                    actual.is_null()
                };
            }

            let actual = resolve_value(ctx, input, field);
            let expected = parse_value_str(value_str);

            return compare_values(&actual, op, &expected);
        }
    }

    // Fallback: treat as truthy check on field name
    let val = resolve_value(ctx, input, expr.trim());
    is_truthy(&val)
}

/// Resolve a value from input (dot-notation) or context variables
fn resolve_value(ctx: &ExecutionContext, input: &Value, path: &str) -> Value {
    // Try input first (dot-notation: "body.amount", "data.status")
    if let Some(val) = resolve_json_path(input, path) {
        if !val.is_null() {
            return val.clone();
        }
    }

    // Try context variables
    if let Some(val) = ctx.get(path) {
        return val.clone();
    }

    // Try nested context: "nodes.extract-1.field"
    if path.contains('.') {
        let parts: Vec<&str> = path.splitn(2, '.').collect();
        if parts.len() == 2 {
            if let Some(parent_val) = ctx.get(parts[0]) {
                if let Some(val) = resolve_json_path(parent_val, parts[1]) {
                    return val.clone();
                }
            }
        }
    }

    Value::Null
}

/// Resolve a JSON value by dot-notation path
fn resolve_json_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let mut current = value;
    for part in path.split('.') {
        // Handle array index: "items[0]"
        if let Some(bracket_pos) = part.find('[') {
            let key = &part[..bracket_pos];
            let idx_str = &part[bracket_pos + 1..part.len() - 1];

            if !key.is_empty() {
                current = current.get(key)?;
            }
            if let Ok(idx) = idx_str.parse::<usize>() {
                current = current.get(idx)?;
            } else {
                return None;
            }
        } else {
            current = current.get(part)?;
        }
    }
    Some(current)
}

/// Compare two JSON values with an operator
fn compare_values(actual: &Value, operator: &str, expected: &Value) -> bool {
    match operator {
        "==" | "eq" => values_equal(actual, expected),
        "!=" | "ne" => !values_equal(actual, expected),
        ">" | "gt" => compare_numeric(actual, expected, |a, b| a > b),
        "<" | "lt" => compare_numeric(actual, expected, |a, b| a < b),
        ">=" | "gte" => compare_numeric(actual, expected, |a, b| a >= b),
        "<=" | "lte" => compare_numeric(actual, expected, |a, b| a <= b),
        "contains" => {
            let actual_str = value_to_string(actual);
            let expected_str = value_to_string(expected);
            actual_str.contains(&expected_str)
        }
        "startsWith" => {
            let actual_str = value_to_string(actual);
            let expected_str = value_to_string(expected);
            actual_str.starts_with(&expected_str)
        }
        "endsWith" => {
            let actual_str = value_to_string(actual);
            let expected_str = value_to_string(expected);
            actual_str.ends_with(&expected_str)
        }
        "regex" => {
            let actual_str = value_to_string(actual);
            let pattern = value_to_string(expected);
            regex::Regex::new(&pattern)
                .map(|re| re.is_match(&actual_str))
                .unwrap_or(false)
        }
        "exists" => !actual.is_null(),
        "notExists" => actual.is_null(),
        _ => false,
    }
}

/// Check if two values are equal (handles type coercion)
fn values_equal(a: &Value, b: &Value) -> bool {
    // Direct comparison
    if a == b {
        return true;
    }

    // String/number coercion
    let a_str = value_to_string(a);
    let b_str = value_to_string(b);
    a_str == b_str
}

/// Compare as f64
fn compare_numeric(a: &Value, b: &Value, cmp: fn(f64, f64) -> bool) -> bool {
    let a_num = value_to_f64(a);
    let b_num = value_to_f64(b);
    match (a_num, b_num) {
        (Some(a), Some(b)) => cmp(a, b),
        _ => false,
    }
}

/// Convert Value to f64
fn value_to_f64(val: &Value) -> Option<f64> {
    match val {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse::<f64>().ok(),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        _ => None,
    }
}

/// Convert Value to string
fn value_to_string(val: &Value) -> String {
    match val {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        _ => val.to_string().trim_matches('"').to_string(),
    }
}

/// Parse a string value to JSON Value
fn parse_value_str(s: &str) -> Value {
    // Remove quotes if present
    let trimmed = s.trim().trim_matches('"').trim_matches('\'');

    // Try as number
    if let Ok(n) = trimmed.parse::<i64>() {
        return json!(n);
    }
    if let Ok(n) = trimmed.parse::<f64>() {
        return json!(n);
    }

    // Try as bool
    match trimmed.to_lowercase().as_str() {
        "true" => return json!(true),
        "false" => return json!(false),
        "null" | "nil" => return Value::Null,
        _ => {}
    }

    // String
    json!(trimmed)
}

/// Check if a value is truthy
fn is_truthy(val: &Value) -> bool {
    match val {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
        Value::String(s) => !s.is_empty() && s != "false" && s != "0",
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
    }
}

// ==========================================
// Switch Handler (multi-way decision)
// Routes based on value matching multiple cases
// ==========================================

pub struct SwitchHandler;

impl NodeHandler for SwitchHandler {
    fn metadata(&self) -> NodeMetadata {
        NodeMetadata {
            node_type: "switch".to_string(),
            category: NodeCategory::Logic,
            label: "Switch".to_string(),
            description: "Route to different paths based on value matching".to_string(),
            icon: "S".to_string(),
            color: "#F59E0B".to_string(),
            version: "1.0.0".to_string(),
        }
    }

    fn validate(&self, config: &Value) -> Result<(), Vec<ValidationError>> {
        if config.get("field").is_none() {
            return Err(vec![ValidationError {
                field: "field".to_string(),
                message: "Field to evaluate is required".to_string(),
            }]);
        }
        if config.get("cases").is_none() {
            return Err(vec![ValidationError {
                field: "cases".to_string(),
                message: "At least one case is required".to_string(),
            }]);
        }
        Ok(())
    }

    fn execute<'a>(
        &'a self,
        ctx: &'a mut ExecutionContext,
        config: &'a Value,
        input: &'a Value,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = NodeResult> + Send + 'a>> {
        Box::pin(async move {
            let field = config["field"].as_str().unwrap_or("");
            let actual = resolve_value(ctx, input, field);

            info!(
                "[{}] 🔀 Switch node: field={}, value={}",
                ctx.request_id, field, actual
            );

            if let Some(cases) = config["cases"].as_array() {
                for (i, case) in cases.iter().enumerate() {
                    let case_value = &case["value"];
                    let default_handle = format!("case_{}", i);
                    let handle = case["handle"]
                        .as_str()
                        .unwrap_or(&default_handle);

                    if values_equal(&actual, case_value) {
                        info!("Switch matched case[{}]: handle={}", i, handle);
                        return Ok(json!({
                            "type": "switch",
                            "field": field,
                            "actualValue": actual,
                            "matchedCase": i,
                            "result": true,
                            "handle": handle,
                        }));
                    }
                }
            }

            let default_handle = config["defaultHandle"]
                .as_str()
                .unwrap_or("default")
                .to_string();

            info!("Switch: no case matched, using default={}", default_handle);
            Ok(json!({
                "type": "switch",
                "field": field,
                "actualValue": actual,
                "result": false,
                "handle": default_handle,
            }))
        })
    }
}
