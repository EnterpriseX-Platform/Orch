// ==========================================
// Orch Broker - Flow Execution Engine
// Port: 8047
// ==========================================

use axum::{
    routing::{any, delete, get, patch, post},
    Router,
    middleware,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;
use tower_http::compression::CompressionLayer;
use tracing::{info, warn, error, Level};
use tracing_subscriber;

mod config;
mod error;
mod handlers;
mod middlewares;
mod models;
mod routes;
mod sdk;
mod services;

use config::GATEWAY_PORT;
use handlers::{deploy, nodes};
use routes::execute;
use services::{
    api_resolver::ApiRegistry,
    config_manager::ConfigManager,
    flow_executor_sdk::FlowExecutorSdk,
    jwt_validator::JwtValidator,
    kafka_admin,
    kafka_pipeline::KafkaProducer,
    worker_manager::WorkerManager,
    worker_registry::WorkerRegistry,
};
use sdk::NodeRegistry;

/// Application State
pub struct AppState {
    pub api_registry: Arc<ApiRegistry>,
    pub config_manager: Arc<ConfigManager>,
    pub flow_executor_sdk: Arc<FlowExecutorSdk>,
    pub node_registry: NodeRegistry,
    pub kafka_producer: Arc<KafkaProducer>,
    pub http_client: reqwest::Client,
    pub jwt_validator: Arc<JwtValidator>,
    pub worker_manager: Arc<WorkerManager>,
    pub worker_registry: Arc<WorkerRegistry>,
    // System metrics
    pub system: Arc<tokio::sync::Mutex<sysinfo::System>>,
    pub boot_instant: std::time::Instant,
    pub request_counter: std::sync::atomic::AtomicU64,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    info!("╔══════════════════════════════════════════════════════════════╗");
    info!("║     Orch Broker - Flow Execution Engine                       ║");
    info!("╠══════════════════════════════════════════════════════════════╣");
    info!("║  Port:         8047                                          ║");
    info!("║  API Base:     http://localhost:3047/orch                    ║");
    info!("║  Database:     PostgreSQL (Port 5447)                        ║");
    info!("║  Kafka:        Port 9047                                     ║");
    info!("║  Mode:         SDK-based Flow Execution                      ║");
    info!("╚══════════════════════════════════════════════════════════════╝");

    // Configuration
    //
    // API_BASE_URL is read from env first because it's needed to fetch
    // everything else from system_configs. Kafka brokers are first read
    // from DB (system_configs) with env fallback — admins can change the
    // kafka target without a broker redeploy.
    let api_base_url = config::system::api_base_url();
    let kafka_brokers = config::system::kafka_bootstrap().await;

    info!("🔧 Config: API_BASE_URL={}", api_base_url);
    info!("🔧 Config: KAFKA_BROKERS={}  (source: system_configs → env KAFKA_BROKERS)", kafka_brokers);

    // ========================================
    // Initialize Services
    // ========================================

    // 1. API Registry - resolve ApiRegistration from path
    let api_registry = Arc::new(ApiRegistry::new(&api_base_url));
    info!("✅ API Registry initialized");

    // 2. Config Manager - load flow configs
    let config_manager = Arc::new(ConfigManager::new(&api_base_url));
    info!("✅ Config Manager initialized");

    // 3. Kafka Producer - send events
    let kafka_producer = match KafkaProducer::new(&kafka_brokers).await {
        Ok(producer) => {
            info!("✅ Kafka Producer connected");
            Arc::new(producer)
        }
        Err(e) => {
            warn!("╔══════════════════════════════════════════════════════╗");
            warn!("║  KAFKA UNAVAILABLE — RUNNING IN NOOP MODE           ║");
            warn!("║  Messages will NOT be delivered to topics.           ║");
            warn!("║  Error: {:<43}║", &format!("{}", e)[..std::cmp::min(format!("{}", e).len(), 43)]);
            warn!("╚══════════════════════════════════════════════════════╝");
            Arc::new(KafkaProducer::noop())
        }
    };
    
    // 3b. Initialize global Kafka producer for handlers
    if let Err(e) = services::kafka_pipeline::init_global_kafka_producer(&kafka_brokers).await {
        warn!("⚠️  Failed to init global Kafka producer: {}", e);
    } else {
        info!("✅ Global Kafka producer initialized for handlers");
    }

    // 3c. Initialize global DB pool manager for database query nodes
    services::db_pool_manager::init_global_db_pool_manager();

    // 3a. Kafka Admin - manage topics (auto-create)
    if let Err(e) = kafka_admin::init_kafka_admin(&kafka_brokers) {
        warn!("⚠️  Kafka Admin failed: {}", e);
        warn!("⚠️  Topic auto-creation disabled");
    } else {
        info!("✅ Kafka Admin initialized (topic auto-creation enabled)");
    }

    // 4. Initialize Node Registry (SDK)
    let node_registry = NodeRegistry::new();
    node_registry.register_builtin_handlers().await;
    info!("✅ Node Registry initialized with {} handlers", 
        node_registry.list_types().await.len());

    // 5. Flow Executor SDK
    let flow_executor_sdk = Arc::new(FlowExecutorSdk::new(node_registry.clone()));
    info!("✅ Flow Executor SDK initialized");

    // Pre-load configurations
    if let Err(e) = api_registry.refresh_cache().await {
        warn!("⚠️  Failed to preload API registry: {}", e);
    }
    if let Err(e) = config_manager.refresh_cache().await {
        warn!("⚠️  Failed to preload flow configs: {}", e);
    }

    // ========================================
    // Start Background Tasks
    // ========================================

    // Refresh API registry cache every 30 seconds
    let registry_clone = api_registry.clone();
    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(30));
        loop {
            ticker.tick().await;
            if let Err(e) = registry_clone.refresh_cache().await {
                error!("Failed to refresh API registry: {}", e);
            }
        }
    });

    // Refresh flow config cache every 30 seconds
    let config_clone = config_manager.clone();
    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(30));
        loop {
            ticker.tick().await;
            if let Err(e) = config_clone.refresh_cache().await {
                error!("Failed to refresh flow configs: {}", e);
            }
        }
    });

    // ========================================
    // Start Worker Manager (Async Node Execution)
    // ========================================
    let worker_manager = Arc::new(WorkerManager::new(
        kafka_brokers.clone(),
        node_registry.clone(),
        flow_executor_sdk.clone(),
    ));
    
    // Start default workers
    worker_manager.start_default_workers(vec!["default", "high", "low"]).await;
    info!("✅ Worker Manager started with queues: default, high, low");

    // §5 mandatory delivery: flow audit/event nodes deliver directly to the
    // web API over HTTP with bounded retry (sdk::handlers::deliver_to_orch_with_retry).
    // A Kafka-primary path (node publish → audit-events/event-logs topic →
    // this consumer → POST /api/audit|/api/events) was tried but proved
    // unreliable on this deployment: after a Kafka PVC reset the consumer did
    // not drain the topics, silently losing node-published audits. HTTP is the
    // source of truth; the audit_event_consumer module is left dormant (not
    // started) so a durable Kafka path can be reinstated if Kafka is stabilised.

    // ========================================
    // JWT Validator (OIDC token validation)
    // ========================================
    let jwt_validator = Arc::new(JwtValidator::new());
    info!("✅ JWT Validator initialized");

    // ========================================
    // External Worker Registry
    // ========================================
    let worker_registry = Arc::new(WorkerRegistry::new());
    info!("✅ External Worker Registry initialized");

    // Health check for external workers (every 30s, timeout 90s)
    let registry_health = worker_registry.clone();
    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(30));
        loop {
            ticker.tick().await;
            registry_health.check_health(90);
        }
    });

    // ========================================
    // Build Application State
    // ========================================
    // Initialize system metrics
    let mut sys = sysinfo::System::new();
    sys.refresh_all();

    let state = Arc::new(AppState {
        api_registry: api_registry.clone(),
        config_manager: config_manager.clone(),
        flow_executor_sdk: flow_executor_sdk.clone(),
        node_registry: node_registry.clone(),
        kafka_producer: kafka_producer.clone(),
        http_client: reqwest::Client::new(),
        jwt_validator: jwt_validator.clone(),
        worker_manager: worker_manager.clone(),
        worker_registry: worker_registry.clone(),
        system: Arc::new(tokio::sync::Mutex::new(sys)),
        boot_instant: std::time::Instant::now(),
        request_counter: std::sync::atomic::AtomicU64::new(0),
    });

    // ========================================
    // Build Router
    // ========================================
    
    // Core API routes (without context path)
    let core_routes = Router::new()
        // Health check
        .route("/health", get(handlers::metrics::health_check))
        
        // Metrics API (JSON - internal monitoring dashboards)
        .route("/metrics", get(handlers::metrics::get_metrics))

        // Prometheus scrape endpoint (text format for Prometheus)
        .route("/metrics/prometheus", get(handlers::metrics::get_prometheus_metrics))
        
        // Node Registry API (SDK)
        .route("/nodes", get(nodes::list_node_types))
        .route("/nodes/categories", get(nodes::list_categories))
        .route("/nodes/export", get(nodes::export_nodes))
        .route("/nodes/:node_type", get(nodes::get_node_type))
        .route("/nodes/:node_type/validate", post(nodes::validate_node_config))
        
        // Deploy API (Orch -> Gateway)
        .route("/deploy/flows", get(deploy::list_deployed_flows))
        .route("/deploy/flows/:id", post(deploy::deploy_flow))
        .route("/deploy/flows/:id", get(deploy::get_deployed_flow))
        .route("/deploy/flows/:id", delete(deploy::undeploy_flow))
        
        // Test API (for development/testing)
        .route("/test/execute/:flow_id", post(handlers::test::test_execute_flow))
        
        // Job Status API
        .route("/admin/jobs", get(handlers::jobs::list_jobs))
        .route("/admin/jobs/by-request/:requestId", get(handlers::jobs::get_jobs_by_request))
        .route("/admin/jobs/:id", get(handlers::jobs::get_job_status))

        // External Worker API
        .route("/admin/workers/register", post(handlers::external_workers::register_external_worker))
        .route("/admin/workers/external", get(handlers::external_workers::list_external_workers))
        .route("/admin/workers/external/:id", get(handlers::external_workers::get_external_worker))
        .route("/admin/workers/external/:id", delete(handlers::external_workers::deregister_external_worker))
        .route("/admin/workers/external/:id/heartbeat", post(handlers::external_workers::worker_heartbeat))

        // Worker API (internal queue management)
        .route("/admin/workers", get(handlers::workers::get_workers))
        .route("/admin/workers", post(handlers::workers::create_worker))
        .route("/admin/workers/stats", get(handlers::workers::get_worker_stats))
        .route("/admin/workers/:queue", delete(handlers::workers::remove_worker))
        .route("/admin/workers/:queue/rename", patch(handlers::workers::rename_worker))
        .route("/admin/workers/:queue/config", get(handlers::workers::get_worker_config))
        .route("/admin/workers/:queue/config", patch(handlers::workers::update_worker_config))
        .route("/admin/workers/:queue/stop", post(handlers::workers::stop_worker))
        .route("/admin/workers/:queue/restart", post(handlers::workers::restart_worker))
        
        // Execute API (Client -> Gateway) — wrapped with API key auth, quota, and idempotency middleware
        .merge(
            Router::new()
                .route("/api/v1/*path", any(execute::execute_api))
                .route("/api/v1/", any(execute::execute_api))
                .layer(middleware::from_fn(middlewares::idempotency::idempotency_middleware))
                .layer(middleware::from_fn(middlewares::quota::quota_middleware))
                .layer(middleware::from_fn(middlewares::api_key_auth::api_key_auth_middleware))
        );
    
    // Main app with nested /broker context
    let app = Router::new()
        // Routes at root level (backward compatibility)
        .nest("/", core_routes.clone())
        // Routes with /broker context
        .nest("/broker", core_routes)
        
        // Layer middlewares
        .layer(
            ServiceBuilder::new()
                .layer(CorsLayer::permissive())
                .layer(CompressionLayer::new().gzip(true).br(true).no_deflate())
                .layer(middleware::from_fn(middlewares::security_headers::security_headers_middleware))
                .layer(middleware::from_fn(middlewares::request_size_limit::request_size_limit_middleware))
                .layer(middleware::from_fn(middlewares::ip_filter::ip_filter_middleware))
                .layer(middleware::from_fn(middlewares::logging::logging_middleware))
        )
        .with_state(state);

    // Bind to port 8047
    let addr = SocketAddr::from(([0, 0, 0, 0], GATEWAY_PORT));
    info!("🚀 Orch Broker listening on http://{}", addr);
    info!("📋 Deploy API:  http://localhost:{}/deploy/flows/:id", GATEWAY_PORT);
    info!("📋 Deploy API:  http://localhost:{}/broker/deploy/flows/:id", GATEWAY_PORT);
    info!("⚡ Execute API: http://localhost:{}/api/v1/*", GATEWAY_PORT);
    info!("⚡ Execute API: http://localhost:{}/broker/api/v1/*", GATEWAY_PORT);
    info!("❤️  Health:     http://localhost:{}/health", GATEWAY_PORT);
    info!("❤️  Health:     http://localhost:{}/broker/health", GATEWAY_PORT);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    // Clone references for graceful shutdown
    let shutdown_kafka = kafka_producer.clone();

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal(shutdown_kafka))
    .await
    .unwrap();

    info!("👋 Orch Broker shutdown complete");
}

/// Wait for SIGTERM/SIGINT, then drain in-flight requests and clean up resources.
/// Axum will stop accepting new connections and wait up to a bounded period for
/// existing requests to complete before the server future resolves.
async fn shutdown_signal(kafka_producer: Arc<KafkaProducer>) {
    use tokio::signal;

    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => { info!("📥 Received Ctrl+C — starting graceful shutdown"); }
        _ = terminate => { info!("📥 Received SIGTERM — starting graceful shutdown"); }
    }

    info!("⏳ Waiting up to 30s for in-flight requests to drain...");

    // Flush / close Kafka producer cleanly (best-effort; bounded by 10s).
    let flush_deadline = Duration::from_secs(10);
    match tokio::time::timeout(flush_deadline, async move {
        kafka_producer.shutdown().await;
    })
    .await
    {
        Ok(_) => info!("✅ Kafka producer flushed"),
        Err(_) => warn!("⚠️  Kafka flush timed out after {:?}", flush_deadline),
    }

    info!("✅ Shutdown tasks complete");
}
