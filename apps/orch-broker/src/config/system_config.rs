//! system_config.rs — Rust client for the web app's system_configs DB table.
//!
//! Instead of reading `std::env::var("FOO")` directly, call:
//!
//!   let kafka = config::system::kafka_bootstrap().await;
//!
//! Lookup order (matches the TS `getConfig()` helper):
//!   1. In-memory cache (60s TTL)
//!   2. GET {API_BASE_URL}/api/internal/config/:key
//!   3. env var fallback
//!   4. hard-coded default
//!
//! The `API_BASE_URL` itself is still read from env (bootstrap: we need
//! it before we can fetch anything), and so is `DATABASE_URL`, `JWT_SECRET`.
//!
//! Cache invalidation: call `invalidate_all()` after admin updates are
//! made in another process — or just wait for the 60s TTL to expire.

use dashmap::DashMap;
use once_cell::sync::Lazy;
use serde::Deserialize;
use std::time::{Duration, Instant};

static CACHE: Lazy<DashMap<String, CacheEntry>> = Lazy::new(DashMap::new);
static CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .expect("reqwest client")
});

const DEFAULT_TTL: Duration = Duration::from_secs(60);

#[derive(Clone)]
struct CacheEntry {
    value: serde_json::Value,
    expires_at: Instant,
}

#[derive(Debug, Deserialize)]
struct ConfigResponse {
    #[allow(dead_code)]
    key: String,
    value: serde_json::Value,
}

/// Web app base URL — broker calls `{api_base}/api/internal/config/:key`.
///
/// This is **bootstrap config**: it must stay in an env var because the
/// broker needs to know this URL before it can fetch anything else from
/// the web/DB. Callers that need the API base for any HTTP call should
/// use this helper — there is no admin-editable alternative.
pub fn api_base_url() -> String {
    std::env::var("API_BASE_URL")
        .unwrap_or_else(|_| "http://orch:3047/orch".to_string())
}

/// Optional shared secret. If set in both broker + web, it's sent as
/// `X-Internal-Token` so the web app can verify the request came from
/// a trusted service. `pub(crate)` so other modules that call
/// broker-internal web endpoints (registers, flows, audit, events,
/// logs, worker-jobs) can attach the same header via `attach_internal_token`.
pub(crate) fn internal_token() -> Option<String> {
    std::env::var("INTERNAL_API_TOKEN").ok()
}

/// Attach `X-Internal-Token` to a `reqwest::RequestBuilder` if the env
/// var is set. No-op when unset — lets the cluster roll this out in
/// two phases (ship the code, then set the secret) without breakage.
pub fn attach_internal_token(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match internal_token() {
        Some(tok) => req.header("X-Internal-Token", tok),
        None => req,
    }
}

/// Low-level — fetch one key from web. Returns None if 404 / network error.
async fn fetch_one(key: &str) -> Option<serde_json::Value> {
    let url = format!("{}/api/internal/config/{}", api_base_url(), key);
    let req = attach_internal_token(CLIENT.get(&url));
    match req.send().await {
        Ok(r) if r.status().is_success() => match r.json::<ConfigResponse>().await {
            Ok(body) => Some(body.value),
            Err(e) => {
                tracing::warn!("Malformed config response for {}: {}", key, e);
                None
            }
        },
        Ok(r) => {
            if r.status().as_u16() != 404 {
                tracing::warn!("Config fetch {} failed: {}", key, r.status());
            }
            None
        }
        Err(e) => {
            tracing::warn!("Config fetch {} network error: {}", key, e);
            None
        }
    }
}

// Cache the *miss* (key not in DB) too — otherwise every call for a
// key that lives only in env/default fires a fresh HTTP fetch to the
// web app. For hot-path config keys (e.g. cache TTL knobs) that's
// 10-30ms × every request. Use Value::Null as the sentinel.
fn cache_put(key: &str, v: serde_json::Value) {
    CACHE.insert(
        key.to_string(),
        CacheEntry {
            value: v,
            expires_at: Instant::now() + DEFAULT_TTL,
        },
    );
}

