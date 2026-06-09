// ==========================================
// External Worker Registry
// Tracks external workers (registration, heartbeat, health)
// ==========================================

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tracing::{info, warn};

/// External worker status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ExternalWorkerStatus {
    Healthy,
    Unhealthy,
    Disconnected,
}

/// Registered external worker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisteredWorker {
    pub id: String,
    pub name: String,
    pub queue: String,
    pub endpoint: String,
    pub status: ExternalWorkerStatus,
    pub last_heartbeat: DateTime<Utc>,
    pub registered_at: DateTime<Utc>,
    pub capabilities: Option<Value>,
    pub metrics: Option<Value>,
    pub max_concurrent_jobs: u32,
    pub current_jobs: u32,
}

/// Registration request
#[derive(Debug, Clone, Deserialize)]
pub struct RegisterWorkerRequest {
    pub name: String,
    pub queue: String,
    pub endpoint: String,
    pub capabilities: Option<Value>,
    pub max_concurrent_jobs: Option<u32>,
}

/// Heartbeat request
#[derive(Debug, Clone, Deserialize)]
pub struct HeartbeatRequest {
    pub metrics: Option<Value>,
    pub current_jobs: Option<u32>,
}

/// External Worker Registry
pub struct WorkerRegistry {
    workers: DashMap<String, RegisteredWorker>,
    /// Index: queue_name → list of worker IDs
    queue_index: DashMap<String, Vec<String>>,
}

impl WorkerRegistry {
    pub fn new() -> Self {
        Self {
            workers: DashMap::new(),
            queue_index: DashMap::new(),
        }
    }

    /// Register a new external worker
    pub fn register(&self, req: RegisterWorkerRequest) -> RegisteredWorker {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();

        let worker = RegisteredWorker {
            id: id.clone(),
            name: req.name,
            queue: req.queue.clone(),
            endpoint: req.endpoint,
            status: ExternalWorkerStatus::Healthy,
            last_heartbeat: now,
            registered_at: now,
            capabilities: req.capabilities,
            metrics: None,
            max_concurrent_jobs: req.max_concurrent_jobs.unwrap_or(5),
            current_jobs: 0,
        };

        self.workers.insert(id.clone(), worker.clone());

        // Update queue index
        self.queue_index
            .entry(req.queue)
            .or_insert_with(Vec::new)
            .push(id);

        info!("✅ External worker registered: {} ({})", worker.name, worker.id);
        worker
    }

    /// Process heartbeat from a worker
    pub fn heartbeat(&self, worker_id: &str, req: HeartbeatRequest) -> Result<RegisteredWorker, String> {
        match self.workers.get_mut(worker_id) {
            Some(mut worker) => {
                worker.last_heartbeat = Utc::now();
                worker.status = ExternalWorkerStatus::Healthy;
                if let Some(metrics) = req.metrics {
                    worker.metrics = Some(metrics);
                }
                if let Some(current_jobs) = req.current_jobs {
                    worker.current_jobs = current_jobs;
                }
                Ok(worker.clone())
            }
            None => Err(format!("Worker not found: {}", worker_id)),
        }
    }

    /// Deregister an external worker
    pub fn deregister(&self, worker_id: &str) -> Result<RegisteredWorker, String> {
        match self.workers.remove(worker_id) {
            Some((_, worker)) => {
                // Remove from queue index
                if let Some(mut queue_workers) = self.queue_index.get_mut(&worker.queue) {
                    queue_workers.retain(|id| id != worker_id);
                }
                info!("🗑️ External worker deregistered: {} ({})", worker.name, worker.id);
                Ok(worker)
            }
            None => Err(format!("Worker not found: {}", worker_id)),
        }
    }

    /// Get all workers for a specific queue
    pub fn get_workers_for_queue(&self, queue: &str) -> Vec<RegisteredWorker> {
        match self.queue_index.get(queue) {
            Some(worker_ids) => {
                worker_ids.iter()
                    .filter_map(|id| self.workers.get(id).map(|w| w.clone()))
                    .collect()
            }
            None => vec![],
        }
    }

    /// Get healthy workers for a queue
    pub fn get_healthy_workers(&self, queue: &str) -> Vec<RegisteredWorker> {
        self.get_workers_for_queue(queue)
            .into_iter()
            .filter(|w| w.status == ExternalWorkerStatus::Healthy)
            .collect()
    }

    /// Get all registered workers
    pub fn list_all(&self) -> Vec<RegisteredWorker> {
        self.workers.iter().map(|entry| entry.value().clone()).collect()
    }

    /// Get a specific worker
    pub fn get_worker(&self, worker_id: &str) -> Option<RegisteredWorker> {
        self.workers.get(worker_id).map(|w| w.clone())
    }

    /// Health check: mark workers as unhealthy if heartbeat is stale
    pub fn check_health(&self, timeout_secs: i64) {
        let now = Utc::now();
        let mut unhealthy_count = 0;

        for mut entry in self.workers.iter_mut() {
            let elapsed = now.signed_duration_since(entry.last_heartbeat).num_seconds();

            if elapsed > timeout_secs && entry.status == ExternalWorkerStatus::Healthy {
                entry.status = ExternalWorkerStatus::Unhealthy;
                unhealthy_count += 1;
                warn!(
                    "⚠️ Worker {} ({}) marked unhealthy: last heartbeat {}s ago",
                    entry.name, entry.id, elapsed
                );
            }

            // Disconnected: 3x timeout
            if elapsed > timeout_secs * 3 && entry.status == ExternalWorkerStatus::Unhealthy {
                entry.status = ExternalWorkerStatus::Disconnected;
                warn!(
                    "❌ Worker {} ({}) marked disconnected: last heartbeat {}s ago",
                    entry.name, entry.id, elapsed
                );
            }
        }

        if unhealthy_count > 0 {
            info!("Health check: {} workers marked unhealthy", unhealthy_count);
        }
    }

    /// Get registry statistics
    pub fn stats(&self) -> Value {
        let total = self.workers.len();
        let healthy = self.workers.iter()
            .filter(|w| w.status == ExternalWorkerStatus::Healthy)
            .count();
        let unhealthy = self.workers.iter()
            .filter(|w| w.status == ExternalWorkerStatus::Unhealthy)
            .count();
        let disconnected = self.workers.iter()
            .filter(|w| w.status == ExternalWorkerStatus::Disconnected)
            .count();

        let queues: Vec<String> = self.queue_index.iter()
            .map(|entry| entry.key().clone())
            .collect();

        serde_json::json!({
            "total": total,
            "healthy": healthy,
            "unhealthy": unhealthy,
            "disconnected": disconnected,
            "queues": queues,
        })
    }
}
