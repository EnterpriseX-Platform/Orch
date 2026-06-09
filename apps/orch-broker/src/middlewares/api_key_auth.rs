// ==========================================
// API Key Auth Middleware
// Validates X-API-Key header against Web API /api/api-keys/validate
// with an in-memory cache (TTL 60s). Returns 401 on invalid.
// Bypass if request's resolved API has authType = NONE (best-effort bypass
// handled by not attaching this middleware to NONE routes).
// ==========================================

use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use dashmap::DashMap;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tracing::{debug, warn};

#[derive(Debug, Clone, Deserialize)]
pub struct ValidateResponse {
    pub valid: bool,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub scopes: Option<Vec<String>>,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
struct CacheEntry {
    valid: bool,
    project_id: Option<String>,
    id: Option<String>,
    at: Instant,
}

const CACHE_TTL: Duration = Duration::from_secs(60);

static CACHE: OnceLock<DashMap<String, CacheEntry>> = OnceLock::new();

fn cache() -> &'static DashMap<String, CacheEntry> {
    CACHE.get_or_init(DashMap::new)
}

fn hash_key(plain: &str) -> String {
    let mut h = Sha256::new();
    h.update(plain.as_bytes());
    format!("{:x}", h.finalize())
}

/// Validate an API key against the Web API. Returns (valid, project_id).
pub async fn validate_api_key(api_base_url: &str, plain_key: &str) -> (bool, Option<String>) {
    let hash = hash_key(plain_key);

    // Cache lookup
    if let Some(entry) = cache().get(&hash) {
        if entry.at.elapsed() < CACHE_TTL {
            return (entry.valid, entry.project_id.clone());
        }
    }

    let client = reqwest::Client::new();
    let url = format!("{}/api/api-keys/validate", api_base_url.trim_end_matches('/'));
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "keyHash": hash }))
        .timeout(Duration::from_secs(5))
        .send()
        .await;

    let (valid, project_id, id) = match resp {
        Ok(r) => match r.json::<ValidateResponse>().await {
            Ok(v) => (v.valid, v.project_id, v.id),
            Err(e) => {
                warn!("api_key validate: parse error: {}", e);
                (false, None, None)
            }
        },
        Err(e) => {
            warn!("api_key validate: request error: {}", e);
            (false, None, None)
        }
    };

    cache().insert(
        hash,
        CacheEntry {
            valid,
            project_id: project_id.clone(),
            id,
            at: Instant::now(),
        },
    );

    (valid, project_id)
}

/// Axum middleware: enforce X-API-Key if present; if missing, pass-through.
/// Upstream code (auth-type resolution) decides whether absence is allowed.
pub async fn api_key_auth_middleware(request: Request, next: Next) -> Response {
    let api_base_url = crate::config::system::api_base_url();

    let maybe_key = request
        .headers()
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if let Some(key) = maybe_key {
        let (valid, project_id) = validate_api_key(&api_base_url, &key).await;
        if !valid {
            return (
                StatusCode::UNAUTHORIZED,
                [(header::CONTENT_TYPE, "application/json")],
                Body::from(r#"{"error":"Unauthorized","reason":"invalid_api_key"}"#),
            )
                .into_response();
        }
        debug!(
            "api_key_auth: validated key (project_id={:?})",
            project_id
        );
        // Optionally forward project_id via header for downstream
        let mut request = request;
        if let Some(pid) = project_id {
            if let Ok(v) = pid.parse::<axum::http::HeaderValue>() {
                request.headers_mut().insert("x-project-id", v);
            }
        }
        return next.run(request).await;
    }

    next.run(request).await
}
