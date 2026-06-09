// ==========================================
// Worker Manager Service
// Dynamic worker lifecycle management
// ==========================================
//
// TODO: External Workers Support (Future)
// See: docs/external-workers-design.md
//
// Current: Built-in Mode (in-process workers)
// Future:  External Mode (standalone worker nodes)
//
// Phase 2 Tasks:
// - [ ] Add WorkerRegistry for external worker tracking
// - [ ] Implement heartbeat monitoring
// - [ ] Add task dispatcher for external workers
// - [ ] Support mixed mode (built-in + external)

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tracing::{info, error, warn};

use crate::{
    sdk::NodeRegistry,
    services::flow_executor_sdk::FlowExecutorSdk,
    services::worker_consumer::WorkerConsumer,
};

/// Worker instance information
#[derive(Debug, Clone)]
pub struct WorkerInstance {
    pub queue_name: String,
    pub status: WorkerStatus,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub handle_id: String,
    // Phase 2: External worker support
    pub worker_type: WorkerType,
    pub external_endpoint: Option<String>,
}

/// Worker execution type
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum WorkerType {
    /// In-process Kafka consumer (current behavior)
    Local,
    /// Remote worker node reached via HTTP (Phase 2)
    External,
}

/// Configuration for external workers (Phase 2)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExternalWorkerConfig {
    pub endpoint: String,
    pub health_check_path: String,
    pub job_submit_path: String,
    pub timeout_ms: u64,
    pub max_concurrent_jobs: u32,
    pub supported_node_types: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum WorkerStatus {
    Running,
    Stopping,
    Stopped,
    Error(String),
}

impl std::fmt::Display for WorkerStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkerStatus::Running => write!(f, "running"),
            WorkerStatus::Stopping => write!(f, "stopping"),
            WorkerStatus::Stopped => write!(f, "stopped"),
            WorkerStatus::Error(e) => write!(f, "error: {}", e),
        }
    }
}

/// Worker configuration
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorkerConfig {
    pub auto_restart: bool,
    pub enable_logging: bool,
    pub high_priority: bool,
    pub max_retries: u32,
    pub timeout: u32,
}

impl Default for WorkerConfig {
    fn default() -> Self {
        Self {
            auto_restart: true,
            enable_logging: true,
            high_priority: false,
            max_retries: 3,
            timeout: 30000,
        }
    }
}

/// Worker Manager - manages worker lifecycle dynamically
pub struct WorkerManager {
    workers: Arc<RwLock<HashMap<String, WorkerInstance>>>,
    handles: Arc<RwLock<HashMap<String, JoinHandle<()>>>>,
    configs: Arc<RwLock<HashMap<String, WorkerConfig>>>,
    kafka_brokers: String,
    registry: NodeRegistry,
    executor: Arc<FlowExecutorSdk>,
}

impl WorkerManager {
    /// Create new Worker Manager
    pub fn new(
        kafka_brokers: String,
        registry: NodeRegistry,
        executor: Arc<FlowExecutorSdk>,
    ) -> Self {
        Self {
            workers: Arc::new(RwLock::new(HashMap::new())),
            handles: Arc::new(RwLock::new(HashMap::new())),
            configs: Arc::new(RwLock::new(HashMap::new())),
            kafka_brokers,
            registry,
            executor,
        }
    }
    
    /// Get worker config
    pub async fn get_config(&self, queue_name: &str) -> WorkerConfig {
        let configs = self.configs.read().await;
        configs.get(queue_name).cloned().unwrap_or_default()
    }
    
    /// Set worker config
    pub async fn set_config(&self, queue_name: &str, config: WorkerConfig) {
        let mut configs = self.configs.write().await;
        configs.insert(queue_name.to_string(), config);
    }

    /// Add new worker at runtime
    pub async fn add_worker(&self, queue_name: &str) -> Result<WorkerInstance, String> {
        let mut workers = self.workers.write().await;
        let mut handles = self.handles.write().await;

        // Check if already exists
        if workers.contains_key(queue_name) {
            return Err(format!("Worker for queue '{}' already exists", queue_name));
        }

        info!("🚀 Starting new worker for queue: {}", queue_name);

        // Create worker consumer
        let consumer = match WorkerConsumer::new(
            &self.kafka_brokers,
            queue_name,
            self.registry.clone(),
            self.executor.clone(),
        ).await {
            Ok(c) => c,
            Err(e) => {
                error!("❌ Failed to create worker consumer: {}", e);
                return Err(format!("Failed to create worker: {}", e));
            }
        };

        // Spawn worker task
        let handle = tokio::spawn(async move {
            Arc::new(consumer).start().await;
        });

        let handle_id = uuid::Uuid::new_v4().to_string();
        let instance = WorkerInstance {
            queue_name: queue_name.to_string(),
            status: WorkerStatus::Running,
            started_at: chrono::Utc::now(),
            handle_id: handle_id.clone(),
            worker_type: WorkerType::Local,
            external_endpoint: None,
        };

        workers.insert(queue_name.to_string(), instance.clone());
        handles.insert(handle_id.clone(), handle);

        info!("✅ Worker started for queue: {} (handle: {})", queue_name, handle_id);
        Ok(instance)
    }

