use crate::config::XpathField;
use crate::models::ExtractedValue;
use std::collections::HashMap;
use tracing::{error, warn};

pub struct XpathExtractor;

impl XpathExtractor {
    pub fn extract_from_xml(
        xml_content: &str,
        fields: &[XpathField],
    ) -> HashMap<String, ExtractedValue> {
        let mut result = HashMap::new();

        // Try to parse XML and extract fields using XPath
        match sxd_document::parse(xml_content) {
            Ok(package) => {
                let document = package.as_document();
                let factory = sxd_xpath::Factory::new();

                for field in fields {
                    match factory.build(&field.xpath) {
                        Ok(Some(xpath)) => {
                            let context = sxd_xpath::Context::new();
                            match xpath.evaluate(&context, document.root()) {
                                Ok(value) => {
                                    let extracted = Self::convert_value(value, &field.field_type);
                                    result.insert(field.name.clone(), extracted);
                                }
                                Err(e) => {
                                    warn!("Failed to evaluate XPath '{}': {}", field.xpath, e);
                                }
                            }
                        }
                        Ok(None) => {
                            warn!("Empty XPath expression: {}", field.xpath);
                        }
                        Err(e) => {
                            error!("Failed to build XPath '{}': {}", field.xpath, e);
                        }
                    }
                }
            }
            Err(e) => {
                error!("Failed to parse XML: {}", e);
            }
        }

        result
    }

    pub fn extract_from_json(
        json_content: &str,
        fields: &[XpathField],
    ) -> HashMap<String, ExtractedValue> {
        let mut result = HashMap::new();

        match serde_json::from_str::<serde_json::Value>(json_content) {
            Ok(json) => {
                for field in fields {
                    // Convert XPath-like expression to JSON pointer
                    let pointer = Self::xpath_to_json_pointer(&field.xpath);
                    
                    if let Some(value) = json.pointer(&pointer) {
                        let extracted = Self::convert_json_value(value, &field.field_type);
                        result.insert(field.name.clone(), extracted);
                    }
                }
            }
            Err(e) => {
                error!("Failed to parse JSON: {}", e);
            }
        }

        result
    }

    fn xpath_to_json_pointer(xpath: &str) -> String {
        // Convert XPath like "//order/amount" to JSON pointer "/order/amount"
        xpath
            .replace("//", "/")
            .replace("/", "/")
    }

    fn convert_value(
        value: sxd_xpath::Value,
        field_type: &crate::config::FieldType,
    ) -> ExtractedValue {
        let string_value = match value {
            sxd_xpath::Value::String(s) => s,
            sxd_xpath::Value::Number(n) => return ExtractedValue::Number(n),
            sxd_xpath::Value::Boolean(b) => return ExtractedValue::Boolean(b),
            _ => value.string(),
        };

        match field_type {
            crate::config::FieldType::Number => {
                string_value.parse::<f64>().map_or_else(
                    |_| ExtractedValue::String(string_value),
                    ExtractedValue::Number,
                )
            }
            crate::config::FieldType::Boolean => {
                ExtractedValue::Boolean(string_value.to_lowercase() == "true")
            }
            crate::config::FieldType::Date => ExtractedValue::Date(string_value),
            crate::config::FieldType::Json => {
                serde_json::from_str(&string_value)
                    .map_or_else(|_| ExtractedValue::String(string_value), ExtractedValue::Json)
            }
            crate::config::FieldType::String => ExtractedValue::String(string_value),
        }
    }

    fn convert_json_value(
        value: &serde_json::Value,
        field_type: &crate::config::FieldType,
    ) -> ExtractedValue {
        match field_type {
            crate::config::FieldType::Number => {
                value.as_f64().map_or_else(
                    || ExtractedValue::String(value.to_string()),
                    ExtractedValue::Number,
                )
            }
            crate::config::FieldType::Boolean => {
                ExtractedValue::Boolean(value.as_bool().unwrap_or(false))
            }
            crate::config::FieldType::Date => ExtractedValue::Date(value.to_string()),
            crate::config::FieldType::Json => ExtractedValue::Json(value.clone()),
            crate::config::FieldType::String => {
                ExtractedValue::String(value.as_str().unwrap_or("").to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_from_json() {
        let json = r#"{"orders": {"amount": 1000000, "department": {"code": "D001"}}}"#;
        let fields = vec![
            XpathField {
                name: "amount".to_string(),
                xpath: "//order/amount".to_string(),
                field_type: crate::config::FieldType::Number,
            },
        ];

        let result = XpathExtractor::extract_from_json(json, &fields);
        assert!(result.contains_key("amount"));
    }
}
