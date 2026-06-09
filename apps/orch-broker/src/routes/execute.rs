// ==========================================
// Execute Route Handler
// Receive request from nginx → resolve ApiRegistration → execute Flow → proxy
// ==========================================

use axum::{
    body::{to_bytes, Body},
    extract::{Path, Request, State},
    http::{HeaderMap, StatusCode, Uri},
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::sync::{Arc, OnceLock};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::RwLock as TokioRwLock;

// SDK types
use crate::sdk::ExecutionContext;
use tracing::{error, info, warn, debug};
use uuid::Uuid;

use crate::{
    config::system_config::attach_internal_token,
    error::AppError,
    services::{
        api_resolver::{ApiRegistry, apply_request_headers},
        flow_executor::ExecutionContext as LegacyExecutionContext,
        jwt_validator::{JwtValidator, OidcConfig},
    },
    AppState,
};

/// Handler for executing all API requests
/// Path: /api/v1/*path (catch-all)
pub async fn execute_api(
    State(state): State<Arc<AppState>>,
    uri: Uri,
    headers: HeaderMap,
    request: Request,
) -> Result<impl IntoResponse, AppError> {
    let request_id = Uuid::new_v4().to_string();
    let method = request.method().to_string();
    let raw_path = uri.path().to_string();
    // Strip /api/v1 or /broker/api/v1 prefix to get the endpoint path as stored in DB
    let path = raw_path
        .strip_prefix("/broker/api/v1")
        .or_else(|| raw_path.strip_prefix("/api/v1"))
        .unwrap_or(&raw_path)
        .to_string();
    let query = uri.query().map(|q| q.to_string());
    
    let start_time = std::time::Instant::now();
    
    info!(
        "🚀 [{}] {} {} - Starting execution",
        request_id,
        method,
        path
    );
    
    // ========================================
    // STEP 1: 3-Level Routing
    // Level 1: API Registration match → full flow execution
    // Level 2: Project pathPrefix match → OIDC validate + pass-through proxy
    // Level 3: Global DEFAULT_BACKEND_URL → ultimate fallback proxy
    // ========================================

    // G2 optimization: If gateway already resolved X-API-Id, try direct cache lookup first
    let pre_resolved = if let Some(api_id) = headers.get("x-api-id").and_then(|v| v.to_str().ok()) {
        debug!("[{}] X-API-Id header present: {}, trying cache lookup", request_id, api_id);
        state.api_registry.get_by_id(api_id).await
    } else {
        None
    };

    let api_registration = if let Some(api) = pre_resolved {
        info!(
            "✅ [{}] [Level 1] Found API via X-API-Id cache hit: {} -> backend: {}",
            request_id, api.endpoint, api.backend_url
        );
        Some(api)
    } else {
        match state.api_registry.resolve(&path, &method).await {
        Ok(Some(api)) => {
            info!(
                "✅ [{}] [Level 1] Found API registration: {} -> backend: {}",
                request_id, api.endpoint, api.backend_url
            );
            Some(api)
        }
        Ok(None) => {
            debug!("[{}] No API registration for {} {}, trying fallback levels", request_id, method, path);
            None
        }
        Err(e) => {
            error!("❌ [{}] Failed to resolve API: {}", request_id, e);
            return Ok((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Internal server error",
                    "message": "Failed to resolve API registration",
                    "requestId": request_id
                }))
            ).into_response());
        }
    }
    };
    
    // ========================================
    // STEP 2: Get client IP + Read request body
    // ========================================
    let client_ip = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|v| v.trim().to_string())
        .or_else(|| {
            headers.get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.to_string())
        })
        .unwrap_or_else(|| "unknown".to_string());

    let body_bytes = match to_bytes(request.into_body(), 10 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(e) => {
            error!("❌ [{}] Failed to read request body: {}", request_id, e);
            return Ok((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "Bad request",
                    "message": "Failed to read request body",
                    "requestId": request_id
                }))
            ).into_response());
        }
    };

    let body_json: serde_json::Value = if body_bytes.is_empty() {
        json!({})
    } else {
        match serde_json::from_slice(&body_bytes) {
            Ok(json) => json,
            Err(_) => {
                json!({ "raw": String::from_utf8_lossy(&body_bytes).to_string() })
            }
        }
    };

    // ========================================
    // STEP 3: Route based on level
    // ========================================

    if let Some(api_registration) = api_registration {
        // ====================================================
        // LEVEL 1: API Registration matched → execute flow or proxy
        // ====================================================
        //
        // backendUrl may contain ${key} placeholders resolved against
        // system_configs (project-scoped → global → env). Also, when
        // the endpoint ends in /* and the resolved URL doesn't already
        // include the wildcard suffix, we append it so
        //   endpoint  = /myapi/api/orders/*
        //   backendUrl= ${env.backendUrl}/api/orders
        //   request   = /myapi/api/orders/detail/insert
        //  → proxied  = http://myapi:8080/api/orders/detail/insert
        let backend_url = {
            // 1) Expand ${key} placeholders against system_configs
            let expanded = crate::config::system::expand_env(
                &api_registration.backend_url,
                &api_registration.project_id.clone().unwrap_or_default(),
            )
            .await;

            // 2) Append wildcard suffix if the endpoint has one
            if let Some(endpoint_prefix) = api_registration.endpoint.strip_suffix("/*") {
                let norm_path = path
                    .strip_prefix("/broker/api/v1")
                    .or_else(|| path.strip_prefix("/api/v1"))
                    .unwrap_or(&path);
                if let Some(suffix) = norm_path.strip_prefix(endpoint_prefix) {
                    let trimmed_base = expanded.trim_end_matches('/');
                    let suffix = if suffix.starts_with('/') { suffix.to_string() } else { format!("/{}", suffix) };
                    format!("{}{}", trimmed_base, suffix)
                } else {
                    expanded
                }
            } else {
                expanded
            }
        };

        let mut execution_context = LegacyExecutionContext::new(
            request_id.clone(),
            backend_url.clone(),
        );
        execution_context.set("method", json!(method.clone()));
        execution_context.set("path", json!(path.clone()));
        execution_context.set("query", json!(query));
        execution_context.set("headers", headers_to_json(&headers));
        execution_context.set("body", body_json.clone());
        execution_context.set("apiId", json!(api_registration.id));
        execution_context.set("apiName", json!(api_registration.name));

        if let Some(msg_fmt) = api_registration.message_formats.first() {
            if let Some(ref extraction_config) = msg_fmt.extraction_config {
                execution_context.set("extractionConfig", extraction_config.clone());
            }
        }

        // Resolve effective flow_id: for shared endpoints, match by body discriminator
        let request_headers_map: HashMap<String, String> = headers.iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();
        let effective_flow_id = api_registration.resolve_effective_flow_id(&body_json, &request_headers_map);

        if api_registration.is_shared_endpoint() {
            if let Some(ref fid) = effective_flow_id {
                info!("🔀 [{}] [Shared Endpoint] Resolved flow: {}", request_id, fid);
            } else {
                warn!("⚠️ [{}] [Shared Endpoint] No matching format/flow for routing key", request_id);
            }
        }

        // Resolve the flow for execution. get_executable_flow() consults the
        // explicit deploy cache first, then the active-flows cache (reloaded
        // from the DB on startup + every 30s) — so an active + wired flow runs
        // after a broker restart WITHOUT a manual re-deploy. If we have a
        // flow_id but no executable flow (inactive / not yet configured), treat
        // it like "no flow" and fall through to backend proxy so a
        // half-configured flow doesn't 404 live traffic.
        let deployed_flow = match effective_flow_id.as_ref() {
            Some(fid) => state.config_manager.get_executable_flow(fid).await.map(|c| (fid.clone(), c)),
            None => None,
        };
        if let Some(ref fid) = effective_flow_id {
            if deployed_flow.is_none() {
                warn!(
                    "⚠️ [{}] Flow {} not active/deployed — falling back to backend proxy",
                    request_id, fid
                );
            }
        }

        let (response, _status_code) = if let Some((flow_id, flow_config)) = deployed_flow {
            // Level 1a: Registration + Flow → Execute Flow
            info!("🔄 [{}] [Level 1] Executing flow: {}", request_id, flow_id);

            let query_params: HashMap<String, String> = query
                .as_ref()
                .map(|q| {
                    q.split('&')
                        .filter_map(|pair| {
                            let mut parts = pair.splitn(2, '=');
                            let key = parts.next()?.to_string();
                            let value = parts.next().map(|v| v.to_string()).unwrap_or_default();
                            Some((key, value))
                        })
                        .collect()
                })
                .unwrap_or_default();

            let request_headers: HashMap<String, String> = headers.iter()
                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                .collect();

            let mut sdk_ctx = ExecutionContext::new(
                request_id.clone(),
                flow_id.clone(),
                flow_config.name.clone(),
                backend_url.clone(),
                crate::sdk::HttpRequestData {
                    method: method.clone(),
                    path: path.clone(),
                    headers: request_headers.clone(),
                    query_params,
                    body: Some(body_json.clone()),
                    client_ip: client_ip.clone(),
                },
            );
            sdk_ctx.set_api_registration(api_registration.clone());

            let resolved_fmt = api_registration.resolve_message_format(&body_json, &request_headers);
            if let Some(fmt) = resolved_fmt {
                info!("📋 [{}] Resolved message format: {} ({})", request_id, fmt.name, fmt.discriminator_source);
                sdk_ctx.set_message_format(fmt.clone());
            } else if api_registration.is_shared_endpoint() && api_registration.auto_discover_formats {
                // Auto-Discovery: extract discriminator value and create format on-the-fly
                if let Some(routing_key) = &api_registration.routing_key {
                    let field = routing_key.strip_prefix("$.").unwrap_or(routing_key);
                    if let Some(disc_value) = crate::services::api_resolver::get_json_value(&body_json, field)
                        .and_then(|v| v.as_str().map(|s| s.to_string()))
                    {
                        let auto_name = format!("Auto: {}", disc_value);
                        info!("🔍 [{}] Auto-discovering format: {} = {}", request_id, field, disc_value);

                        // Create temporary format for immediate use in this request
                        let temp_fmt = crate::services::api_resolver::MessageFormat {
                            id: String::new(),
                            name: auto_name.clone(),
                            discriminator_source: "BODY".to_string(),
                            discriminator_field: Some(routing_key.clone()),
                            discriminator_value: Some(disc_value.clone()),
                            flow_id: api_registration.flow_id.clone(),
                            audit_enabled: true,
                            pk_xpath: None,
                            audit_fields: None,
                            extraction_config: api_registration.message_formats.first()
                                .and_then(|f| f.extraction_config.clone()),
                            ..Default::default()
                        };
                        sdk_ctx.set_message_format(temp_fmt);

                        // Async: persist format in DB (non-blocking)
                        let state_c = state.clone();
                        let api_id = api_registration.id.clone();
                        let flow_id = api_registration.flow_id.clone();
                        let routing_key_c = routing_key.clone();
                        tokio::spawn(async move {
                            auto_create_message_format(
                                &state_c, &api_id, &auto_name,
                                &routing_key_c, &disc_value, flow_id.as_deref(),
                            ).await;
                        });
                    }
                }
            }

            if let Some(ref auth_cfg) = api_registration.auth_config {
                sdk_ctx.set_auth_config(auth_cfg.clone());
            }

            match state.flow_executor_sdk.execute_flow(&flow_config, sdk_ctx).await {
                Ok(result) => {
                    let duration = start_time.elapsed().as_millis();
                    info!("✅ [{}] Flow completed in {}ms", request_id, duration);
                    // Grab the final response body BEFORE moving `result` into
                    // create_response_from_sdk — used for api_logs.response_body.
                    // Covers both shapes: response node (result.response.body)
                    // and fallback (result.nodes.*.body for proxy node output).
                    let resp_body_for_log = result
                        .get("response")
                        .and_then(|r| r.get("body"))
                        .cloned()
                        .or_else(|| {
                            // If no response node, surface the last proxy node's body
                            result.as_object().and_then(|obj| {
                                obj.iter()
                                    .filter(|(k, _)| k.starts_with("nodes."))
                                    .last()
                                    .and_then(|(_, v)| v.get("body"))
                                    .cloned()
                            })
                        });
                    let resp = create_response_from_sdk(result, &request_id, duration as u64);
                    // Stash on execution_context so the async log task picks it up
                    if let Some(b) = resp_body_for_log {
                        execution_context.set("proxy.response", b);
                    }
                    (resp, 200)
                }
                Err(e) => {
                    error!("❌ [{}] Flow failed: {}", request_id, e);
                    let resp = (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "Flow execution failed",
                            "message": e.to_string(),
                            "requestId": request_id
                        }))
                    ).into_response();
                    (resp, 500)
                }
            }
        } else {
            // Level 1b: Registration without Flow → Proxy only
            info!("🔄 [{}] [Level 1] Proxy to backend: {}", request_id, backend_url);

            match proxy_to_backend_with_url(&backend_url, &mut execution_context, &headers).await {
                Ok((response, status)) => {
                    info!("✅ [{}] Proxy completed: {}", request_id, status);
                    (response, status)
                }
                Err(e) => {
                    error!("❌ [{}] Proxy failed: {}", request_id, e);
                    let resp = (
                        StatusCode::BAD_GATEWAY,
                        Json(json!({
                            "error": "Backend error",
                            "message": e.to_string(),
                            "requestId": request_id
                        }))
                    ).into_response();
                    (resp, 502)
                }
            }
        };

        // Log API call asynchronously (don't block response).
        // Capture request body (already parsed into body_json) + a small
        // peek of the response so /orch/logs can show the payloads
        // on expand. We truncate large responses to keep api_logs.json
        // fields reasonable — the full body still flows through the
        // client untouched.
        let duration_ms = start_time.elapsed().as_millis() as i32;
        let state_clone = state.clone();
        let req_id = request_id.clone();
        let api_clone = api_registration.clone();
        let method_clone = method.clone();
        let path_clone = path.clone();
        let headers_clone = headers.clone();
        let req_body_clone = body_json.clone();
        let resp_body_opt = execution_context.get("proxy.response").cloned()
            .or_else(|| execution_context.get("nodes.response.body").cloned());
        tokio::spawn(async move {
            if let Err(e) = log_api_call(
                &state_clone, &req_id, &api_clone, &method_clone, &path_clone,
                _status_code, duration_ms, &headers_clone,
                Some(&req_body_clone), resp_body_opt.as_ref(),
            ).await {
                warn!("⚠️ [{}] Failed to log API call: {}", req_id, e);
            }
        });

        Ok(response)
    } else {
        // ====================================================
        // LEVEL 2: No API Registration → try Project pathPrefix match
        // ====================================================
        let api_base_url = crate::config::system::api_base_url();

        // Strip /api/v1 prefix to get the actual request path for matching
        let match_path = path
            .strip_prefix("/broker/api/v1")
            .or_else(|| path.strip_prefix("/api/v1"))
            .unwrap_or(&path);

        debug!("[{}] [Level 2] Resolving project by path: {}", request_id, match_path);

        // Per-path TTL cache for the resolve-by-path JSON payload.
        // Previously every unregistered request that fell through to
        // Level 2 round-tripped to web /api/projects/resolve-by-path —
        // ~50ms each, on top of the L1 resolve fetch we just dodged
        // via the negative cache. 30s TTL: short enough that env /
        // proxyTarget edits propagate quickly, long enough to absorb
        // a page's worth of bursts.
        let project_resolve_url = format!(
            "{}/api/projects/resolve-by-path?path={}",
            api_base_url,
            urlencoding::encode(match_path)
        );

        let resolve_data = match level2_resolve_cached(&state.http_client, &project_resolve_url, match_path).await {
            Some(v) => v,
            None => serde_json::Value::Null,
        };

        // Convert into the same shape the original `match` arms expected.
        // Mirrors the previous "Ok(resp) if resp.status().is_success()" branch
        // where resolve_data is the parsed JSON.
        if !resolve_data.is_null() {
            if resolve_data["found"].as_bool() == Some(true) {
                let project = &resolve_data["project"];
                let routing = &resolve_data["routing"];
                let target_url = routing["targetUrl"].as_str().unwrap_or("");
                let project_name = project["name"].as_str().unwrap_or("unknown");

                info!(
                    "✅ [{}] [Level 2] Project matched: {} → {}",
                    request_id, project_name, target_url
                );

                // OIDC validation if enabled on this project
                if project["oidcEnabled"].as_bool() == Some(true) {
                    let oidc_config = OidcConfig {
                        issuer_url: project["oidcIssuerUrl"].as_str().unwrap_or("").to_string(),
                        client_id: project["oidcClientId"].as_str().unwrap_or("").to_string(),
                        jwks_url: project["oidcJwksUrl"].as_str().map(|s| s.to_string()),
                        required_scopes: project["oidcRequiredScopes"]
                            .as_array()
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default(),
                    };

                    let auth_header = headers
                        .get("authorization")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("");

                    let token = match JwtValidator::extract_bearer_token(auth_header) {
                        Some(t) => t,
                        None => {
                            warn!("[{}] [Level 2] OIDC enabled but no Bearer token", request_id);
                            return Ok((
                                StatusCode::UNAUTHORIZED,
                                Json(json!({
                                    "error": "Unauthorized",
                                    "message": "Bearer token required for this project",
                                    "requestId": request_id
                                }))
                            ).into_response());
                        }
                    };

                    let validation = state.jwt_validator.validate_token(token, &oidc_config).await;

                    if !validation.valid {
                        warn!(
                            "[{}] [Level 2] OIDC validation failed: {:?}",
                            request_id, validation.error
                        );
                        return Ok((
                            StatusCode::UNAUTHORIZED,
                            Json(json!({
                                "error": "Unauthorized",
                                "message": validation.error.unwrap_or_else(|| "Token validation failed".to_string()),
                                "requestId": request_id
                            }))
                        ).into_response());
                    }

                    info!(
                        "[{}] [Level 2] OIDC validated: sub={:?}",
                        request_id,
                        validation.claims.as_ref().and_then(|c| c.sub.as_deref())
                    );
                }

                // Proxy to project backend
                return proxy_passthrough(
                    target_url,
                    &method,
                    &query,
                    &headers,
                    &body_bytes,
                    &request_id,
                    start_time,
                ).await;
            }

            // Project not found in resolve_data, fall through to Level 3
            debug!("[{}] [Level 2] No project matched path: {}", request_id, match_path);
        } else {
            debug!("[{}] [Level 2] resolve cache/fetch returned no data — falling through", request_id);
        }

        // ====================================================
        // LEVEL 3: Global DEFAULT_BACKEND_URL fallback
        // Reads from DB `orch.defaultBackendUrl` first, then env
        // DEFAULT_BACKEND_URL. Only falls through if the admin has
        // explicitly set one — an empty string disables this level.
        // ====================================================
        let default_backend = {
            // Check DB by fetching and checking if value is non-empty
            let db_val = crate::config::system::get_str(
                "orch.defaultBackendUrl",
                "DEFAULT_BACKEND_URL",
                "",
            )
            .await;
            if db_val.is_empty() { None } else { Some(db_val) }
        };
        if let Some(default_backend) = default_backend {
            let target_url = format!("{}{}", default_backend.trim_end_matches('/'), match_path);

            info!(
                "🔄 [{}] [Level 3] Fallback to DEFAULT_BACKEND_URL: {}",
                request_id, target_url
            );

            return proxy_passthrough(
                &target_url,
                &method,
                &query,
                &headers,
                &body_bytes,
                &request_id,
                start_time,
            ).await;
        }

        // No match at any level → 404
        warn!("❌ [{}] No route found at any level for {} {}", request_id, method, path);
        Ok((
            StatusCode::NOT_FOUND,
            Json(json!({
                "error": "Not found",
                "message": format!("No route found for {} {}", method, path),
                "requestId": request_id
            }))
        ).into_response())
    }
}

