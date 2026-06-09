//! audit_resolver — Rust port of the Next.js gateway's `format-resolver.ts`.
//!
//! Moves audit enrichment INTO the broker so the audit node can build the
//! full audit row itself (mask, refId/refNo/refName, transactionKey,
//! username, datasets) instead of the edge gateway doing it. Behaviour is
//! kept faithful to the TS original — see apps/web/lib/format-resolver.ts.
//!
//! NOTE on enums: the broker receives MessageFormat config from the web
//! `/api/registers/resolve` endpoint, which serialises Prisma enums as
//! their NAME (e.g. "BODY_PATH", "JWT_CLAIM"). So we compare against the
//! UPPERCASE names exactly like the TS resolver — no lowercase DB mapping.
#![allow(dead_code)]

use crate::services::api_resolver::{DataCatalogRef, FieldMappingLib, MessageFormat, ScreenButtonRow};
use base64::Engine;
use serde_json::Value;
use std::collections::HashMap;

/// Effective audit config after merging MessageFormat overrides with its
/// FieldMapping library (override > library > none).
#[derive(Debug, Clone, Default)]
pub struct ResolvedFormat {
    pub ref_type: Option<String>,
    pub ref_id_path: Option<String>,
    pub ref_no_path: Option<String>,
    pub ref_name_path: Option<String>,
    pub pk_xpath: Option<String>,
    pub username_source: Option<String>,
    pub username_field: Option<String>,
    pub username_static: Option<String>,
    pub clob_path: Option<String>,
    pub transaction_key_fields: Option<Vec<String>>,
    pub audit_enabled: bool,
    pub mask_paths: Vec<String>,
    pub data_catalogs: Vec<DataCatalogRef>,
}

/// resolveFormat(f) — override field wins, library is the fallback.
/// `clobPath`/`transactionKeyFields` are library-only; `maskPaths`/
/// `dataCatalogs` are format-only (no library override). `auditEnabled`
/// comes straight from the format (schema default true, never null) so the
/// library `enabled` fallback is effectively dead — matching the TS `??`.
pub fn resolve_format(f: &MessageFormat) -> ResolvedFormat {
    let fm: Option<&FieldMappingLib> = f.field_mapping.as_ref();
    ResolvedFormat {
        ref_type: f.ref_type.clone().or_else(|| fm.and_then(|m| m.ref_type.clone())),
        ref_id_path: f.ref_id_path.clone().or_else(|| fm.and_then(|m| m.ref_id_path.clone())),
        ref_no_path: f.ref_no_path.clone().or_else(|| fm.and_then(|m| m.ref_no_path.clone())),
        ref_name_path: f.ref_name_path.clone().or_else(|| fm.and_then(|m| m.ref_name_path.clone())),
        pk_xpath: f.pk_xpath.clone().or_else(|| fm.and_then(|m| m.pk_xpath.clone())),
        username_source: f.username_source.clone().or_else(|| fm.and_then(|m| m.username_source.clone())),
        username_field: f.username_field.clone().or_else(|| fm.and_then(|m| m.username_field.clone())),
        username_static: f.username_static.clone().or_else(|| fm.and_then(|m| m.username_static.clone())),
        clob_path: fm.and_then(|m| m.clob_path.clone()),
        transaction_key_fields: fm.and_then(|m| m.transaction_key_fields.clone()),
        audit_enabled: f.audit_enabled,
        mask_paths: f.mask_paths.clone().unwrap_or_default(),
        data_catalogs: f.data_catalogs.clone(),
    }
}

// ── path helpers ────────────────────────────────────────────────────────

/// Strip a leading `$` then optional `.` — mirrors TS `path.replace(/^\$\.?/, '')`.
/// A leading `.` is only stripped when it directly follows `$`.
fn strip_dollar(path: &str) -> &str {
    match path.strip_prefix('$') {
        Some(rest) => rest.strip_prefix('.').unwrap_or(rest),
        None => path,
    }
}

/// Parse a `name[idx]` segment — mirrors TS `^(\w+)\[(\d+)\]$`.
/// `\w` = ASCII alphanumeric + underscore; index is decimal digits only.
fn parse_indexed(seg: &str) -> Option<(String, usize)> {
    let open = seg.find('[')?;
    if !seg.ends_with(']') {
        return None;
    }
    let name = &seg[..open];
    let idx_str = &seg[open + 1..seg.len() - 1];
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return None;
    }
    if idx_str.is_empty() || !idx_str.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    idx_str.parse::<usize>().ok().map(|idx| (name.to_string(), idx))
}

