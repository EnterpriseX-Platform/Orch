// ==========================================
// API Resolver Service
// Resolve ApiRegistration from path to get backend URL + linked flow
// + MessageFormat, AuthConfig, HeaderMappings
// ==========================================

use crate::config::system_config::attach_internal_token;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Message Format for discriminator-based routing + audit
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MessageFormat {
    pub id: String,
    pub name: String,
    pub discriminator_source: String,  // NONE, BODY, HEADER
    pub discriminator_field: Option<String>,
    pub discriminator_value: Option<String>,
    pub flow_id: Option<String>,       // Flow to execute for this format (shared endpoint)
    pub audit_enabled: bool,
    pub pk_xpath: Option<String>,
    pub audit_fields: Option<serde_json::Value>,
    pub extraction_config: Option<serde_json::Value>,

    // ── Audit enrichment — MessageFormat override fields. Resolved
    //    against `field_mapping` library at enrich time (override >
    //    library > null). Ported from the Next.js gateway resolver so
    //    the broker audit node builds the full audit row itself.
    #[serde(default)] pub ref_type: Option<String>,
    #[serde(default)] pub ref_id_path: Option<String>,
    #[serde(default)] pub ref_no_path: Option<String>,
    #[serde(default)] pub ref_name_path: Option<String>,
    #[serde(default)] pub user_id_path: Option<String>,
    #[serde(default)] pub username_source: Option<String>,
    #[serde(default)] pub username_field: Option<String>,
    #[serde(default)] pub username_static: Option<String>,
    #[serde(default)] pub mask_paths: Option<Vec<String>>,
    #[serde(default)] pub action_type: Option<String>,
    #[serde(default)] pub action_label: Option<String>,
    #[serde(default)] pub system: Option<String>,
    #[serde(default)] pub screen_code: Option<String>,
    #[serde(default)] pub screen_name: Option<String>,
    #[serde(default)] pub tab_name: Option<String>,
    #[serde(default)] pub code: Option<String>,
    #[serde(default)] pub match_rules: Option<serde_json::Value>,

    // Library refs + datasets + call-sites (for enrichment)
    #[serde(default)] pub field_mapping: Option<FieldMappingLib>,
    #[serde(default)] pub audit_config: Option<AuditConfigLib>,
    #[serde(default)] pub data_catalogs: Vec<DataCatalogRef>,
    #[serde(default)] pub buttons: Vec<ScreenButtonRow>,
}

/// FieldMapping library entry — subset used for audit enrichment.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct FieldMappingLib {
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
}

/// AuditConfig library entry.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct AuditConfigLib {
    pub enabled: Option<bool>,
    pub audit_fields: Option<serde_json::Value>,
}

/// DataCatalog reference carried into the audit row (spec).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DataCatalogRef {
    pub id: String,
    pub name: String,
    pub category: String,
}

/// ScreenButton call-site — provenance + request→button detection.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ScreenButtonRow {
    pub id: String,
    pub tab_name: Option<String>,
    pub button_label: Option<String>,
    pub action_type: Option<String>,
    pub detection_source: Option<String>,
    pub detection_field: Option<String>,
    pub detection_value: Option<String>,
    pub screen_code: Option<String>,
    pub screen_name: Option<String>,
    pub screen_system: Option<String>,
}

// ── Audit-enrichment JSON parse helpers ─────────────────────────────
fn ar_json_str(v: &serde_json::Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}

fn ar_json_str_array(v: &serde_json::Value) -> Option<Vec<String>> {
    v.as_array()
        .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
}

fn ar_parse_field_mapping(v: &serde_json::Value) -> Option<FieldMappingLib> {
    if v.is_null() {
        return None;
    }
    Some(FieldMappingLib {
        ref_type: ar_json_str(v, "refType"),
        ref_id_path: ar_json_str(v, "refIdPath"),
        ref_no_path: ar_json_str(v, "refNoPath"),
        ref_name_path: ar_json_str(v, "refNamePath"),
        pk_xpath: ar_json_str(v, "pkXPath"),
        username_source: ar_json_str(v, "usernameSource"),
        username_field: ar_json_str(v, "usernameField"),
        username_static: ar_json_str(v, "usernameStatic"),
        clob_path: ar_json_str(v, "clobPath"),
        transaction_key_fields: ar_json_str_array(&v["transactionKeyFields"]),
    })
}