/// Core accessor — cache → DB → env fallback → default.
pub async fn get_str(key: &str, env_var: &str, default: &str) -> String {
    if let Some(e) = CACHE.get(key) {
        if e.expires_at > Instant::now() {
            if let Some(s) = e.value.as_str() {
                return s.to_string();
            }
            if e.value.is_null() {
                return std::env::var(env_var).unwrap_or_else(|_| default.to_string());
            }
        }
    }

    let fetched = fetch_one(key).await;
    if let Some(v) = fetched {
        let s = v
            .as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| v.to_string());
        cache_put(key, v);
        return s;
    }

    cache_put(key, serde_json::Value::Null);
    std::env::var(env_var).unwrap_or_else(|_| default.to_string())
}

/// Core accessor — returns bool value.
pub async fn get_bool(key: &str, env_var: &str, default: bool) -> bool {
    if let Some(e) = CACHE.get(key) {
        if e.expires_at > Instant::now() {
            if let Some(b) = e.value.as_bool() {
                return b;
            }
            if e.value.is_null() {
                return std::env::var(env_var)
                    .ok()
                    .and_then(|s| s.parse::<bool>().ok())
                    .unwrap_or(default);
            }
        }
    }
    if let Some(v) = fetch_one(key).await {
        if let Some(b) = v.as_bool() {
            cache_put(key, v);
            return b;
        }
    }
    cache_put(key, serde_json::Value::Null);
    std::env::var(env_var)
        .ok()
        .and_then(|s| s.parse::<bool>().ok())
        .unwrap_or(default)
}

/// Core accessor — returns integer value.
pub async fn get_i64(key: &str, env_var: &str, default: i64) -> i64 {
    if let Some(e) = CACHE.get(key) {
        if e.expires_at > Instant::now() {
            if let Some(n) = e.value.as_i64() {
                return n;
            }
            if e.value.is_null() {
                return std::env::var(env_var)
                    .ok()
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or(default);
            }
        }
    }
    if let Some(v) = fetch_one(key).await {
        if let Some(n) = v.as_i64() {
            cache_put(key, v);
            return n;
        }
    }
    cache_put(key, serde_json::Value::Null);
    std::env::var(env_var)
        .ok()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(default)
}

/// Clear the whole cache. Called after config changes in dev/tests.
#[allow(dead_code)]
pub fn invalidate_all() {
    CACHE.clear();
}

// ------------------------------------------------------------------
// Named helpers — one per config key.
// Pattern: `key`, `env_fallback`, `default`
// ------------------------------------------------------------------

/// Kafka bootstrap servers. DB: `kafka.bootstrapServers`
pub async fn kafka_bootstrap() -> String {
    get_str("kafka.bootstrapServers", "KAFKA_BROKERS", "localhost:9092").await
}

/// Default backend URL used by proxy node when `target.backend = default`.
/// DB: `orch.defaultBackendUrl`
pub async fn default_backend_url() -> String {
    get_str(
        "orch.defaultBackendUrl",
        "DEFAULT_BACKEND_URL",
        "http://localhost:8080",
    )
    .await
}

/// Kafka audit topic. DB: `kafka.topics.audit`
pub async fn kafka_audit_topic() -> String {
    get_str("kafka.topics.audit", "KAFKA_AUDIT_TOPIC", "audit-logs").await
}

/// Kafka event topic. DB: `kafka.topics.event`
pub async fn kafka_event_topic() -> String {
    get_str("kafka.topics.event", "KAFKA_EVENT_TOPIC", "event-logs").await
}

/// Max request body size (MB). DB: `security.maxRequestSizeMb`
pub async fn max_request_size_mb() -> i64 {
    get_i64("security.maxRequestSizeMb", "MAX_REQUEST_SIZE_MB", 10).await
}

/// Comma-separated IP whitelist. DB: `security.ipWhitelist`
/// Empty string means "no whitelist" (all IPs allowed except blacklist).
pub async fn ip_whitelist() -> String {
    get_str("security.ipWhitelist", "IP_WHITELIST", "").await
}

/// Comma-separated IP blacklist. DB: `security.ipBlacklist`
/// Empty string means "no blacklist".
pub async fn ip_blacklist() -> String {
    get_str("security.ipBlacklist", "IP_BLACKLIST", "").await
}

