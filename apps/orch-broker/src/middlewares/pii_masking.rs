// ==========================================
// PII Masking Utility
// Walks a serde_json::Value tree and masks the
// values of sensitive fields (passwords, tokens,
// credit card numbers, phone numbers, emails, …).
// Intended to be called from logging / auditing
// paths before persisting or emitting JSON.
// ==========================================

use serde_json::Value;

pub const MASK_VALUE: &str = "***MASKED***";

/// Sensitive field names that are fully replaced with `***MASKED***`.
/// Comparison is case-insensitive.
const FULL_MASK_FIELDS: &[&str] = &[
    "password",
    "passwd",
    "pwd",
    "token",
    "secret",
    "apikey",
    "api_key",
    "credit_card",
    "creditcard",
    "card_number",
    "cardnumber",
    "cvv",
    "ssn",
    "passport",
    "phone",
    "mobile",
];

/// Fields that receive partial masking (keeping a hint of the original value).
const PARTIAL_MASK_FIELDS: &[&str] = &["email"];

/// Recursively mask PII in a JSON value in place.
pub fn mask_pii(json: &mut Value) {
    match json {
        Value::Object(map) => {
            for (key, val) in map.iter_mut() {
                let lower = key.to_lowercase();

                if FULL_MASK_FIELDS.iter().any(|f| *f == lower) {
                    *val = Value::String(MASK_VALUE.to_string());
                    continue;
                }

                if PARTIAL_MASK_FIELDS.iter().any(|f| *f == lower) {
                    if let Value::String(s) = val {
                        *val = Value::String(mask_email(s));
                    }
                    continue;
                }

                // Recurse into nested objects/arrays.
                mask_pii(val);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                mask_pii(v);
            }
        }
        _ => {}
    }
}

/// Partially mask an email: keep the first 2 characters of the local part
/// and the full domain, e.g. `tester@example.com` → `te***@example.com`.
pub fn mask_email(email: &str) -> String {
    match email.split_once('@') {
        Some((local, domain)) => {
            let visible: String = local.chars().take(2).collect();
            format!("{}***@{}", visible, domain)
        }
        None => MASK_VALUE.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_mask_basic_fields() {
        let mut v = json!({
            "username": "alice",
            "password": "s3cret",
            "token": "abc",
            "nested": { "api_key": "xyz", "ok": 1 }
        });
        mask_pii(&mut v);
        assert_eq!(v["password"], MASK_VALUE);
        assert_eq!(v["token"], MASK_VALUE);
        assert_eq!(v["nested"]["api_key"], MASK_VALUE);
        assert_eq!(v["username"], "alice");
        assert_eq!(v["nested"]["ok"], 1);
    }

    #[test]
    fn test_mask_email_partial() {
        let mut v = json!({ "email": "tester@example.com" });
        mask_pii(&mut v);
        assert_eq!(v["email"], "te***@example.com");
    }

    #[test]
    fn test_mask_array() {
        let mut v = json!([
            { "password": "a" },
            { "email": "bob@x.io" }
        ]);
        mask_pii(&mut v);
        assert_eq!(v[0]["password"], MASK_VALUE);
        assert_eq!(v[1]["email"], "bo***@x.io");
    }
}