fn ar_parse_audit_config(v: &serde_json::Value) -> Option<AuditConfigLib> {
    if v.is_null() {
        return None;
    }
    Some(AuditConfigLib {
        enabled: v.get("enabled").and_then(|x| x.as_bool()),
        audit_fields: v.get("auditFields").filter(|x| !x.is_null()).cloned(),
    })
}

fn ar_parse_data_catalogs(v: &serde_json::Value) -> Vec<DataCatalogRef> {
    v.as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|c| {
                    Some(DataCatalogRef {
                        id: c.get("id")?.as_str()?.to_string(),
                        name: c.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                        category: c.get("category").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn ar_parse_buttons(v: &serde_json::Value) -> Vec<ScreenButtonRow> {
    v.as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|b| {
                    let screen = b.get("screen");
                    Some(ScreenButtonRow {
                        id: b.get("id")?.as_str()?.to_string(),
                        tab_name: ar_json_str(b, "tabName"),
                        button_label: ar_json_str(b, "buttonLabel"),
                        action_type: ar_json_str(b, "actionType"),
                        detection_source: ar_json_str(b, "detectionSource"),
                        detection_field: ar_json_str(b, "detectionField"),
                        detection_value: ar_json_str(b, "detectionValue"),
                        screen_code: screen.and_then(|s| s.get("code")).and_then(|x| x.as_str()).map(|s| s.to_string()),
                        screen_name: screen.and_then(|s| s.get("name")).and_then(|x| x.as_str()).map(|s| s.to_string()),
                        screen_system: screen.and_then(|s| s.get("system")).and_then(|x| x.as_str()).map(|s| s.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Auth config detail for API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiAuthConfig {
    pub auth_scheme: String,           // NONE, JWT, API_KEY, OAUTH2, BASIC, CUSTOM
    pub jwt_issuer: Option<String>,
    pub jwt_audience: Option<String>,
    pub jwt_claims: Option<serde_json::Value>,
    pub jwt_algorithm: Option<String>,
    pub oauth2_auth_url: Option<String>,
    pub oauth2_token_url: Option<String>,
    pub oauth2_scopes: Option<Vec<String>>,
    pub oauth2_flow: Option<String>,
    pub api_key_location: Option<String>,  // HEADER, QUERY, COOKIE
    pub api_key_name: Option<String>,
    pub api_key_value: Option<String>,
    pub custom_auth_config: Option<serde_json::Value>,
}

/// Header mapping rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderMapping {
    pub id: String,
    pub direction: String,       // REQUEST, RESPONSE
    pub header_name: String,
    pub header_value: String,    // supports ${variable} templates
    pub action: String,          // SET, APPEND, REMOVE, PASSTHROUGH
    pub condition: Option<String>,
    pub order: i32,
}

/// API Registration from database
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ApiRegistration {
    pub id: String,
    pub name: String,
    pub endpoint: String,      // Path pattern e.g. /api/v1/payments
    pub method: String,        // GET, POST, PUT, DELETE
    pub backend_url: String,   // Backend URL to proxy to
    pub flow_id: Option<String>, // Flow to execute (if any)
    pub auth_type: Option<String>,
    pub api_key: Option<String>,
    pub api_key_header: Option<String>,
    pub rate_limit_per_min: i32,
    pub status: String,
    pub api_type: String,      // REST, MICROFLOW
    pub timeout: i32,
    pub retries: i32,
    pub route_type: String,    // DEDICATED (default) or SHARED_ENDPOINT
    pub routing_key: Option<String>, // JSONPath for body-based routing e.g. $.flowName
    pub auto_discover_formats: bool, // Auto-create message formats from traffic
    pub project_id: Option<String>,  // For project-scoped system_configs lookup
    // Application-level config (flattened from resolve endpoint)
    pub application_base_url: Option<String>,
    pub application_auth_type: Option<String>,
    // Related data
    pub message_formats: Vec<MessageFormat>,
    pub auth_config: Option<ApiAuthConfig>,
    pub header_mappings: Vec<HeaderMapping>,
}

impl ApiRegistration {
    /// Get effective auth type (API level or fallback to Application level)
    pub fn effective_auth_type(&self) -> &str {
        self.auth_type.as_deref()
            .unwrap_or_else(|| {
                self.application_auth_type.as_deref().unwrap_or("NONE")
            })
    }

    /// Is this a shared endpoint?
    pub fn is_shared_endpoint(&self) -> bool {
        self.route_type == "SHARED_ENDPOINT" || self.route_type == "shared_endpoint"
    }

    /// Resolve the effective flow_id for this request.
    /// For SHARED_ENDPOINT: strict — only return a flow_id when a
    ///   MessageFormat actually matched the body / headers. The
    ///   previous behaviour was to fall back to the API-level flow_id
    ///   when no format matched, which then 404'd at the broker if
    ///   that flow happened not to be deployed and ate any traffic
    ///   carrying an unknown discriminator value (e.g. a microflow
    ///   name not yet registered as a MessageFormat). Returning None
    ///   here lets execute.rs fall through to backend pass-through.
    /// For DEDICATED: use the api's flow_id directly.
    pub fn resolve_effective_flow_id(
        &self,
        body: &serde_json::Value,
        headers: &HashMap<String, String>,
    ) -> Option<String> {
        if self.is_shared_endpoint() {
            self.resolve_message_format(body, headers)
                .and_then(|fmt| fmt.flow_id.clone())
        } else {
            self.flow_id.clone()
        }
    }

    /// For shared endpoint: resolve using routing_key as discriminator_field
    pub fn resolve_message_format_by_routing_key(
        &self,
        body: &serde_json::Value,
    ) -> Option<&MessageFormat> {
        let routing_key = self.routing_key.as_deref()?;
        // Strip $. prefix for JSONPath compatibility
        let field = routing_key.strip_prefix("$.").unwrap_or(routing_key);
        let actual_value = get_json_value(body, field)?;
        let actual_str = actual_value.as_str()?;

        self.message_formats.iter().find(|fmt| {
            fmt.discriminator_value.as_deref() == Some(actual_str)
        })
    }

    /// Resolve message format from request body and headers
    pub fn resolve_message_format(
        &self,
        body: &serde_json::Value,
        headers: &HashMap<String, String>,
    ) -> Option<&MessageFormat> {
        if self.message_formats.is_empty() {
            return None;
        }

        // For shared endpoints, try routing_key first
        if self.is_shared_endpoint() {
            if let Some(fmt) = self.resolve_message_format_by_routing_key(body) {
                return Some(fmt);
            }
        }

        // Single format with NONE discriminator → use it
        if self.message_formats.len() == 1 {
            let fmt = &self.message_formats[0];
            if fmt.discriminator_source == "NONE" {
                return Some(fmt);
            }
        }

        // Match by discriminator
        for fmt in &self.message_formats {
            match fmt.discriminator_source.as_str() {
                "NONE" => {
                    // NONE matches if it's the only one (handled above)
                    // If there are multiple, NONE is a fallback
                    continue;
                }
                "BODY" => {
                    if let (Some(field), Some(expected_value)) = (&fmt.discriminator_field, &fmt.discriminator_value) {
                        // Simple JSONPath: extract from body using dot notation
                        let actual = get_json_value(body, field);
                        if let Some(actual_str) = actual.and_then(|v| v.as_str()) {
                            if actual_str == expected_value {
                                return Some(fmt);
                            }
                        }
                    }
                }
                "HEADER" => {
                    if let (Some(field), Some(expected_value)) = (&fmt.discriminator_field, &fmt.discriminator_value) {
                        let header_key = field.to_lowercase();
                        if let Some(actual) = headers.get(&header_key) {
                            if actual == expected_value {
                                return Some(fmt);
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // Fallback: return first NONE discriminator format
        self.message_formats.iter()
            .find(|fmt| fmt.discriminator_source == "NONE")
    }
}

/// Simple dot-notation JSON value extraction
pub fn get_json_value<'a>(json: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = json;
    for part in parts {
        match current {
            serde_json::Value::Object(map) => {
                current = map.get(part)?;
            }
            serde_json::Value::Array(arr) => {
                let idx: usize = part.parse().ok()?;
                current = arr.get(idx)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

/// Default negative-cache TTL when the runtime config doesn't
/// override it. Tuneable via system_configs key
/// `broker.l1NegativeCacheTtlSecs` or env L1_NEGATIVE_CACHE_TTL.
///
/// 5 min is long enough to be effectively "forever" for the
/// hot-path workload while still bounding the wait when an
/// admin registers a brand-new path. Periodic refresh_cache
/// also flushes the negative cache so positive cache changes
/// kick the negatives out automatically.
const DEFAULT_NEGATIVE_CACHE_TTL_SECS: i64 = 300;

/// API Registry - manages ApiRegistrations
pub struct ApiRegistry {
    api_base_url: String,
    cache: Arc<RwLock<HashMap<String, ApiRegistration>>>, // key = endpoint
    /// "method:path" → time when we confirmed no registration.
    /// Skip the resolve fetch while still inside the TTL window.
    negative_cache: Arc<RwLock<HashMap<String, std::time::Instant>>>,
    http_client: reqwest::Client,
}

impl ApiRegistry {
    pub fn new(api_base_url: &str) -> Self {
        Self {
            api_base_url: api_base_url.to_string(),
            cache: Arc::new(RwLock::new(HashMap::new())),
            negative_cache: Arc::new(RwLock::new(HashMap::new())),
            http_client: reqwest::Client::new(),
        }
    }

    /// Resolve ApiRegistration from path and method
    pub async fn resolve(&self, path: &str, method: &str) -> anyhow::Result<Option<ApiRegistration>> {
        // 1. Try positive cache first
        {
            let cache = self.cache.read().await;
            for (_, api) in cache.iter() {
                if self.path_matches(&api.endpoint, path) &&
                   self.method_matches(&api.method, method) &&
                   api.status == "ACTIVE" {
                    info!("✅ API found in cache: {} {} -> backend: {}", method, path, api.backend_url);
                    return Ok(Some(api.clone()));
                }
            }
        }

        // 2. Negative cache — paths recently confirmed unregistered.
        // TTL is admin-tunable via system_configs.
        let neg_ttl = crate::config::system::get_i64(
            "broker.l1NegativeCacheTtlSecs",
            "L1_NEGATIVE_CACHE_TTL",
            DEFAULT_NEGATIVE_CACHE_TTL_SECS,
        ).await.max(0) as u64;
        let neg_key = format!("{}:{}", method, path);
        {
            let neg = self.negative_cache.read().await;
            if let Some(at) = neg.get(&neg_key) {
                if at.elapsed().as_secs() < neg_ttl {
                    debug!("🚫 Negative cache hit: {} {}", method, path);
                    return Ok(None);
                }
            }
        }

        // 3. Not in either cache — go fetch
        info!("🔍 API not in cache, fetching from resolve endpoint: {} {}", method, path);

        match self.fetch_from_resolve(path, method).await {
            Ok(Some(api)) => {
                let mut cache = self.cache.write().await;
                cache.insert(api.id.clone(), api.clone());
                Ok(Some(api))
            }
            Ok(None) => {
                warn!("❌ No API registration found for {} {}", method, path);
                let mut neg = self.negative_cache.write().await;
                neg.insert(neg_key, std::time::Instant::now());
                Ok(None)
            }
            Err(e) => {
                error!("❌ Failed to fetch API registration: {}", e);
                Err(e)
            }
        }
    }

    /// Fetch single API from resolve endpoint (with full details)
    async fn fetch_from_resolve(&self, path: &str, method: &str) -> anyhow::Result<Option<ApiRegistration>> {
        let url = format!("{}/api/registers/resolve", self.api_base_url);

        let response = attach_internal_token(self.http_client.get(&url))
            .query(&[("path", path), ("method", method)])
            .send()
            .await?;

        // 404 from resolve = "no matching API for this path+method". That's
        // a legitimate Level-1 miss — return Ok(None) so execute.rs falls
        // through to Level 2 (pathPrefix) / Level 3 (defaultBackendUrl).
        // Treating it as Err causes a 500 for any unregistered path, which
        // defeats the whole point of the passthrough design.
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("API error: {}", error_text));
        }

        let data: serde_json::Value = response.json().await?;

        // Support both { data: {...} } and { api: {...}, messageFormats: [...] } formats
        if let Some(api_data) = data.get("data") {
            if api_data.is_null() {
                return Ok(None);
            }
            return Ok(Some(self.parse_api_registration_full(api_data)?));
        }

        // Resolve endpoint returns { api: {...}, messageFormats: [...] }
        if let Some(api_data) = data.get("api") {
            if api_data.is_null() {
                return Ok(None);
            }
            // Merge messageFormats into api_data for parsing
            let mut merged = api_data.clone();
            if let Some(formats) = data.get("messageFormats") {
                merged["messageFormats"] = formats.clone();
            }
            return Ok(Some(self.parse_api_registration_full(&merged)?));
        }

        Ok(None)
    }

    /// Parse full API registration with message formats, auth config, header mappings
    fn parse_api_registration_full(&self, data: &serde_json::Value) -> anyhow::Result<ApiRegistration> {
        let message_formats = data.get("messageFormats")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter().filter_map(|fmt| {
                    Some(MessageFormat {
                        id: fmt["id"].as_str()?.to_string(),
                        name: fmt["name"].as_str().unwrap_or("").to_string(),
                        discriminator_source: fmt["discriminatorSource"].as_str().unwrap_or("NONE").to_string(),
                        discriminator_field: fmt["discriminatorField"].as_str().map(|s| s.to_string()),
                        discriminator_value: fmt["discriminatorValue"].as_str().map(|s| s.to_string()),
                        flow_id: fmt["flowId"].as_str().map(|s| s.to_string()),
                        audit_enabled: fmt["auditEnabled"].as_bool().unwrap_or(false),
                        pk_xpath: fmt["pkXPath"].as_str().map(|s| s.to_string()),
                        audit_fields: fmt.get("auditFields").cloned(),
                        extraction_config: fmt.get("extractionConfig").cloned(),
                        ref_type: ar_json_str(fmt, "refType"),
                        ref_id_path: ar_json_str(fmt, "refIdPath"),
                        ref_no_path: ar_json_str(fmt, "refNoPath"),
                        ref_name_path: ar_json_str(fmt, "refNamePath"),
                        user_id_path: ar_json_str(fmt, "userIdPath"),
                        username_source: ar_json_str(fmt, "usernameSource"),
                        username_field: ar_json_str(fmt, "usernameField"),
                        username_static: ar_json_str(fmt, "usernameStatic"),
                        mask_paths: ar_json_str_array(&fmt["maskPaths"]),
                        action_type: ar_json_str(fmt, "actionType"),
                        action_label: ar_json_str(fmt, "actionLabel"),
                        system: ar_json_str(fmt, "system"),
                        screen_code: ar_json_str(fmt, "screenCode"),
                        screen_name: ar_json_str(fmt, "screenName"),
                        tab_name: ar_json_str(fmt, "tabName"),
                        code: ar_json_str(fmt, "code"),
                        match_rules: fmt.get("matchRules").filter(|v| !v.is_null()).cloned(),
                        field_mapping: ar_parse_field_mapping(&fmt["fieldMapping"]),
                        audit_config: ar_parse_audit_config(&fmt["auditConfig"]),
                        data_catalogs: ar_parse_data_catalogs(&fmt["dataCatalogs"]),
                        buttons: ar_parse_buttons(&fmt["buttons"]),
                    })
                }).collect()
            })
            .unwrap_or_default();

        let auth_config = data.get("authConfig")
            .and_then(|v| {
                if v.is_null() { return None; }
                Some(ApiAuthConfig {
                    auth_scheme: v["authScheme"].as_str().unwrap_or("NONE").to_string(),
                    jwt_issuer: v["jwtIssuer"].as_str().map(|s| s.to_string()),
                    jwt_audience: v["jwtAudience"].as_str().map(|s| s.to_string()),
                    jwt_claims: v.get("jwtClaims").cloned(),
                    jwt_algorithm: v["jwtAlgorithm"].as_str().map(|s| s.to_string()),
                    oauth2_auth_url: v["oauth2AuthUrl"].as_str().map(|s| s.to_string()),
                    oauth2_token_url: v["oauth2TokenUrl"].as_str().map(|s| s.to_string()),
                    oauth2_scopes: v.get("oauth2Scopes")
                        .and_then(|s| s.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()),
                    oauth2_flow: v["oauth2Flow"].as_str().map(|s| s.to_string()),
                    api_key_location: v["apiKeyLocation"].as_str().map(|s| s.to_string()),
                    api_key_name: v["apiKeyName"].as_str().map(|s| s.to_string()),
                    api_key_value: v["apiKeyValue"].as_str().map(|s| s.to_string()),
                    custom_auth_config: v.get("customAuthConfig").cloned(),
                })
            });

        let header_mappings = data.get("headerMappings")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter().filter_map(|h| {
                    Some(HeaderMapping {
                        id: h["id"].as_str()?.to_string(),
                        direction: h["direction"].as_str().unwrap_or("REQUEST").to_string(),
                        header_name: h["headerName"].as_str().unwrap_or("").to_string(),
                        header_value: h["headerValue"].as_str().unwrap_or("").to_string(),
                        action: h["action"].as_str().unwrap_or("SET").to_string(),
                        condition: h["condition"].as_str().map(|s| s.to_string()),
                        order: h["order"].as_i64().unwrap_or(0) as i32,
                    })
                }).collect()
            })
            .unwrap_or_default();

        Ok(ApiRegistration {
            id: data["id"].as_str().unwrap_or("").to_string(),
            name: data["name"].as_str().unwrap_or("").to_string(),
            endpoint: data["endpoint"].as_str().unwrap_or("").to_string(),
            method: data["method"].as_str().unwrap_or("GET").to_string(),
            backend_url: data["backendUrl"].as_str().unwrap_or("").to_string(),
            flow_id: data["flowId"].as_str().map(|s| s.to_string()),
            auth_type: data["authType"].as_str().map(|s| s.to_string()),
            api_key: data["apiKey"].as_str().map(|s| s.to_string()),
            api_key_header: data["apiKeyHeader"].as_str().map(|s| s.to_string()),
            rate_limit_per_min: data["rateLimitPerMin"].as_i64().unwrap_or(1000) as i32,
            status: data["status"].as_str().unwrap_or("DRAFT").to_string(),
            api_type: data["apiType"].as_str().unwrap_or("REST").to_string(),
            timeout: data["timeout"].as_i64().unwrap_or(30) as i32,
            retries: data["retries"].as_i64().unwrap_or(3) as i32,
            route_type: data["routeType"].as_str().unwrap_or("DEDICATED").to_string(),
            routing_key: data["routingKey"].as_str().map(|s| s.to_string()),
            auto_discover_formats: data["autoDiscoverFormats"].as_bool().unwrap_or(false),
            project_id: data["projectId"].as_str().map(|s| s.to_string()),
            application_base_url: data["applicationBaseUrl"].as_str().map(|s| s.to_string()),
            application_auth_type: data["applicationAuthType"].as_str().map(|s| s.to_string()),
            message_formats,
            auth_config,
            header_mappings,
        })
    }

    /// Parse simple API registration (from list endpoint, no nested data)
    fn parse_api_registration_simple(&self, data: &serde_json::Value) -> anyhow::Result<ApiRegistration> {
        Ok(ApiRegistration {
            id: data["id"].as_str().unwrap_or("").to_string(),
            name: data["name"].as_str().unwrap_or("").to_string(),
            endpoint: data["endpoint"].as_str().unwrap_or("").to_string(),
            method: data["method"].as_str().unwrap_or("GET").to_string(),
            backend_url: data["backendUrl"].as_str().unwrap_or("").to_string(),
            flow_id: data["flowId"].as_str().map(|s| s.to_string()),
            auth_type: data["authType"].as_str().map(|s| s.to_string()),
            api_key: data["apiKey"].as_str().map(|s| s.to_string()),
            api_key_header: data["apiKeyHeader"].as_str().map(|s| s.to_string()),
            rate_limit_per_min: data["rateLimitPerMin"].as_i64().unwrap_or(1000) as i32,
            status: data["status"].as_str().unwrap_or("DRAFT").to_string(),
            api_type: data["apiType"].as_str().unwrap_or("REST").to_string(),
            timeout: data["timeout"].as_i64().unwrap_or(30) as i32,
            retries: data["retries"].as_i64().unwrap_or(3) as i32,
            route_type: data["routeType"].as_str().unwrap_or("DEDICATED").to_string(),
            routing_key: data["routingKey"].as_str().map(|s| s.to_string()),
            auto_discover_formats: data["autoDiscoverFormats"].as_bool().unwrap_or(false),
            project_id: data["projectId"].as_str().map(|s| s.to_string()),
            application_base_url: None,
            application_auth_type: None,
            message_formats: Vec::new(),
            auth_config: None,
            header_mappings: Vec::new(),
        })
    }

    /// Check if path matches the pattern
    fn path_matches(&self, pattern: &str, path: &str) -> bool {
        // Strip query string from both pattern and path before comparing
        let pattern_path = pattern.split('?').next().unwrap_or(pattern);
        let request_path = path.split('?').next().unwrap_or(path);

        // Exact match
        if pattern_path == request_path {
            return true;
        }

        // Also check original values for backward compat
        if pattern == path {
            return true;
        }

        // Wildcard: /api/v1/payments/*
        if pattern_path.ends_with("/*") {
            let prefix = &pattern_path[..pattern_path.len()-1];
            return request_path.starts_with(prefix);
        }

        // Path params: /api/v1/payments/:id
        if pattern_path.contains("/:") {
            let pattern_parts: Vec<&str> = pattern_path.split('/').collect();
            let path_parts: Vec<&str> = request_path.split('/').collect();

            if pattern_parts.len() != path_parts.len() {
                return false;
            }

            return pattern_parts.iter().enumerate().all(|(i, part)| {
                if part.starts_with(':') {
                    true // Path param matches anything
                } else {
                    part == &path_parts[i]
                }
            });
        }

        false
    }

    /// Check if method matches
    fn method_matches(&self, api_method: &str, request_method: &str) -> bool {
        let api = api_method.to_uppercase();
        let request = request_method.to_uppercase();
        api == request || api == "ANY"
    }

    /// Refresh entire cache (uses resolve endpoint for full data)
    pub async fn refresh_cache(&self) -> anyhow::Result<()> {
        info!("🔄 Refreshing API registry cache...");

        let url = format!("{}/api/registers/resolve", self.api_base_url);

        let response = attach_internal_token(self.http_client.get(&url))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to fetch APIs: {}", response.status()));
        }

        let api_response: serde_json::Value = response.json().await?;

        let mut cache = self.cache.write().await;
        cache.clear();

        if let Some(regs) = api_response.get("data").and_then(|d| d.as_array()) {
            for reg in regs {
                if let Ok(api) = self.parse_api_registration_full(reg) {
                    if api.status == "ACTIVE" {
                        cache.insert(api.id.clone(), api);
                    }
                }
            }
        }

        // A periodic refresh might have just added a new ApiRegistration
        // for a path that's currently in the negative cache. Wipe it so
        // the next request actually re-checks instead of serving the
        // stale "not found".
        self.negative_cache.write().await.clear();

        info!("✅ API registry cache refreshed: {} APIs loaded", cache.len());
        Ok(())
    }

    /// Get backend URL for path (used in Proxy node)
    pub async fn get_backend_url(&self, path: &str, method: &str) -> Option<String> {
        match self.resolve(path, method).await {
            Ok(Some(api)) => Some(api.backend_url),
            _ => None,
        }
    }

    /// Get linked flow ID for path
    pub async fn get_linked_flow(&self, path: &str, method: &str) -> Option<String> {
        match self.resolve(path, method).await {
            Ok(Some(api)) => api.flow_id,
            _ => None,
        }
    }

    /// Look up an API registration by ID directly from cache
    pub async fn get_by_id(&self, api_id: &str) -> Option<ApiRegistration> {
        let cache = self.cache.read().await;
        cache.get(api_id).cloned()
    }

    /// Get cache size
    pub async fn cache_size(&self) -> usize {
        self.cache.read().await.len()
    }

    /// Invalidate cache entries for a specific API registration
    pub async fn invalidate(&self, api_id: &str) {
        let mut cache = self.cache.write().await;
        let keys_to_remove: Vec<String> = cache.iter()
            .filter(|(_, v)| v.id == api_id)
            .map(|(k, _)| k.clone())
            .collect();
        let count = keys_to_remove.len();
        for key in keys_to_remove {
            cache.remove(&key);
        }
        if count > 0 {
            tracing::info!("🔄 Invalidated {} cache entries for API {}", count, api_id);
        }
    }
}

/// Apply request header mappings before sending to backend
pub fn apply_request_headers(
    mappings: &[HeaderMapping],
    headers: &mut HashMap<String, String>,
    client_headers: &HashMap<String, String>,
    template_fn: &dyn Fn(&str) -> String,
) {
    let mut request_mappings: Vec<&HeaderMapping> = mappings.iter()
        .filter(|m| m.direction == "REQUEST")
        .collect();
    request_mappings.sort_by_key(|m| m.order);

    for mapping in request_mappings {
        let header_name = mapping.header_name.to_lowercase();
        let resolved_value = template_fn(&mapping.header_value);

        match mapping.action.as_str() {
            "SET" => {
                headers.insert(header_name, resolved_value);
            }
            "APPEND" => {
                if let Some(existing) = headers.get(&header_name) {
                    let new_value = format!("{}, {}", existing, resolved_value);
                    headers.insert(header_name, new_value);
                } else {
                    headers.insert(header_name, resolved_value);
                }
            }
            "REMOVE" => {
                headers.remove(&header_name);
            }
            "PASSTHROUGH" => {
                // Forward from client request
                if let Some(client_val) = client_headers.get(&header_name) {
                    headers.insert(header_name, client_val.clone());
                }
            }
            _ => {}
        }
    }
}

/// Apply response header mappings after receiving from backend
pub fn apply_response_headers(
    mappings: &[HeaderMapping],
    headers: &mut HashMap<String, String>,
    template_fn: &dyn Fn(&str) -> String,
) {
    let mut response_mappings: Vec<&HeaderMapping> = mappings.iter()
        .filter(|m| m.direction == "RESPONSE")
        .collect();
    response_mappings.sort_by_key(|m| m.order);

    for mapping in response_mappings {
        let header_name = mapping.header_name.to_lowercase();
        let resolved_value = template_fn(&mapping.header_value);

        match mapping.action.as_str() {
            "SET" => {
                headers.insert(header_name, resolved_value);
            }
            "APPEND" => {
                if let Some(existing) = headers.get(&header_name) {
                    let new_value = format!("{}, {}", existing, resolved_value);
                    headers.insert(header_name, new_value);
                } else {
                    headers.insert(header_name, resolved_value);
                }
            }
            "REMOVE" => {
                headers.remove(&header_name);
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_matching() {
        let registry = ApiRegistry::new("http://localhost:3047");

        // Exact match
        assert!(registry.path_matches("/api/v1/payments", "/api/v1/payments"));

        // Wildcard
        assert!(registry.path_matches("/api/v1/payments/*", "/api/v1/payments/123"));
        assert!(registry.path_matches("/api/v1/*", "/api/v1/payments/123"));

        // Path params
        assert!(registry.path_matches("/api/v1/payments/:id", "/api/v1/payments/123"));
        assert!(!registry.path_matches("/api/v1/payments/:id", "/api/v1/payments/123/details"));

        // No match
        assert!(!registry.path_matches("/api/v1/payments", "/api/v1/users"));
    }

    #[test]
    fn test_method_matching() {
        let registry = ApiRegistry::new("http://localhost:3047");

        assert!(registry.method_matches("GET", "GET"));
        assert!(registry.method_matches("POST", "POST"));
        assert!(!registry.method_matches("GET", "POST"));
        assert!(registry.method_matches("ANY", "GET"));
        assert!(registry.method_matches("ANY", "POST"));
    }

    #[test]
    fn test_discriminator_body_match() {
        let api = ApiRegistration {
            id: "test".to_string(),
            name: "test".to_string(),
            endpoint: "/api/v1/test".to_string(),
            method: "POST".to_string(),
            backend_url: "http://localhost".to_string(),
            flow_id: None,
            auth_type: None,
            api_key: None,
            api_key_header: None,
            rate_limit_per_min: 1000,
            status: "ACTIVE".to_string(),
            api_type: "REST".to_string(),
            timeout: 30,
            retries: 3,
            application_base_url: None,
            application_auth_type: None,
            message_formats: vec![
                MessageFormat {
                    id: "fmt1".to_string(),
                    name: "Format A".to_string(),
                    discriminator_source: "BODY".to_string(),
                    discriminator_field: Some("type".to_string()),
                    discriminator_value: Some("A".to_string()),
                    audit_enabled: true,
                    pk_xpath: None,
                    audit_fields: None,
                    extraction_config: None,
                    ..Default::default()
                },
                MessageFormat {
                    id: "fmt2".to_string(),
                    name: "Format B".to_string(),
                    discriminator_source: "BODY".to_string(),
                    discriminator_field: Some("type".to_string()),
                    discriminator_value: Some("B".to_string()),
                    audit_enabled: false,
                    pk_xpath: None,
                    audit_fields: None,
                    extraction_config: None,
                    ..Default::default()
                },
            ],
            auth_config: None,
            header_mappings: Vec::new(),
            ..Default::default()
        };

        let body_a = serde_json::json!({"type": "A", "data": 123});
        let body_b = serde_json::json!({"type": "B", "data": 456});
        let headers = HashMap::new();

        let fmt_a = api.resolve_message_format(&body_a, &headers);
        assert!(fmt_a.is_some());
        assert_eq!(fmt_a.unwrap().id, "fmt1");

        let fmt_b = api.resolve_message_format(&body_b, &headers);
        assert!(fmt_b.is_some());
        assert_eq!(fmt_b.unwrap().id, "fmt2");
    }

    #[test]
    fn test_header_mapping_apply() {
        let mappings = vec![
            HeaderMapping {
                id: "1".to_string(),
                direction: "REQUEST".to_string(),
                header_name: "X-Custom".to_string(),
                header_value: "value1".to_string(),
                action: "SET".to_string(),
                condition: None,
                order: 1,
            },
            HeaderMapping {
                id: "2".to_string(),
                direction: "REQUEST".to_string(),
                header_name: "X-Custom".to_string(),
                header_value: "value2".to_string(),
                action: "APPEND".to_string(),
                condition: None,
                order: 2,
            },
        ];

        let mut headers = HashMap::new();
        let client_headers = HashMap::new();
        apply_request_headers(&mappings, &mut headers, &client_headers, &|s: &str| s.to_string());

        assert_eq!(headers.get("x-custom").unwrap(), "value1, value2");
    }
}