/// Transparent pass-through proxy (Level 2 & 3)
/// Forwards the raw request (all headers, body bytes) to the target URL
async fn proxy_passthrough(
    target_url: &str,
    method: &str,
    query: &Option<String>,
    headers: &HeaderMap,
    body_bytes: &[u8],
    request_id: &str,
    start_time: std::time::Instant,
) -> Result<axum::response::Response, AppError> {
    let client = reqwest::Client::new();

    // Build full URL with query string
    let full_url = if let Some(q) = query {
        format!("{}?{}", target_url, q)
    } else {
        target_url.to_string()
    };

    // Build request with same method
    let mut req_builder = match method {
        "GET" => client.get(&full_url),
        "POST" => client.post(&full_url),
        "PUT" => client.put(&full_url),
        "PATCH" => client.patch(&full_url),
        "DELETE" => client.delete(&full_url),
        "HEAD" => client.head(&full_url),
        "OPTIONS" => client.request(reqwest::Method::OPTIONS, &full_url),
        _ => client.get(&full_url),
    };

    // Forward relevant headers (skip hop-by-hop headers)
    for (name, value) in headers.iter() {
        let name_str = name.as_str();
        // Skip hop-by-hop and internal headers
        match name_str {
            "host" | "connection" | "transfer-encoding" | "keep-alive"
            | "proxy-authenticate" | "proxy-authorization" | "te" | "trailers"
            | "upgrade" => continue,
            _ => {}
        }
        if let Ok(val_str) = value.to_str() {
            req_builder = req_builder.header(name_str, val_str);
        }
    }

    // Add tracking headers
    req_builder = req_builder.header("X-Request-Id", request_id);
    req_builder = req_builder.header("X-Forwarded-By", "orch-broker");

    // Attach body for non-GET/HEAD methods
    if method != "GET" && method != "HEAD" && !body_bytes.is_empty() {
        req_builder = req_builder.body(body_bytes.to_vec());
    }

    // Send request
    match req_builder.send().await {
        Ok(backend_resp) => {
            let status_code = backend_resp.status().as_u16();
            let status = StatusCode::from_u16(status_code)
                .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
            let duration = start_time.elapsed().as_millis();

            info!(
                "✅ [{}] Pass-through proxy completed: {} in {}ms",
                request_id, status_code, duration
            );

            // Forward response headers
            let mut response_builder = axum::response::Response::builder().status(status);
            let backend_has_cache_control = backend_resp.headers().contains_key("cache-control");
            for (name, value) in backend_resp.headers().iter() {
                let name_str = name.as_str();
                match name_str {
                    "transfer-encoding" | "connection" => continue,
                    _ => {}
                }
                if let Ok(val_str) = value.to_str() {
                    response_builder = response_builder.header(name_str, val_str);
                }
            }

            // Workaround for backends that don't set Cache-Control on
            // versioned static assets (e.g. a backend serves /js/*.js
            // without any cache header but appends ?v=<build-hash> to
            // every reference, which makes them safe to cache forever).
            // Inject a long max-age only when (a) the backend didn't
            // send one and (b) the path looks like a versioned static
            // asset. Status must be a 2xx — don't cache redirects /
            // errors.
            if !backend_has_cache_control && status_code >= 200 && status_code < 300
                && is_versioned_static_asset(&full_url)
            {
                response_builder = response_builder
                    .header("Cache-Control", "public, max-age=31536000, immutable");
            }

            // Stream the response body instead of buffering. Buffering
            // the whole body before responding made TTFB scale with body
            // size — e.g. a 16.8MB ej2.min.js took ~30s before the
            // first byte reached the client because the broker read the
            // the full upstream response before responding. With the stream
            // adapter the broker forwards bytes as they arrive.
            use futures::TryStreamExt;
            let stream = backend_resp.bytes_stream()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
            let response = response_builder
                .body(Body::from_stream(stream))
                .unwrap_or_else(|_| {
                    (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response()
                });

            Ok(response)
        }
        Err(e) => {
            error!("❌ [{}] Pass-through proxy failed: {}", request_id, e);
            Ok((
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "error": "Backend unreachable",
                    "message": e.to_string(),
                    "requestId": request_id
                }))
            ).into_response())
        }
    }
}

