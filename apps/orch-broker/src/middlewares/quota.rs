// ==========================================
// Quota Middleware
// Tracks per-API daily/monthly usage and enforces limits.
// Uses an in-memory counter (DashMap) keyed by (apiId, date) and flushes
// back to the Web API best-effort. Returns 429 when exceeded.
// ==========================================

use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use crate::config::system_config::attach_internal_token;
use chrono::{Datelike, Utc};
use dashmap::DashMap;
use serde::Deserialize;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tracing::{debug, warn};

#[derive(Debug, Clone, Deserialize, Default)]
pub struct QuotaConfig {
    pub quota_per_day: Option<i64>,
    pub quota_per_month: Option<i64>,
}

#[derive(Debug)]
struct Counter {
    count: AtomicU64,
    // last refresh from DB
    last_sync: Instant,
    // base count read from DB at last sync
    base: AtomicU64,
}

impl Counter {
    fn new(base: u64) -> Self {
        Self {
            count: AtomicU64::new(base),
            last_sync: Instant::now(),
            base: AtomicU64::new(base),
        }
    }
}

static DAY_COUNTERS: OnceLock<DashMap<String, Counter>> = OnceLock::new();
static MONTH_COUNTERS: OnceLock<DashMap<String, Counter>> = OnceLock::new();
static CONFIG_CACHE: OnceLock<DashMap<String, (QuotaConfig, Instant)>> = OnceLock::new();

const CONFIG_TTL: Duration = Duration::from_secs(60);

fn day_counters() -> &'static DashMap<String, Counter> {
    DAY_COUNTERS.get_or_init(DashMap::new)
}

fn month_counters() -> &'static DashMap<String, Counter> {
    MONTH_COUNTERS.get_or_init(DashMap::new)
}

fn config_cache() -> &'static DashMap<String, (QuotaConfig, Instant)> {
    CONFIG_CACHE.get_or_init(DashMap::new)
}

fn today_key() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

fn this_month_key() -> String {
    let now = Utc::now();
    format!("{:04}-{:02}", now.year(), now.month())
}

/// Increment counters and return whether request is allowed.
/// `cfg` carries per-API quotas. Returns (allowed, reason).
pub fn check_and_increment(
    api_id: &str,
    cfg: &QuotaConfig,
) -> (bool, Option<&'static str>) {
    let day_key = format!("{}::{}", api_id, today_key());
    let month_key = format!("{}::{}", api_id, this_month_key());

    let day_entry = day_counters()
        .entry(day_key)
        .or_insert_with(|| Counter::new(0));
    let day_count = day_entry.count.fetch_add(1, Ordering::Relaxed) + 1;

    if let Some(limit) = cfg.quota_per_day {
        if day_count as i64 > limit {
            // Roll back since we rejected
            day_entry.count.fetch_sub(1, Ordering::Relaxed);
            return (false, Some("daily_quota_exceeded"));
        }
    }

    let month_entry = month_counters()
        .entry(month_key)
        .or_insert_with(|| Counter::new(0));
    let month_count = month_entry.count.fetch_add(1, Ordering::Relaxed) + 1;
    if let Some(limit) = cfg.quota_per_month {
        if month_count as i64 > limit {
            month_entry.count.fetch_sub(1, Ordering::Relaxed);
            // Also roll back day counter we already incremented
            day_entry.count.fetch_sub(1, Ordering::Relaxed);
            return (false, Some("monthly_quota_exceeded"));
        }
    }

    (true, None)
}

/// Fetch quota config for an API from Web API (with cache).
pub async fn fetch_quota_config(api_base_url: &str, api_id: &str) -> QuotaConfig {
    if let Some(cached) = config_cache().get(api_id) {
        if cached.1.elapsed() < CONFIG_TTL {
            return cached.0.clone();
        }
    }

    let url = format!(
        "{}/api/registers/{}",
        api_base_url.trim_end_matches('/'),
        api_id
    );
    let client = reqwest::Client::new();
    let cfg = match attach_internal_token(client.get(&url)).timeout(Duration::from_secs(5)).send().await {
        Ok(r) => match r.json::<serde_json::Value>().await {
            Ok(v) => QuotaConfig {
                quota_per_day: v.get("quotaPerDay").and_then(|x| x.as_i64()),
                quota_per_month: v.get("quotaPerMonth").and_then(|x| x.as_i64()),
            },
            Err(e) => {
                warn!("quota: parse config error: {}", e);
                QuotaConfig::default()
            }
        },
        Err(e) => {
            debug!("quota: fetch config error: {}", e);
            QuotaConfig::default()
        }
    };

    config_cache().insert(api_id.to_string(), (cfg.clone(), Instant::now()));
    cfg
}

/// Axum middleware: if X-API-Id header is present, enforce quota for that API.
pub async fn quota_middleware(request: Request, next: Next) -> Response {
    let api_id = request
        .headers()
        .get("x-api-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if let Some(api_id) = api_id {
        let api_base_url = crate::config::system::api_base_url();
        let cfg = fetch_quota_config(&api_base_url, &api_id).await;

        // Skip quota check if neither limit is set
        if cfg.quota_per_day.is_none() && cfg.quota_per_month.is_none() {
            return next.run(request).await;
        }

        let (allowed, reason) = check_and_increment(&api_id, &cfg);
        if !allowed {
            let body = format!(
                r#"{{"error":"Too Many Requests","reason":"{}"}}"#,
                reason.unwrap_or("quota_exceeded")
            );
            return (
                StatusCode::TOO_MANY_REQUESTS,
                [(header::CONTENT_TYPE, "application/json")],
                Body::from(body),
            )
                .into_response();
        }
    }

    next.run(request).await
}
