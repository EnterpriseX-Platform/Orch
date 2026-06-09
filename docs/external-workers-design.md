# External Workers Architecture Design

> **Status**: Planned (Not Yet Implemented)  
> **Priority**: Medium  
> **Target**: Future Release (v2.x)

## Overview

Today, workers in Orch run in **Built-in Mode** (in-process with the broker). This works well for small-to-medium use cases, but it is limited when it comes to scaling.

This document designs an architecture for an **External Workers Mode** that supports deploying workers as separate, standalone instances.

---

## Current State (Built-in Mode)

```
┌─────────────────────────────────────┐
│         Orch Broker (PID: 1234)     │
│  ┌─────────────┐  ┌─────────────┐  │
│  │  API GW     │  │ Worker Mgr  │  │
│  │  (Axum)     │  │ (Built-in)  │  │
│  └──────┬──────┘  └──────┬──────┘  │
│         │                │         │
│         ▼                ▼         │
│  ┌─────────────────────────────┐  │
│  │    Kafka Consumer Tasks     │  │  ← run in the same tokio runtime
│  │    (default/high/low)       │  │
│  └─────────────────────────────┘  │
└─────────────────────────────────────┘
              │
              ▼
        ┌──────────┐
        │  Kafka   │
        └──────────┘
```

### Limitations
- Workers share memory/CPU with the broker
- Workers cannot be scaled independently of the broker
- Restarting the broker restarts every worker
- No support for multi-node deployment of workers

---

## Future State (External Workers Mode)

```
┌──────────────────────────────────────────────────────────────┐
│                    Orch Broker Cluster                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  API GW     │  │ Worker Mgr  │  │  Task Scheduler     │  │
│  │  (Axum)     │  │ (Coordinator)│  │  (Load Balancer)    │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
│         │                │                                   │
│         │    HTTP/gRPC   │                                   │
│         │◄──────────────►│                                   │
└─────────┼────────────────┼───────────────────────────────────┘
          │                │
          │   Register     │   Heartbeat
          │   Workers      │   Health Check
          │                │
    ┌─────┴────────────────┴─────┐
    │      Worker Node Pool      │
    │  ┌─────────────────────┐   │
    │  │  orch-worker #1     │   │  ← Standalone Binary
    │  │  - Queue: default   │   │     Docker Container / VM / K8s Pod
    │  │  - CUID: wrk_xxx1   │   │
    │  └─────────────────────┘   │
    │  ┌─────────────────────┐   │
    │  │  orch-worker #2     │   │
    │  │  - Queue: high      │   │
    │  │  - CUID: wrk_xxx2   │   │
    │  └─────────────────────┘   │
    │  ┌─────────────────────┐   │
    │  │  orch-worker #3     │   │
    │  │  - Queue: default   │   │  ← Multiple workers per queue!
    │  │  - CUID: wrk_xxx3   │   │
    │  └─────────────────────┘   │
    └────────────────────────────┘
```

---

## Architecture Components

### 1. Broker Components (Enhanced)

#### Worker Registry Service
```rust
// src/services/worker_registry.rs
pub struct WorkerRegistry {
    /// Active workers by CUID
    workers: DashMap<String, RegisteredWorker>,
    /// Workers grouped by queue
    queue_index: DashMap<String, Vec<String>>, // queue -> [cuid]
    /// Health check coordinator
    health_checker: Arc<HealthChecker>,
}

pub struct RegisteredWorker {
    pub cuid: String,
    pub worker_id: String,
    pub name: String,
    pub queue: String,
    pub endpoint: String,        // http://worker-host:port
    pub status: WorkerStatus,
    pub last_heartbeat: DateTime<Utc>,
    pub capabilities: WorkerCapabilities,
    pub metadata: WorkerMetadata,
}
```

#### Task Distribution API
```rust
// src/handlers/task_dispatch.rs
pub async fn dispatch_task(
    State(state): State<Arc<AppState>>,
    Json(task): Json<TaskRequest>,
) -> Result<Json<TaskResponse>, StatusCode> {
    // 1. Find available workers for queue
    // 2. Load balance (round-robin / least-loaded / priority)
    // 3. Forward task to selected worker
    // 4. Return task_id for tracking
}
```

### 2. New Binary: orch-worker

```
apps/orch-worker/
├── Cargo.toml
├── src/
│   ├── main.rs              # Entry point
│   ├── config.rs            # Worker configuration
│   ├── broker_client.rs     # Broker communication client
│   ├── task_executor.rs     # Task execution engine
│   ├── queue_consumer.rs    # Kafka consumer (per queue)
│   └── heartbeat.rs         # Health reporting
└── Dockerfile
```