/// Proxy request directly to backend (no flow execution) - used with Registration
async fn proxy_to_backend(
    api: &crate::services::api_resolver::ApiRegistration,
    context: &mut LegacyExecutionContext,
) -> anyhow::Result<axum::response::Response> {
    proxy_to_backend_with_url(&api.backend_url, context, &HeaderMap::new()).await
        .map(|(resp, _)| resp)
}

/// Proxy request to backend with URL string - works for all cases
async fn proxy_to_backend_with_url(
    backend_url: &str,
    context: &mut LegacyExecutionContext,
    headers: &HeaderMap,
) -> anyhow::Result<(axum::response::Response, i32)> {
    let client = reqwest::Client::new();

    let method = context.get("method")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "GET".to_string());

    let body = context.get("body").cloned().unwrap_or(json!({}));

    // Build backend URL with query
    let backend_url = if let Some(query) = context.get("query").and_then(|v| v.as_str()) {
        format!("{}?{}", backend_url, query)
    } else {
        backend_url.to_string()
    };

    // Build request
    let mut request_builder = match method.as_str() {
        "GET" => client.get(&backend_url),
        "POST" => client.post(&backend_url),
        "PUT" => client.put(&backend_url),
        "PATCH" => client.patch(&backend_url),
        "DELETE" => client.delete(&backend_url),
        _ => client.get(&backend_url),
    };

    // Forward relevant original client headers to backend
    for (name, value) in headers.iter() {
        let name_str = name.as_str();
        // Skip hop-by-hop and internal headers
        match name_str {
            "host" | "connection" | "transfer-encoding" | "keep-alive"
            | "proxy-authenticate" | "proxy-authorization" | "te" | "trailers"
            | "upgrade" | "content-length" => continue,
            _ => {}
        }
        // Forward: content-type, authorization, accept, x-request-id, x-api-key,
        // x-user-id, and any custom x- headers
        let should_forward = matches!(name_str,
            "content-type" | "authorization" | "accept" | "accept-encoding"
            | "accept-language" | "user-agent"
        ) || name_str.starts_with("x-");

        if should_forward {
            if let Ok(val_str) = value.to_str() {
                request_builder = request_builder.header(name_str, val_str);
            }
        }
    }

    // Send request
    let response = if method == "GET" || method == "DELETE" {
        request_builder.send().await?
    } else {
        request_builder.json(&body).send().await?
    };

    // Forward status + headers. Body is materialised so we can:
    //   1. emit it to the client unchanged (no JSON re-wrapping), and
    //   2. expose it back on the execution context so the gateway's
    //      audit IIFE can populate api_logs.responseBody.
    // For registered APIs this is fine — payloads are typically
    // bounded JSON. Truly large streaming bodies should go through
    // proxy_passthrough (Level 2) where streaming is preserved.
    let status_code = response.status().as_u16();
    let status = StatusCode::from_u16(status_code)
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    let mut response_builder = axum::response::Response::builder().status(status);
    let backend_has_cache_control = response.headers().contains_key("cache-control");
    for (name, value) in response.headers().iter() {
        let name_str = name.as_str();
        match name_str {
            "transfer-encoding" | "connection" => continue,
            _ => {}
        }
        if let Ok(val_str) = value.to_str() {
            response_builder = response_builder.header(name_str, val_str);
        }
    }

    // Same long-cache injection as proxy_passthrough — registered
    // APIs that proxy static assets benefit from this too.
    if !backend_has_cache_control && status_code >= 200 && status_code < 300
        && is_versioned_static_asset(&backend_url)
    {
        response_builder = response_builder
            .header("Cache-Control", "public, max-age=31536000, immutable");
    }

    let body_bytes = response.bytes().await.unwrap_or_default();
    // Surface the response body for the api_logs writer. Try JSON
    // first (most registered APIs return JSON); fall back to a
    // string so non-JSON 2xx responses still get logged.
    if !body_bytes.is_empty() {
        let body_str = String::from_utf8_lossy(&body_bytes).to_string();
        let value = serde_json::from_str::<serde_json::Value>(&body_str)
            .unwrap_or_else(|_| serde_json::Value::String(body_str));
        context.set("proxy.response", value);
    }
    let axum_response = response_builder
        .body(Body::from(body_bytes))
        .unwrap_or_else(|_| {
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response()
        });

    Ok((axum_response, status_code as i32))
}