/// jsonPathGet — plain `$.a.b[0].c`. No wildcard, no JSON-string auto-parse.
/// Returns None when any segment is missing (never panics).
pub fn json_path_get(obj: &Value, path: &str) -> Option<Value> {
    let clean = strip_dollar(path);
    if clean.is_empty() {
        return Some(obj.clone());
    }
    let mut node: &Value = obj;
    for p in clean.split('.') {
        if node.is_null() {
            return None;
        }
        if let Some((name, idx)) = parse_indexed(p) {
            match node.get(name.as_str()) {
                Some(Value::Array(a)) => match a.get(idx) {
                    Some(v) => node = v,
                    None => return None,
                },
                _ => return None,
            }
        } else {
            match node.get(p) {
                Some(v) => node = v,
                None => return None,
            }
        }
    }
    Some(node.clone())
}

/// Fan out a `*` segment exactly like JS `Object.values` — objects yield
/// their values, arrays yield their elements (typeof array === 'object').
fn fan_out(cur: &Value, out: &mut Vec<Value>) {
    match cur {
        Value::Object(map) => out.extend(map.values().cloned()),
        Value::Array(a) => out.extend(a.iter().cloned()),
        _ => {}
    }
}

/// jsonPathGetWithWildcard — adds single-level `*`. No auto-parse. Returns
/// the first surviving match. Delegates to jsonPathGet when no `*` present.
pub fn json_path_get_with_wildcard(obj: &Value, path: &str) -> Option<Value> {
    if !path.contains('*') {
        return json_path_get(obj, path);
    }
    let clean = strip_dollar(path);
    let mut current: Vec<Value> = vec![obj.clone()];
    for seg in clean.split('.') {
        let mut next: Vec<Value> = Vec::new();
        for cur in &current {
            if cur.is_null() {
                continue;
            }
            if seg == "*" {
                fan_out(cur, &mut next);
            } else if let Some((name, idx)) = parse_indexed(seg) {
                if let Some(Value::Array(a)) = cur.get(name.as_str()) {
                    if let Some(v) = a.get(idx) {
                        next.push(v.clone());
                    }
                }
            } else if let Some(v) = cur.get(seg) {
                next.push(v.clone());
            }
        }
        current = next;
        if current.is_empty() {
            return None;
        }
    }
    current.into_iter().next()
}

/// jsonPathGetSmart — like the wildcard walker, but auto-parses any
/// JSON-string node before traversing into it, and unwraps a final
/// double-encoded string. Used for username BODY_PATH (CLOB-aware).
pub fn json_path_get_smart(obj: &Value, path: &str) -> Option<Value> {
    let clean = strip_dollar(path);
    if clean.is_empty() {
        return Some(obj.clone());
    }
    let mut current: Vec<Value> = vec![obj.clone()];
    for seg in clean.split('.') {
        let mut next: Vec<Value> = Vec::new();
        for raw in &current {
            // Auto-parse JSON-string nodes mid-walk.
            let cur_owned: Value = match raw {
                Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or_else(|_| raw.clone()),
                _ => raw.clone(),
            };
            if cur_owned.is_null() {
                continue;
            }
            if seg == "*" {
                fan_out(&cur_owned, &mut next);
                continue;
            }
            if let Some((name, idx)) = parse_indexed(seg) {
                if let Some(Value::Array(a)) = cur_owned.get(name.as_str()) {
                    if let Some(v) = a.get(idx) {
                        next.push(v.clone());
                    }
                }
            } else if let Some(v) = cur_owned.get(seg) {
                next.push(v.clone());
            }
        }
        current = next;
        if current.is_empty() {
            return None;
        }
    }
    let mut last = current.into_iter().next()?;
    if let Value::String(s) = &last {
        if let Ok(Value::String(inner)) = serde_json::from_str::<Value>(s) {
            last = Value::String(inner);
        }
    }
    Some(last)
}

// ── masking ───────────────────────────────────────────────────────────