/// MQ provider. DB: `mq.provider` (e.g., "kafka", "rabbitmq")
pub async fn mq_provider() -> String {
    get_str("mq.provider", "MQ_PROVIDER", "kafka").await
}

/// RabbitMQ URL. DB: `mq.rabbitmqUrl`
pub async fn rabbitmq_url() -> String {
    get_str("mq.rabbitmqUrl", "RABBITMQ_URL", "amqp://localhost:5672").await
}

/// Service registry JSON (mapping of service name → base URL). DB: `service.registry`
pub async fn service_registry() -> String {
    get_str("service.registry", "SERVICE_REGISTRY", "{}").await
}

// ==========================================================================
// Template expansion — ${key} references to system_configs / env.
//
// Resolution order (matches GetConfigOptions in the TS helper):
//   1. system_configs (projectId = given project_id, if any)
//   2. system_configs (projectId = null, global)
//   3. OS env var
//   4. Fallback: leave `${key}` literal so caller sees the problem
//
// Called by broker proxy layer before every outbound request so an
// ApiRegistration like
//    backendUrl = "${env.backendUrl}/api/orders"
// resolves to the real URL at request time. Admins change backend
// by editing one project-scoped system_configs row, not N ApiRegistrations.
// ==========================================================================

use regex::Regex;
use once_cell::sync::Lazy as LazyR;

static TEMPLATE_RE: LazyR<Regex> = LazyR::new(|| Regex::new(r"\$\{([^}]+)\}").unwrap());

#[derive(Debug, Deserialize)]
struct ScopedConfigResponse {
    value: serde_json::Value,
}

async fn fetch_scoped(key: &str, project_id: Option<&str>) -> Option<String> {
    let mut url = format!("{}/api/internal/config/{}", api_base_url(), key);
    if let Some(pid) = project_id {
        if !pid.is_empty() {
            url.push_str(&format!("?projectId={}", urlencoding::encode(pid)));
        }
    }
    let mut req = CLIENT.get(&url);
    if let Some(tok) = internal_token() {
        req = req.header("X-Internal-Token", tok);
    }
    match req.send().await {
        Ok(r) if r.status().is_success() => match r.json::<ScopedConfigResponse>().await {
            Ok(b) => Some(b.value.as_str().map(|s| s.to_string()).unwrap_or_else(|| b.value.to_string())),
            Err(_) => None,
        },
        _ => None,
    }
}

/// Expand every `${key}` in `template` using the resolution order above.
/// `project_id` may be empty to skip project-scoped lookup.
pub async fn expand_env(template: &str, project_id: &str) -> String {
    // Fast path: no placeholders
    if !template.contains("${") {
        return template.to_string();
    }

    // Collect all referenced keys first
    let keys: Vec<String> = TEMPLATE_RE
        .captures_iter(template)
        .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
        .collect();

    // Resolve each key (in parallel would be nice but keep it simple)
    let mut resolved: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let pid_opt = if project_id.is_empty() { None } else { Some(project_id) };
    for k in keys.iter() {
        if resolved.contains_key(k) { continue; }
        // 1. project-scoped
        if let Some(pid) = pid_opt {
            if let Some(v) = fetch_scoped(k, Some(pid)).await {
                resolved.insert(k.clone(), v);
                continue;
            }
        }
        // 2. global
        if let Some(v) = fetch_scoped(k, None).await {
            resolved.insert(k.clone(), v);
            continue;
        }
        // 3. env (convert dotted key to SCREAMING_SNAKE)
        let env_key = k.to_ascii_uppercase().replace('.', "_");
        if let Ok(v) = std::env::var(&env_key) {
            resolved.insert(k.clone(), v);
            continue;
        }
        // 4. give up — leave placeholder literal
        tracing::warn!(
            "expand_env: unresolved placeholder ${{{}}} (project_id={:?})",
            k, pid_opt
        );
    }

    // Substitute
    TEMPLATE_RE
        .replace_all(template, |caps: &regex::Captures| {
            let key = &caps[1];
            resolved.get(key).cloned().unwrap_or_else(|| caps[0].to_string())
        })
        .to_string()
}