/// Returns true when the URL or path looks like a versioned static
/// asset that's safe to cache for a year — file extension matches a
/// known static type AND there's a query string (typical
/// cache-busting pattern: `/js/foo.min.js?v=<hash>`). The query-string
/// requirement is a guardrail: if a backend ever serves an unversioned
/// dynamic .js/.css we won't pin the wrong content for a year.
fn is_versioned_static_asset(url: &str) -> bool {
    let (path, query) = match url.split_once('?') {
        Some((p, q)) => (p, q),
        None => (url, ""),
    };
    if query.is_empty() {
        return false;
    }
    let path_lower = path.to_ascii_lowercase();
    matches!(
        path_lower.rsplit_once('.').map(|(_, ext)| ext),
        Some("js" | "mjs" | "css" | "map"
            | "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "ico"
            | "woff" | "woff2" | "ttf" | "otf" | "eot")
    )
}

/// Create HTTP response from flow execution result (Legacy)
fn create_response_from_result(
    result: serde_json::Value,
    request_id: &str,
    duration: u64,
) -> axum::response::Response {
    // Check if there's a specific response config in result
    let status_code = result.get("_statusCode")
        .and_then(|v| v.as_u64())
        .map(|s| s as u16)
        .unwrap_or(200);
    
    let status = StatusCode::from_u16(status_code)
        .unwrap_or(StatusCode::OK);
    
    // Build response body
    let response_body = if let Some(data) = result.get("response") {
        data.clone()
    } else {
        json!({
            "success": true,
            "data": result,
            "meta": {
                "requestId": request_id,
                "durationMs": duration
            }
        })
    };
    
    (
        status,
        Json(response_body)
    ).into_response()
}

