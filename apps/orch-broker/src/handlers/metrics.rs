// ==========================================
// Metrics Handler - System monitoring endpoints
// ==========================================

use axum::{
    extract::State,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::sync::Arc;
use sysinfo::System;

use crate::AppState;

/// Get comprehensive metrics for monitoring
pub async fn get_metrics(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // Cache sizes
    let api_cache_size = state.api_registry.cache_size().await;
    let flow_cache_size = state.config_manager.cache_size().await;

    // System metrics (CPU, memory, uptime)
    let runtime_metrics = {
        let mut sys = state.system.lock().await;
        sys.refresh_specifics(sysinfo::RefreshKind::new().with_cpu(sysinfo::CpuRefreshKind::everything()).with_memory(sysinfo::MemoryRefreshKind::everything()));

        let total_mem = sys.total_memory(); // bytes
        let used_mem = sys.used_memory();   // bytes
        let cpu_usage = sys.global_cpu_info().cpu_usage(); // 0.0 - 100.0
        let uptime_secs = state.boot_instant.elapsed().as_secs();

        json!({
            "memoryUsageMb": used_mem / 1024 / 1024,
            "memoryTotalMb": total_mem / 1024 / 1024,
            "memoryPercent": if total_mem > 0 { (used_mem as f64 / total_mem as f64 * 100.0).round() } else { 0.0 },
            "cpuUsage": (cpu_usage as f64 * 10.0).round() / 10.0,
            "uptimeSeconds": uptime_secs,
            "uptimeFormatted": format_uptime(uptime_secs),
        })
    };

    // Kafka status
    let kafka_connected = state.kafka_producer.is_connected();
    let kafka_status = json!({
        "status": if kafka_connected { "connected" } else { "noop" },
        "message": if kafka_connected { "Producer connected" } else { "Running without Kafka" },
    });

    // Worker stats
    let worker_stats = state.worker_manager.get_stats().await;
    let queue_stats = json!({
        "workers": {
            "total": worker_stats.total_workers,
            "running": worker_stats.running,
            "stopped": worker_stats.stopped,
            "error": worker_stats.error,
        },
        "queues": worker_stats.queue_names,
    });

    // Request counter
    let total_requests = state.request_counter.load(std::sync::atomic::Ordering::Relaxed);

    Json(json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "runtime": runtime_metrics,
        "cache": {
            "apiRegistrations": api_cache_size,
            "flowConfigs": flow_cache_size,
            "total": api_cache_size + flow_cache_size,
        },
        "kafka": kafka_status,
        "workers": queue_stats,
        "requests": {
            "total": total_requests,
        },
    }))
}

