use axum::{
    extract::Request,
    middleware::Next,
    response::Response,
};
use tracing::info;

pub async fn logging_middleware(
    request: Request,
    next: Next,
) -> Response {
    let method = request.method().to_string();
    let uri = request.uri().to_string();
    let request_id = uuid::Uuid::new_v4().to_string();
    
    info!("[{}] {} {} - Started", request_id, method, uri);
    
    let response = next.run(request).await;
    
    let status = response.status();
    info!("[{}] {} {} - {} - Completed", request_id, method, uri, status);
    
    response
}