/// applyMask — replace values at the given JSONPaths with "***" on a clone.
/// Targeting a non-existent field is a silent no-op.
pub fn apply_mask(body: &Value, paths: &[String]) -> Value {
    if paths.is_empty() {
        return body.clone();
    }
    let mut clone = body.clone();
    for path in paths {
        if path.is_empty() {
            continue;
        }
        let clean = strip_dollar(path);
        let parts: Vec<&str> = clean.split('.').collect();
        set_masked(&mut clone, &parts, 0);
    }
    clone
}

fn set_masked(node: &mut Value, parts: &[&str], i: usize) {
    if i >= parts.len() {
        return;
    }
    let seg = parts[i];
    let last = i == parts.len() - 1;

    if seg == "*" {
        match node {
            Value::Object(map) => {
                let keys: Vec<String> = map.keys().cloned().collect();
                for k in keys {
                    if last {
                        map.insert(k, Value::String("***".to_string()));
                    } else if let Some(child) = map.get_mut(&k) {
                        set_masked(child, parts, i + 1);
                    }
                }
            }
            Value::Array(a) => {
                for idx in 0..a.len() {
                    if last {
                        a[idx] = Value::String("***".to_string());
                    } else {
                        set_masked(&mut a[idx], parts, i + 1);
                    }
                }
            }
            _ => {}
        }
        return;
    }

    if let Some((name, idx)) = parse_indexed(seg) {
        if let Value::Object(map) = node {
            if let Some(Value::Array(a)) = map.get_mut(name.as_str()) {
                if last {
                    if idx < a.len() {
                        a[idx] = Value::String("***".to_string());
                    }
                } else if let Some(child) = a.get_mut(idx) {
                    set_masked(child, parts, i + 1);
                }
            }
        }
        return;
    }

    if let Value::Object(map) = node {
        if last {
            if map.contains_key(seg) {
                map.insert(seg.to_string(), Value::String("***".to_string()));
            }
        } else if let Some(child) = map.get_mut(seg) {
            set_masked(child, parts, i + 1);
        }
    }
}

// ── identity / username ─────────────────────────────────────────────────

/// Case-insensitive header lookup (Axum HeaderMap is case-insensitive; the
/// broker stores headers in a plain HashMap so we normalise here).
fn header_get(headers: &HashMap<String, String>, name: &str) -> Option<String> {
    let lname = name.to_ascii_lowercase();
    headers
        .iter()
        .find(|(k, _)| k.to_ascii_lowercase() == lname)
        .map(|(_, v)| v.clone())
}

/// decodeJwtPayload — base64url-decode the claims segment WITHOUT verifying.
/// Mirrors TS: requires `Bearer <token>` (whitespace after Bearer).
fn decode_jwt_payload(auth_header: Option<&str>) -> Option<Value> {
    let h = auth_header?;
    let lower = h.trim_start();
    if lower.len() < 6 || !lower[..6].eq_ignore_ascii_case("bearer") {
        return None;
    }
    let after = &lower[6..];
    if !after.starts_with(char::is_whitespace) {
        return None;
    }
    let token = after.trim_start();
    if token.is_empty() {
        return None;
    }
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let b64 = parts[1].replace('-', "+").replace('_', "/");
    let pad = (4 - b64.len() % 4) % 4;
    let padded = format!("{}{}", b64, "=".repeat(pad));
    let decoded = base64::engine::general_purpose::STANDARD.decode(padded.as_bytes()).ok()?;
    let json = String::from_utf8(decoded).ok()?;
    serde_json::from_str::<Value>(&json).ok()
}

/// extractUsername — dispatch on usernameSource, then universal x-user-id
/// fallback. Source order is NOT a cascade: only the configured branch runs.
pub fn extract_username(
    headers: &HashMap<String, String>,
    body: &Value,
    resolved: &ResolvedFormat,
) -> Option<String> {
    let src = resolved.username_source.as_deref();

    if src == Some("STATIC") {
        if let Some(s) = resolved.username_static.as_ref() {
            if !s.is_empty() {
                return Some(s.clone());
            }
        }
    }

    if src == Some("BODY_PATH") {
        if let Some(field) = resolved.username_field.as_ref() {
            if let Some(Value::String(v)) = json_path_get_smart(body, field) {
                if !v.is_empty() {
                    return Some(v);
                }
            }
        }
    }

    if src == Some("HEADER") {
        if let Some(field) = resolved.username_field.as_ref() {
            if let Some(v) = header_get(headers, field) {
                if !v.is_empty() {
                    return Some(v);
                }
            }
        }
    }

    if src == Some("JWT_CLAIM") {
        if let Some(field) = resolved.username_field.as_ref() {
            if let Some(claims) = decode_jwt_payload(header_get(headers, "authorization").as_deref()) {
                if let Some(Value::String(v)) = claims.get(field) {
                    if !v.is_empty() {
                        return Some(v.clone());
                    }
                }
            }
        }
    }

    // SESSION not implemented. Universal fallback:
    header_get(headers, "x-user-id")
}