/// Get metrics in Prometheus exposition format (text/plain)
/// Endpoint for Prometheus scraper to pull metrics from
pub async fn get_prometheus_metrics(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    use std::fmt::Write;

    let mut out = String::new();

    // Runtime metrics
    let (cpu_usage, used_mem, total_mem, uptime_secs) = {
        let mut sys = state.system.lock().await;
        sys.refresh_specifics(
            sysinfo::RefreshKind::new()
                .with_cpu(sysinfo::CpuRefreshKind::everything())
                .with_memory(sysinfo::MemoryRefreshKind::everything()),
        );
        (
            sys.global_cpu_info().cpu_usage() as f64,
            sys.used_memory(),
            sys.total_memory(),
            state.boot_instant.elapsed().as_secs(),
        )
    };

    // Cache metrics
    let api_cache_size = state.api_registry.cache_size().await;
    let flow_cache_size = state.config_manager.cache_size().await;

    // Request counter
    let total_requests = state
        .request_counter
        .load(std::sync::atomic::Ordering::Relaxed);

    // Worker stats
    let worker_stats = state.worker_manager.get_stats().await;

    // Kafka
    let kafka_up = if state.kafka_producer.is_connected() { 1 } else { 0 };

    // --- Standard process metrics ---
    writeln!(out, "# HELP orch_broker_uptime_seconds Time since broker started").ok();
    writeln!(out, "# TYPE orch_broker_uptime_seconds counter").ok();
    writeln!(out, "orch_broker_uptime_seconds {}", uptime_secs).ok();

    writeln!(out, "# HELP orch_broker_cpu_usage_percent Current CPU usage percent").ok();
    writeln!(out, "# TYPE orch_broker_cpu_usage_percent gauge").ok();
    writeln!(out, "orch_broker_cpu_usage_percent {:.2}", cpu_usage).ok();

    writeln!(out, "# HELP orch_broker_memory_used_bytes Memory used in bytes").ok();
    writeln!(out, "# TYPE orch_broker_memory_used_bytes gauge").ok();
    writeln!(out, "orch_broker_memory_used_bytes {}", used_mem).ok();

    writeln!(out, "# HELP orch_broker_memory_total_bytes Total memory in bytes").ok();
    writeln!(out, "# TYPE orch_broker_memory_total_bytes gauge").ok();
    writeln!(out, "orch_broker_memory_total_bytes {}", total_mem).ok();

    // --- Request metrics ---
    writeln!(out, "# HELP orch_broker_requests_total Total requests processed").ok();
    writeln!(out, "# TYPE orch_broker_requests_total counter").ok();
    writeln!(out, "orch_broker_requests_total {}", total_requests).ok();

    // --- Cache metrics ---
    writeln!(out, "# HELP orch_broker_cache_size Items currently in memory cache").ok();
    writeln!(out, "# TYPE orch_broker_cache_size gauge").ok();
    writeln!(out, "orch_broker_cache_size{{cache=\"api_registrations\"}} {}", api_cache_size).ok();
    writeln!(out, "orch_broker_cache_size{{cache=\"flow_configs\"}} {}", flow_cache_size).ok();

    // --- Worker metrics ---
    writeln!(out, "# HELP orch_broker_workers Workers by state").ok();
    writeln!(out, "# TYPE orch_broker_workers gauge").ok();
    writeln!(out, "orch_broker_workers{{state=\"total\"}} {}", worker_stats.total_workers).ok();
    writeln!(out, "orch_broker_workers{{state=\"running\"}} {}", worker_stats.running).ok();
    writeln!(out, "orch_broker_workers{{state=\"stopped\"}} {}", worker_stats.stopped).ok();
    writeln!(out, "orch_broker_workers{{state=\"error\"}} {}", worker_stats.error).ok();

    // --- Kafka health ---
    writeln!(out, "# HELP orch_broker_kafka_connected Kafka producer connection status (1=up, 0=down)").ok();
    writeln!(out, "# TYPE orch_broker_kafka_connected gauge").ok();
    writeln!(out, "orch_broker_kafka_connected {}", kafka_up).ok();

    // --- Circuit breaker states (if available) ---
    // Opportunistically include circuit breaker metrics if available
    let cb_metrics = crate::services::circuit_breaker::global().snapshot();
    if !cb_metrics.is_empty() {
        writeln!(out, "# HELP orch_broker_circuit_breaker_state Circuit breaker state (0=closed, 1=half_open, 2=open)").ok();
        writeln!(out, "# TYPE orch_broker_circuit_breaker_state gauge").ok();
        for (host, state_val) in cb_metrics {
            writeln!(out, "orch_broker_circuit_breaker_state{{host=\"{}\"}} {}", host, state_val).ok();
        }
    }

    (
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4; charset=utf-8")],
        out,
    )
}

/// Get health status only (lightweight)
pub async fn health_check(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let kafka_connected = state.kafka_producer.is_connected();

    Json(json!({
        "status": "healthy",
        "service": "orch-broker",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "kafka": if kafka_connected { "connected" } else { "noop" },
    }))
}

fn format_uptime(secs: u64) -> String {
    let days = secs / 86400;
    let hours = (secs % 86400) / 3600;
    let minutes = (secs % 3600) / 60;
    if days > 0 {
        format!("{}d {}h {}m", days, hours, minutes)
    } else if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else {
        format!("{}m {}s", minutes, secs % 60)
    }
}
