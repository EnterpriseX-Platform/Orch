// ==========================================
// Security Headers Middleware
// Injects recommended security headers
// (HSTS, CSP, X-Frame-Options, etc.)
// ==========================================

use axum::{
    extract::Request,
    http::{header::HeaderName, HeaderValue},
    middleware::Next,
    response::Response,
};

pub async fn security_headers_middleware(
    request: Request,
    next: Next,
) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();

    // List of (header_name, header_value) pairs to set.
    let pairs: &[(HeaderName, &'static str)] = &[
        (
            HeaderName::from_static("strict-transport-security"),
            "max-age=31536000; includeSubDomains",
        ),
        (
            HeaderName::from_static("x-content-type-options"),
            "nosniff",
        ),
        (HeaderName::from_static("x-frame-options"), "DENY"),
        (
            HeaderName::from_static("content-security-policy"),
            "default-src 'self'",
        ),
        (
            HeaderName::from_static("referrer-policy"),
            "strict-origin-when-cross-origin",
        ),
        (
            HeaderName::from_static("permissions-policy"),
            "geolocation=(), microphone=(), camera=()",
        ),
    ];

    for (name, value) in pairs {
        if let Ok(hv) = HeaderValue::from_str(value) {
            headers.insert(name.clone(), hv);
        }
    }

    response
}