#### Worker Lifecycle
```rust
// orch-worker/src/main.rs
#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // 1. Load config from env/file
    let config = WorkerConfig::load()?;
    
    // 2. Register with broker
    let registration = register_with_broker(&config).await?;
    let cuid = registration.cuid; // Broker assigns CUID
    
    // 3. Start heartbeat task
    tokio::spawn(heartbeat_loop(cuid.clone(), config.broker_url));
    
    // 4. Start queue consumer for assigned queue
    let consumer = QueueConsumer::new(&config.queue, &cuid).await?;
    
    // 5. Start task executor
    let executor = TaskExecutor::new(cuid.clone(), registration.capabilities);
    
    // 6. Run until shutdown signal
    tokio::select! {
        _ = consumer.run() => {},
        _ = signal::ctrl_c() => {
            graceful_shutdown(cuid).await?;
        }
    }
    
    Ok(())
}
```

### 3. Communication Protocol

#### Registration Flow
```
Worker                                      Broker
  │                                           │
  │  POST /broker/workers/register            │
  │  {                                        │
  │    "worker_type": "flow-executor",        │
  │    "queue": "default",                    │
  │    "name": "worker-default-01",           │
  │    "endpoint": "http://10.0.1.5:9001",    │
  │    "capabilities": {                      │
  │      "max_concurrent": 10,                │
  │      "supported_flow_types": ["http", "kafka"]
  │    }                                      │
  │  }                                        │
  │──────────────────────────────────────────►│
  │                                           │
  │  201 Created                              │
  │  {                                        │
  │    "cuid": "wrk_abc123xyz",               │
  │    "assigned_queue": "default",           │
  │    "heartbeat_interval_sec": 30           │
  │  }                                        │
  │◄──────────────────────────────────────────│
```

#### Heartbeat Protocol
```
Worker                                      Broker
  │                                           │
  │  POST /broker/workers/{cuid}/heartbeat    │
  │  {                                        │
  │    "timestamp": "2026-03-09T...",         │
  │    "status": "healthy",                   │
  │    "metrics": {                           │
  │      "cpu_percent": 45.2,                 │
  │      "memory_mb": 128,                    │
  │      "active_tasks": 3,                   │
  │      "queued_tasks": 0                    │
  │    }                                      │
  │  }                                        │
  │──────────────────────────────────────────►│
  │  200 OK                                   │
  │  { "action": "continue" }                 │
  │◄──────────────────────────────────────────│
  │                                           │
  │  [Missing heartbeat for 90s]              │
  │                                           │
  │  Broker marks worker as "unhealthy"       │
  │  → Reassign tasks → Remove from pool      │
```

#### Task Assignment (Push Mode)
```
Broker                                      Worker
  │                                           │
  │  POST /worker/{cuid}/tasks                │
  │  {                                        │
  │    "task_id": "task_abc123",              │
  │    "flow_id": "flow_xyz789",              │
  │    "input": { ... },                      │
  │    "timeout_ms": 30000,                   │
  │    "priority": "high"                     │
  │  }                                        │
  │──────────────────────────────────────────►│
  │  202 Accepted                             │
  │  { "status": "processing" }               │
  │◄──────────────────────────────────────────│
  │                                           │
  │  [Async]                                  │
  │  POST /broker/tasks/{task_id}/result      │
  │  {                                        │
  │    "status": "success",                   │
  │    "output": { ... },                     │
  │    "duration_ms": 1250                    │
  │  }                                        │
  │◄──────────────────────────────────────────│
```

---

## Configuration

### Worker Config (YAML)
```yaml
# /etc/orch/worker.yaml
worker:
  name: "worker-default-01"
  type: "flow-executor"
  queue: "default"
  
broker:
  url: "http://orch-broker:8047"
  registration_retry_sec: 5
  heartbeat_interval_sec: 30
  
runtime:
  max_concurrent_tasks: 10
  task_timeout_sec: 300
  graceful_shutdown_sec: 30
  
resources:
  max_memory_mb: 512
  max_cpu_percent: 80
  
features:
  enable_metrics: true
  enable_tracing: true
  supported_flow_types: ["http", "kafka", "webhook"]
```

### Environment Variables
```bash
# Required
ORCH_BROKER_URL=http://localhost:8047
ORCH_WORKER_QUEUE=default

# Optional
ORCH_WORKER_NAME=worker-default-01
ORCH_WORKER_MAX_CONCURRENT=10
ORCH_WORKER_HEARTBEAT_INTERVAL_SEC=30
```

