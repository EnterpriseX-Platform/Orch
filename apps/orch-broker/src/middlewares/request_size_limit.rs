// ==========================================
// Request Size Limit Middleware
// Checks Content-Length header and rejects
// requests that exceed the configured maximum.
// Default: 10 MB (override via MAX_REQUEST_SIZE_MB env var)
// ==========================================

use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use tracing::warn;

const DEFAULT_MAX_REQUEST_SIZE_MB: u64 = 10;

fn max_request_size_bytes() -> u64 {
    let mb = std::env::var("MAX_REQUEST_SIZE_MB")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(DEFAULT_MAX_REQUEST_SIZE_MB);
    mb * 1024 * 1024
}

pub async fn request_size_limit_middleware(
    request: Request,
    next: Next,
) -> Response {
    let limit = max_request_size_bytes();

    if let Some(content_length) = request
        .headers()
        .get(axum::http::header::CONTENT_LENGTH)
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
    {
        if content_length > limit {
            warn!(
                "Payload too large: content_length={} bytes (limit={} bytes)",
                content_length, limit
            );
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                format!(
                    "Request body exceeds maximum allowed size of {} bytes",
                    limit
                ),
            )
                .into_response();
        }
    }

    next.run(request).await
}