/// Recursively check whether a flow result contains an audit-node output
/// that actually WROTE an audit (type=AUDIT_TRAIL and not "skipped"). Used to
/// signal the gateway (via the X-Orch-Audit header) so it skips its fallback
/// audit writer — preventing a duplicate audit row when both a flow audit
/// node and the gateway would otherwise log the same request.
fn result_wrote_audit(v: &serde_json::Value) -> bool {
    match v {
        serde_json::Value::Object(map) => {
            if map.get("type").and_then(|t| t.as_str()) == Some("AUDIT_TRAIL")
                && map.get("status").and_then(|s| s.as_str()) != Some("skipped")
            {
                return true;
            }
            map.values().any(result_wrote_audit)
        }
        serde_json::Value::Array(arr) => arr.iter().any(result_wrote_audit),
        _ => false,
    }
}

/// Build the base HTTP response from a flow execution result (SDK).
fn build_sdk_response(
    result: &serde_json::Value,
    request_id: &str,
    duration: u64,
) -> axum::response::Response {
    tracing::info!("create_response_from_sdk: result has response: {}", result.get("response").is_some());

    if let Some(response) = result.get("response") {
        if let Some(body) = response.get("body") {
            let status_code = response["statusCode"]
                .as_u64()
                .map(|s| StatusCode::from_u16(s as u16).unwrap_or(StatusCode::OK))
                .unwrap_or(StatusCode::OK);
            tracing::info!("Returning clean response with status: {}", status_code);
            return (status_code, Json(body.clone())).into_response();
        } else {
            tracing::warn!("Response has no body");
        }
    } else {
        tracing::warn!("No response in result");
    }

    // Fallback: Flow SDK returns the result wrapped
    let response_body = json!({
        "success": true,
        "data": result.clone(),
        "meta": {
            "requestId": request_id,
            "durationMs": duration
        }
    });
    (StatusCode::OK, Json(response_body)).into_response()
}