// ── transaction key ─────────────────────────────────────────────────────

/// Mirror JS `String(v)` for primitive values (the realistic txn-key case).
fn js_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// extractTransactionKey — `"FY|AGC"` style key, or None if any step fails.
pub fn extract_transaction_key(body: &Value, resolved: &ResolvedFormat) -> Option<String> {
    let clob_path = resolved.clob_path.as_ref().filter(|s| !s.is_empty())?;
    let fields = resolved.transaction_key_fields.as_ref().filter(|f| !f.is_empty())?;

    let raw = json_path_get_with_wildcard(body, clob_path)?;
    let parsed: Value = match &raw {
        Value::String(s) => serde_json::from_str::<Value>(s).ok()?,
        Value::Object(_) => raw.clone(),
        _ => return None,
    };
    let obj = parsed.as_object()?;

    let parts: Vec<String> = fields
        .iter()
        .map(|f| match obj.get(f) {
            None | Some(Value::Null) => String::new(),
            Some(v) => js_string(v),
        })
        .collect();
    if parts.iter().all(|p| p.is_empty()) {
        return None;
    }
    Some(parts.join("|"))
}

// ── screen-button detection (provenance) ────────────────────────────────

/// matchScreenButton — first button whose detection rule matches. Detection
/// value is treated as a regex; on invalid regex it falls back to substring.
pub fn match_screen_button<'a>(
    headers: &HashMap<String, String>,
    query: &HashMap<String, String>,
    body: &Value,
    buttons: &'a [ScreenButtonRow],
) -> Option<&'a ScreenButtonRow> {
    for b in buttons {
        let src = b.detection_source.as_deref();
        if src.is_none() || src == Some("MANUAL") {
            continue;
        }
        let expected = match b.detection_value.as_deref() {
            Some(e) if !e.is_empty() => e,
            _ => continue,
        };
        let actual: Option<String> = match src {
            Some("REFERER") => header_get(headers, "referer"),
            Some("HEADER") => match b.detection_field.as_deref() {
                Some(f) => header_get(headers, f),
                None => continue,
            },
            Some("BODY_PATH") => match b.detection_field.as_deref() {
                Some(f) => Some(match json_path_get(body, f) {
                    Some(Value::String(s)) => s,
                    Some(Value::Null) | None => String::new(),
                    Some(other) => js_string(&other),
                }),
                None => continue,
            },
            Some("QUERY") => match b.detection_field.as_deref() {
                Some(f) => query.get(f).cloned(),
                None => continue,
            },
            _ => continue,
        };
        let actual = match actual {
            Some(a) => a,
            None => continue,
        };
        let matched = match regex::Regex::new(expected) {
            Ok(re) => re.is_match(&actual),
            Err(_) => actual.contains(expected),
        };
        if matched {
            return Some(b);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn path_plain_and_indexed() {
        let obj = json!({"a": {"b": [ {"c": 1}, {"c": 2} ]}});
        assert_eq!(json_path_get(&obj, "$.a.b[1].c"), Some(json!(2)));
        assert_eq!(json_path_get(&obj, "a.b[0].c"), Some(json!(1)));
        assert_eq!(json_path_get(&obj, "$.a.missing"), None);
        assert_eq!(json_path_get(&obj, "$.a.b[9].c"), None);
        // identity
        assert_eq!(json_path_get(&obj, "$"), Some(obj.clone()));
    }

    #[test]
    fn wildcard_first_match() {
        let obj = json!({"object": {"k1": {"req": {"user": "alice"}}}});
        assert_eq!(
            json_path_get_with_wildcard(&obj, "$.object.*.req.user"),
            Some(json!("alice"))
        );
    }

    #[test]
    fn smart_parses_stringified_clob() {
        // Envelope shape: request is a JSON-encoded string.
        let clob = r#"{"request":{"user_name":"john"}}"#;
        let obj = json!({"object": {"input_x": clob}});
        assert_eq!(
            json_path_get_smart(&obj, "$.object.*.request.user_name"),
            Some(json!("john"))
        );
    }

    #[test]
    fn mask_basic_wildcard_and_noop() {
        let body = json!({"password": "secret", "nested": {"a": "x", "b": "y"}, "keep": 1});
        let masked = apply_mask(
            &body,
            &["$.password".into(), "$.nested.*".into(), "$.does.not.exist".into()],
        );
        assert_eq!(masked["password"], json!("***"));
        assert_eq!(masked["nested"]["a"], json!("***"));
        assert_eq!(masked["nested"]["b"], json!("***"));
        assert_eq!(masked["keep"], json!(1)); // untouched
        // original unchanged (clone semantics)
        assert_eq!(body["password"], json!("secret"));
    }

    #[test]
    fn transaction_key_join_and_empty() {
        let resolved = ResolvedFormat {
            clob_path: Some("$.object.*.request".into()),
            transaction_key_fields: Some(vec!["YEAR".into(), "ORG".into()]),
            ..Default::default()
        };
        // CLOB as a stringified object
        let req = r#"{"YEAR":2025,"ORG":"A07"}"#;
        let body = json!({"object": {"input_x": {"request": req}}});
        assert_eq!(extract_transaction_key(&body, &resolved), Some("2025|A07".into()));

        // all-empty → None
        let body2 = json!({"object": {"input_x": {"request": r#"{"X":1}"#}}});
        assert_eq!(extract_transaction_key(&body2, &resolved), None);
    }

    #[test]
    fn username_static_body_header_fallback() {
        let mut headers = HashMap::new();
        headers.insert("X-User-Id".to_string(), "fallback-user".to_string());

        // STATIC wins
        let r = ResolvedFormat {
            username_source: Some("STATIC".into()),
            username_static: Some("svc".into()),
            ..Default::default()
        };
        assert_eq!(extract_username(&headers, &json!({}), &r), Some("svc".into()));

        // BODY_PATH via smart walker
        let r = ResolvedFormat {
            username_source: Some("BODY_PATH".into()),
            username_field: Some("$.object.*.request.user_name".into()),
            ..Default::default()
        };
        let body = json!({"object": {"in": r#"{"request":{"user_name":"Mr. A"}}"#}});
        assert_eq!(extract_username(&headers, &body, &r), Some("Mr. A".into()));

        // No source → x-user-id fallback
        let r = ResolvedFormat::default();
        assert_eq!(extract_username(&headers, &json!({}), &r), Some("fallback-user".into()));
    }

    #[test]
    fn jwt_claim_decode() {
        // {"preferred_username":"jdoe"} — base64url, unsigned
        let token = "eyJhbGciOiJIUzI1NiJ9.eyJwcmVmZXJyZWRfdXNlcm5hbWUiOiJqZG9lIn0.sig";
        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), format!("Bearer {}", token));
        let r = ResolvedFormat {
            username_source: Some("JWT_CLAIM".into()),
            username_field: Some("preferred_username".into()),
            ..Default::default()
        };
        assert_eq!(extract_username(&headers, &json!({}), &r), Some("jdoe".into()));
    }

    #[test]
    fn resolve_override_beats_library() {
        let mut fmt = MessageFormat {
            ref_type: Some("ITEM".into()), // override
            ..Default::default()
        };
        fmt.field_mapping = Some(FieldMappingLib {
            ref_type: Some("WORK_PLAN".into()),   // library (loses)
            ref_id_path: Some("$.id".into()),      // library (used — no override)
            clob_path: Some("$.clob".into()),
            ..Default::default()
        });
        let r = resolve_format(&fmt);
        assert_eq!(r.ref_type.as_deref(), Some("ITEM"));
        assert_eq!(r.ref_id_path.as_deref(), Some("$.id"));
        assert_eq!(r.clob_path.as_deref(), Some("$.clob"));
    }
}
