// Internal-token guard for the broker's admin surface.
//
// /deploy, /test, /admin/* and /metrics change or reveal broker state but
// had no authentication: anyone who could reach the broker (or a proxy
// location such as nginx `location /deploy/`) could list, deploy or undeploy
// flows, run test executions and manage workers.
//
// When INTERNAL_API_TOKEN is set, these paths now require a matching
// `X-Internal-Token` header (the web app sends it). When it is unset the
// broker keeps the old open behaviour so environments can roll the secret
// out without downtime — same contract as the web app's middleware.
//
// Left open on purpose:
//   /health, /api/v1/* (client traffic, guarded by api_key_auth),
//   /nodes* (static node catalogue), /metrics/prometheus (scrapers),
//   /admin/workers/register and /admin/workers/external/:id/heartbeat
//   (external workers that do not hold the internal token).

use axum::{
    body::Body,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

fn is_protected(path: &str) -> bool {
    let p = path.strip_prefix("/broker").unwrap_or(path);
    if p == "/metrics/prometheus" || p.starts_with("/metrics/prometheus/") {
        return false;
    }
    if p == "/admin/workers/register" || (p.starts_with("/admin/workers/external/") && p.ends_with("/heartbeat")) {
        return false;
    }
    p == "/metrics"
        || p.starts_with("/deploy")
        || p.starts_with("/test/")
        || p.starts_with("/admin/")
}

/// Constant-time byte comparison (avoid leaking the token through timing).
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub async fn internal_auth_middleware(req: Request<Body>, next: Next) -> Response {
    if !is_protected(req.uri().path()) {
        return next.run(req).await;
    }
    let expected = match crate::config::system::internal_token() {
        Some(t) if !t.is_empty() => t,
        _ => return next.run(req).await, // not rolled out yet — legacy open
    };
    let given = req
        .headers()
        .get("x-internal-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if ct_eq(given.as_bytes(), expected.as_bytes()) {
        return next.run(req).await;
    }
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": "Unauthorized", "message": "X-Internal-Token required" })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protected_paths() {
        for p in ["/deploy/flows", "/broker/deploy/flows/x", "/test/execute/x", "/admin/workers", "/admin/jobs/1", "/metrics", "/broker/metrics"] {
            assert!(is_protected(p), "{p} should be protected");
        }
        for p in ["/health", "/api/v1/x", "/nodes", "/metrics/prometheus", "/admin/workers/register", "/admin/workers/external/w1/heartbeat", "/broker/health"] {
            assert!(!is_protected(p), "{p} should be open");
        }
    }

    #[test]
    fn constant_time_eq() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"ab"));
    }
}
