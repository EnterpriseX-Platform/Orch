// ==========================================
// Idempotency Middleware
// For POST/PUT/PATCH requests with `Idempotency-Key` header:
//  - If same key + same request hash => return cached response
//  - If same key + different request hash => 422
//  - Otherwise process, cache response (24h TTL) keyed on the user key.
// Storage is an in-process DashMap (simple; not cross-node).
// ==========================================

use axum::{
    body::{to_bytes, Body},
    extract::Request,
    http::{header, HeaderMap, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use dashmap::DashMap;
use sha2::{Digest, Sha256};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tracing::{debug, warn};

#[derive(Debug, Clone)]
struct Stored {
    request_hash: String,
    status: u16,
    body: Vec<u8>,
    content_type: Option<String>,
    expires_at: Instant,
}

static STORE: OnceLock<DashMap<String, Stored>> = OnceLock::new();

fn store() -> &'static DashMap<String, Stored> {
    STORE.get_or_init(DashMap::new)
}

const TTL: Duration = Duration::from_secs(24 * 3600);
const MAX_BODY: usize = 2 * 1024 * 1024; // 2 MB cap for idempotent bodies

fn compute_request_hash(method: &Method, path: &str, body: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(method.as_str().as_bytes());
    h.update(b"\n");
    h.update(path.as_bytes());
    h.update(b"\n");
    h.update(body);
    format!("{:x}", h.finalize())
}

fn get_idempotency_key(headers: &HeaderMap) -> Option<String> {
    headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub async fn idempotency_middleware(request: Request, next: Next) -> Response {
    let method = request.method().clone();

    // Only apply to POST/PUT/PATCH
    if !matches!(method, Method::POST | Method::PUT | Method::PATCH) {
        return next.run(request).await;
    }

    let key = match get_idempotency_key(request.headers()) {
        Some(k) => k,
        None => return next.run(request).await,
    };

    let path = request.uri().path().to_string();

    // Must split request so we can read body to hash, then rebuild
    let (parts, body) = request.into_parts();
    let body_bytes = match to_bytes(body, MAX_BODY).await {
        Ok(b) => b,
        Err(e) => {
            warn!("idempotency: failed to buffer body: {}", e);
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                [(header::CONTENT_TYPE, "application/json")],
                Body::from(r#"{"error":"Payload too large for idempotent request"}"#),
            )
                .into_response();
        }
    };

    let request_hash = compute_request_hash(&method, &path, &body_bytes);

    // Purge expired while we're here (cheap)
    let now = Instant::now();
    store().retain(|_, v| v.expires_at > now);

    // Look up existing entry
    if let Some(existing) = store().get(&key) {
        if existing.request_hash != request_hash {
            warn!("idempotency: key reuse with different payload (key={})", key);
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                [(header::CONTENT_TYPE, "application/json")],
                Body::from(
                    r#"{"error":"Idempotency-Key reused with different request payload"}"#,
                ),
            )
                .into_response();
        }
        // Replay cached response
        debug!("idempotency: cache hit for key={}", key);
        let ct = existing
            .content_type
            .clone()
            .unwrap_or_else(|| "application/json".to_string());
        let status = StatusCode::from_u16(existing.status).unwrap_or(StatusCode::OK);
        let mut headers = axum::http::HeaderMap::new();
        if let Ok(v) = axum::http::HeaderValue::from_str(&ct) {
            headers.insert(header::CONTENT_TYPE, v);
        }
        headers.insert(
            axum::http::HeaderName::from_static("x-idempotent-replay"),
            axum::http::HeaderValue::from_static("true"),
        );
        return (status, headers, existing.body.clone()).into_response();
    }

    // Rebuild request with buffered body
    let new_req = Request::from_parts(parts, Body::from(body_bytes.clone()));
    let response = next.run(new_req).await;

    // Capture response to cache (only 2xx)
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let (resp_parts, resp_body) = response.into_parts();
    let resp_bytes = match to_bytes(resp_body, MAX_BODY).await {
        Ok(b) => b,
        Err(e) => {
            warn!("idempotency: failed to buffer response body: {}", e);
            // Can't cache; return an empty failure
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                [(header::CONTENT_TYPE, "application/json")],
                Body::from(r#"{"error":"Failed to buffer response"}"#),
            )
                .into_response();
        }
    };

    if (200..300).contains(&status) {
        store().insert(
            key.clone(),
            Stored {
                request_hash,
                status,
                body: resp_bytes.to_vec(),
                content_type: content_type.clone(),
                expires_at: Instant::now() + TTL,
            },
        );
        debug!("idempotency: cached response for key={}", key);
    }

    Response::from_parts(resp_parts, Body::from(resp_bytes))
}