    /// Stop and remove worker
    pub async fn remove_worker(&self, queue_name: &str) -> Result<(), String> {
        let mut workers = self.workers.write().await;
        let mut handles = self.handles.write().await;

        let worker = workers.get_mut(queue_name)
            .ok_or_else(|| format!("Worker for queue '{}' not found", queue_name))?;

        info!("🛑 Stopping worker for queue: {}", queue_name);
        
        worker.status = WorkerStatus::Stopping;

        // Get handle and abort
        if let Some(handle) = handles.remove(&worker.handle_id) {
            handle.abort();
            info!("✅ Worker handle aborted for queue: {}", queue_name);
        }

        worker.status = WorkerStatus::Stopped;
        workers.remove(queue_name);

        info!("✅ Worker removed for queue: {}", queue_name);
        Ok(())
    }

    /// List all worker instances
    pub async fn list_workers(&self) -> Vec<WorkerInstance> {
        let workers = self.workers.read().await;
        workers.values().cloned().collect()
    }

    /// Get single worker status
    pub async fn get_worker(&self, queue_name: &str) -> Option<WorkerInstance> {
        let workers = self.workers.read().await;
        workers.get(queue_name).cloned()
    }

    /// Check if worker is running
    pub async fn is_running(&self, queue_name: &str) -> bool {
        let workers = self.workers.read().await;
        workers.get(queue_name)
            .map(|w| w.status == WorkerStatus::Running)
            .unwrap_or(false)
    }

    /// Start default workers (called from main.rs)
    pub async fn start_default_workers(&self, queues: Vec<&str>) {
        for queue in queues {
            if let Err(e) = self.add_worker(queue).await {
                warn!("⚠️ Failed to start default worker '{}': {}", queue, e);
            }
        }
    }

    /// Shutdown all workers gracefully
    pub async fn shutdown_all(&self) {
        let workers = self.workers.read().await;
        let queue_names: Vec<String> = workers.keys().cloned().collect();
        drop(workers);

        for queue_name in queue_names {
            if let Err(e) = self.remove_worker(&queue_name).await {
                error!("❌ Failed to shutdown worker '{}': {}", queue_name, e);
            }
        }

        info!("✅ All workers shutdown complete");
    }
    
    /// Get worker statistics (for monitoring)
    pub async fn get_stats(&self) -> WorkerManagerStats {
        let workers = self.workers.read().await;
        let total = workers.len();
        let running = workers.values().filter(|w| w.status == WorkerStatus::Running).count();
        let stopped = workers.values().filter(|w| w.status == WorkerStatus::Stopped).count();
        let error = workers.values().filter(|w| matches!(w.status, WorkerStatus::Error(_))).count();
        
        WorkerManagerStats {
            total_workers: total,
            running,
            stopped,
            error,
            queue_names: workers.keys().cloned().collect(),
        }
    }
    
    /// Phase 2: Dispatch job to external worker (not yet implemented)
    pub async fn dispatch_to_external(&self, _worker_id: &str, _job: &serde_json::Value) -> Result<serde_json::Value, String> {
        Err("External worker dispatch not yet implemented (Phase 2)".to_string())
    }

    /// Determine whether to use local or external worker for a queue
    pub async fn resolve_worker_type(&self, _queue_name: &str) -> WorkerType {
        // Phase 2: Check if external workers are registered for this queue
        WorkerType::Local
    }

    /// Get detailed info of all workers
    pub async fn list_worker_details(&self) -> Vec<WorkerDetail> {
        let workers = self.workers.read().await;
        workers.values().map(|w| WorkerDetail {
            queue_name: w.queue_name.clone(),
            status: format!("{:?}", w.status),
            created_at: w.started_at.to_rfc3339(),
            last_activity: None,
            messages_processed: 0,
            messages_failed: 0,
        }).collect()
    }
}

/// Statistics for monitoring
#[derive(Debug, Clone, serde::Serialize)]
pub struct WorkerManagerStats {
    pub total_workers: usize,
    pub running: usize,
    pub stopped: usize,
    pub error: usize,
    pub queue_names: Vec<String>,
}

/// Detailed worker info for monitoring
#[derive(Debug, Clone, serde::Serialize)]
pub struct WorkerDetail {
    pub queue_name: String,
    pub status: String,
    pub created_at: String,
    pub last_activity: Option<String>,
    pub messages_processed: u64,
    pub messages_failed: u64,
}

impl Clone for WorkerManager {
    fn clone(&self) -> Self {
        Self {
            workers: Arc::clone(&self.workers),
            handles: Arc::clone(&self.handles),
            configs: Arc::clone(&self.configs),
            kafka_brokers: self.kafka_brokers.clone(),
            registry: self.registry.clone(),
            executor: Arc::clone(&self.executor),
        }
    }
}
