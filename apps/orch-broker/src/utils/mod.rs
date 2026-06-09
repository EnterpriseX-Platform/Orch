use chrono::{DateTime, Utc};
use uuid::Uuid;

pub fn generate_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn current_timestamp() -> DateTime<Utc> {
    Utc::now()
}

pub fn mask_sensitive_data(data: &str, fields: &[&str]) -> String {
    let mut result = data.to_string();
    for field in fields {
        // Simple masking - in production, use proper regex
        let pattern = format!("\"{}\":\"[^\"]*\"", field);
        let replacement = format!("\"{}\":\"***MASKED***\"", field);
        result = result.replace(&pattern, &replacement);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_id() {
        let id1 = generate_id();
        let id2 = generate_id();
        assert_ne!(id1, id2);
        assert_eq!(id1.len(), 36); // UUID v4 length
    }
}