/// Create HTTP response from flow execution result (SDK). Tags the response
/// with `X-Orch-Audit: node` when a flow audit node already wrote the audit,
/// so the gateway skips its fallback writer (§3 double-write guard).
fn create_response_from_sdk(
    result: serde_json::Value,
    request_id: &str,
    duration: u64,
) -> axum::response::Response {
    let audit_written = result_wrote_audit(&result);
    let mut resp = build_sdk_response(&result, request_id, duration);
    if audit_written {
        resp.headers_mut().insert(
            "x-orch-audit",
            axum::http::HeaderValue::from_static("node"),
        );
    }
    resp
}

/// Convert headers to JSON
fn headers_to_json(headers: &HeaderMap) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    
    for (name, value) in headers.iter() {
        let key = name.as_str().to_string();
        let val = value.to_str().unwrap_or("").to_string();
        map.insert(key, json!(val));
    }
    
    serde_json::Value::Object(map)
}

/// Log audit event via HTTP API
async fn log_audit_event(
    state: &Arc<AppState>,
    request_id: &str,
    api: &crate::services::api_resolver::ApiRegistration,
    method: &str,
    path: &str,
    duration: i32,
) -> anyhow::Result<()> {
    // Send to API for persistence
    let audit_event = json!({
        "action": "VIEW",
        "requestId": request_id,
        "entityType": "API",
        "entityId": api.id,
        "apiName": api.name,
        "method": method,
        "path": path,
        "duration": duration,
        "description": format!("{} {} - {}ms", method, path, duration),
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    
    // Try to send to API, fallback to just logging if fails
    let api_url = crate::config::system::api_base_url();
    
    match attach_internal_token(state.http_client.post(format!("{}/api/audit", api_url)))
        .json(&audit_event)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => Ok(()),
        Ok(resp) => {
            warn!("⚠️ Audit API returned error: {}", resp.status());
            Ok(()) // Don't fail the request if audit fails
        }
        Err(e) => {
            warn!("⚠️ Failed to send audit log to API: {}", e);
            Ok(()) // Don't fail the request if audit fails
        }
    }
}

/// Log API call via HTTP API
async fn log_api_call(
    _state: &Arc<AppState>,
    request_id: &str,
    api: &crate::services::api_resolver::ApiRegistration,
    method: &str,
    path: &str,
    status_code: i32,
    duration: i32,
    headers: &HeaderMap,
    req_body: Option<&serde_json::Value>,
    resp_body: Option<&serde_json::Value>,
) -> anyhow::Result<()> {
    // Guard rails — keep huge payloads out of the access-log line.
    // Any payload whose JSON serialisation exceeds 32 KB gets
    // replaced by a stub pointing at the size. Ops can always refetch
    // from upstream if the full body is needed.
    const MAX_BODY_BYTES: usize = 32_000;
    let capped = |v: Option<&serde_json::Value>| -> serde_json::Value {
        match v {
            Some(val) => {
                let s = serde_json::to_string(val).unwrap_or_default();
                if s.len() > MAX_BODY_BYTES {
                    json!({ "__truncated__": true, "size": s.len() })
                } else {
                    val.clone()
                }
            }
            None => serde_json::Value::Null,
        }
    };

    let log_entry = json!({
        "requestId": request_id,
        "apiId": api.id,
        "method": method,
        "path": path,
        "statusCode": status_code,
        "duration": duration,
        "requestBody": capped(req_body),
        "responseBody": capped(resp_body),
        "userIp": headers.get("x-forwarded-for")
            .or_else(|| headers.get("x-real-ip"))
            .and_then(|v| v.to_str().ok())
            .unwrap_or(""),
        "userAgent": headers.get("user-agent")
            .and_then(|v| v.to_str().ok())
            .unwrap_or(""),
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    
    // §4: access_logs is an ops/file concern, not a DB row. Emit a
    // structured JSON line to stdout (captured by the cluster log
    // collector) instead of POSTing to /api/logs — fast, no DB write,
    // greppable like an HTTP access log. The api_logs table write stays
    // disabled on the web side. To ship elsewhere (ELK/Loki) point the
    // collector at this `access_log` target.
    tracing::info!(target: "access_log", "{}", log_entry);
    Ok(())
}

/// Log Event via HTTP API (/api/events)
async fn log_event(
    state: &Arc<AppState>,
    request_id: &str,
    api: &crate::services::api_resolver::ApiRegistration,
    method: &str,
    path: &str,
    status_code: i32,
    duration: i32,
) -> anyhow::Result<()> {
    let api_url = crate::config::system::api_base_url();
    
    // Generate event name from API endpoint
    let event_name = format!("{}_{}", method, api.name.to_uppercase().replace(" ", "_"));
    
    let event_entry = json!({
        "eventName": event_name,
        "eventType": "API_CALL",
        "level": if status_code >= 400 { "error" } else { "info" },
        "message": format!("{} {} - {} in {}ms", method, path, status_code, duration),
        "data": {
            "requestId": request_id,
            "apiId": api.id,
            "apiName": api.name,
            "method": method,
            "path": path,
            "statusCode": status_code,
            "durationMs": duration,
        },
        "flowId": api.flow_id.clone().unwrap_or_default(),
        "requestId": request_id,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    
    match attach_internal_token(state.http_client.post(format!("{}/api/events", api_url)))
        .json(&event_entry)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => Ok(()),
        Ok(resp) => {
            warn!("⚠️ Events API returned error: {}", resp.status());
            Ok(()) // Don't fail the request if event logging fails
        }
        Err(e) => {
            warn!("⚠️ Failed to send event log: {}", e);
            Ok(()) // Don't fail the request if event logging fails
        }
    }
}

/// Auto-create message format via HTTP callback to Next.js API (non-blocking)
async fn auto_create_message_format(
    state: &Arc<AppState>,
    api_id: &str,
    name: &str,
    routing_key: &str,
    discriminator_value: &str,
    flow_id: Option<&str>,
) {
    let api_url = crate::config::system::api_base_url();

    let field = routing_key.strip_prefix("$.").unwrap_or(routing_key);

    let payload = json!({
        "name": name,
        "apiRegistrationId": api_id,
        "flowId": flow_id,
        "discriminatorSource": "BODY",
        "discriminatorField": field,
        "discriminatorValue": discriminator_value,
        "formatType": "MICROFLOW",
        "auditEnabled": true,
        "sourceFunction": discriminator_value,
        "status": "ACTIVE"
    });

    match state.http_client
        .post(format!("{}/api/message/formats", api_url))
        .json(&payload)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            info!("✅ Auto-created message format: {} = {}", field, discriminator_value);
            // Invalidate API cache so next request picks up new format
            state.api_registry.invalidate(api_id).await;
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            warn!("⚠️ Auto-create format returned {}: {} ({})", status, discriminator_value, &body[..std::cmp::min(body.len(), 200)]);
        }
        Err(e) => {
            warn!("⚠️ Failed to auto-create format: {}", e);
        }
    }
}

// ==========================================
// Level 2 resolve cache
// ==========================================
//
// Cache the response of /api/projects/resolve-by-path keyed by the
// request's match_path. Without this, every Level-2 fall-through
// re-fetches the same JSON from web — for traffic-heavy projects
// for a passthrough proxy (where almost every URL is unregistered and goes to
// Level 2) the round-trip dominates broker latency.
//
// Returns the resolve JSON on cache hit OR fresh fetch. Returns
// None for transient HTTP errors (caller falls through to Level 3
// just as before).
async fn level2_resolve_cached(
    client: &reqwest::Client,
    url: &str,
    match_path: &str,
) -> Option<serde_json::Value> {
    static CACHE: OnceLock<TokioRwLock<HashMap<String, (Instant, serde_json::Value)>>> = OnceLock::new();
    // TTL is admin-tunable via system_configs key
    // `broker.l2ResolveCacheTtlSecs` (env: L2_RESOLVE_CACHE_TTL,
    // default 300s). Practically "forever" for hot-path traffic.
    let ttl_secs = crate::config::system::get_i64(
        "broker.l2ResolveCacheTtlSecs",
        "L2_RESOLVE_CACHE_TTL",
        300,
    ).await.max(0) as u64;
    let ttl = Duration::from_secs(ttl_secs);
    let cache = CACHE.get_or_init(|| TokioRwLock::new(HashMap::new()));

    {
        let read = cache.read().await;
        if let Some((at, val)) = read.get(match_path) {
            if at.elapsed() < ttl {
                return Some(val.clone());
            }
        }
    }

    let resp = match attach_internal_token(client.get(url)).send().await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            warn!("Level 2 resolve returned {} for {}", r.status(), match_path);
            return None;
        }
        Err(e) => {
            warn!("Level 2 resolve failed for {}: {}", match_path, e);
            return None;
        }
    };

    let json: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            warn!("Level 2 resolve JSON parse failed for {}: {}", match_path, e);
            return None;
        }
    };

    {
        let mut write = cache.write().await;
        write.insert(match_path.to_string(), (Instant::now(), json.clone()));
    }
    Some(json)
}

// Health check endpoint moved to handlers::metrics::health_check