---

## Deployment Patterns

### Pattern 1: Docker Compose (Single Node)
```yaml
services:
  broker:
    image: orch-broker:latest
    ports:
      - "8047:8047"
    
  worker-default:
    image: orch-worker:latest
    environment:
      - ORCH_BROKER_URL=http://broker:8047
      - ORCH_WORKER_QUEUE=default
      - ORCH_WORKER_NAME=worker-default-01
    deploy:
      replicas: 2  # Multiple workers per queue!
      
  worker-high:
    image: orch-worker:latest
    environment:
      - ORCH_BROKER_URL=http://broker:8047
      - ORCH_WORKER_QUEUE=high
      - ORCH_WORKER_MAX_CONCURRENT=5
    deploy:
      replicas: 3  # More workers for high priority queue
```

### Pattern 2: Kubernetes
```yaml
# worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orch-worker-default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orch-worker
      queue: default
  template:
    spec:
      containers:
        - name: worker
          image: orch-worker:latest
          env:
            - name: ORCH_BROKER_URL
              value: "http://orch-broker:8047"
            - name: ORCH_WORKER_QUEUE
              value: "default"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
# HPA for auto-scaling
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orch-worker-default-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orch-worker-default
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: External
      external:
        metric:
          name: kafka_consumer_lag
        target:
          type: AverageValue
          averageValue: "100"
```

---

## Migration Path

### Phase 1: CUID System (✅ Done)
- [x] Add CUID field to worker_configs table
- [x] Update Prisma schema
- [x] Update WorkerManager to use CUID as primary key
- [x] Update Frontend to handle CUID-based identification

### Phase 2: Enhanced Worker Registry (Next)
- [ ] Extend WorkerManager to support external worker registration
- [ ] Add worker metadata fields (endpoint, capabilities, etc.)
- [ ] Implement health check tracking
- [ ] Add worker pool management (per queue)

### Phase 3: orch-worker Binary
- [ ] Create new crate `orch-worker`
- [ ] Implement broker client with registration/heartbeat
- [ ] Extract queue consumer logic from broker
- [ ] Create Docker image

### Phase 4: Task Distribution
- [ ] Implement task dispatcher in broker
- [ ] Add load balancing strategies
- [ ] Implement task result callbacks
- [ ] Add circuit breaker for unhealthy workers

### Phase 5: Production Ready
- [ ] mTLS for worker-broker communication
- [ ] Worker authentication & authorization
- [ ] Metrics & monitoring (Prometheus)
- [ ] Auto-scaling integration

---

## API Changes (Backward Compatible)

### New Endpoints
```
# Worker Registration (External)
POST   /broker/workers/register
POST   /broker/workers/{cuid}/heartbeat
POST   /broker/workers/{cuid}/unregister

# Task Management
POST   /broker/tasks/dispatch
GET    /broker/tasks/{task_id}/status
POST   /broker/tasks/{task_id}/result  # Callback from worker

# Worker Pool Management
GET    /broker/pools/{queue}/workers
POST   /broker/pools/{queue}/rebalance
```

### Existing Endpoints (No Change)
```
# Admin APIs remain unchanged
GET    /broker/admin/workers
POST   /broker/admin/workers/{id}/start
POST   /broker/admin/workers/{id}/stop
# ... etc
```

---

## Performance Considerations

| Metric | Built-in Mode | External Mode |
|--------|--------------|---------------|
| Latency | < 1ms (in-process) | ~5-20ms (HTTP/gRPC) |
| Throughput | ~10K tasks/sec | ~2-5K tasks/sec |
| Memory per worker | Shared | ~50-100MB per instance |
| Scale Limit | Broker CPU/Memory | Unlimited (horizontal) |
| Fault Isolation | Low (shared process) | High (isolated) |

**Recommendation:**
- **Built-in**: Development, small deployments (< 100 tasks/sec)
- **External**: Production, high throughput, multi-tenant, strict isolation

---

## Related Files

- `apps/orch-broker/src/services/worker_manager.rs` - Current built-in implementation
- `apps/web/app/(dashboard)/settings/WorkersTab.tsx` - Worker management UI
- `apps/web/prisma/schema.prisma` - WorkerConfig model with CUID

---

## Notes

- The CUID system already implemented is a key foundation for external workers
- The database schema already supports all the required metadata
- Switching to external mode should be opt-in (configurable) to preserve backward compatibility
