# Orch - Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ORCH BROKER (Rust) - Port 8047                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. Receive Request                                              │    │
│  │  2. Match Route → Load Deployed Flow Config (from memory/cache) │    │
│  │  3. Execute Flow:                                               │    │
│  │     ├─▶ Extract Fields (from request body/query/headers)        │    │
│  │     ├─▶ Audit Log → PostgreSQL:5447                             │    │
│  │     ├─▶ Transform Data                                          │    │
│  │     ├─▶ Webhook → External API                                  │    │
│  │     ├─▶ Kafka Event → Kafka:9047                                │    │
│  │     └─▶ Proxy to Backend API → Return Response to Client        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌──────────────┐          ┌──────────────┐            ┌──────────────┐
│ PostgreSQL   │          │ Kafka        │            │ External API │
│ Port: 5447   │          │ Port: 9047   │            │ (Backend)    │
└──────────────┘          └──────────────┘            └──────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  KAFKA CONSUMER      │
                    │  (Separate Service)  │
                    │                      │
                    │  1. Read Message     │
                    │  2. Audit Log → DB   │
                    │  3. Call Target API  │
                    │  4. Response back    │
                    └──────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         ORCH WEB (Next.js) - Port 3047                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  TOOLS / CONFIGURATION:                                         │    │
│  │  ├─▶ Draw/Create Flow (Visual Editor)                          │    │
│  │  ├─▶ Deploy Flow → Push to Broker:8047                         │    │
│  │  ├─▶ View Audit Logs (from PostgreSQL)                         │    │
│  │  └─▶ Dashboard/Monitor                                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Port Summary

| Service | Port | Role |
|---------|------|------|
| **Orch Web** | 3047 | Config Tool (UI + Deploy Flow + View Logs) |
| **Orch Broker** | 8047 | Flow Execution Engine (holds deployed flows) |
| **PostgreSQL** | 5447 | Database (Audit Logs, Configs) |
| **Kafka** | 9047 | Event Streaming |

## Flow Execution Detail

### 1. Deploy Flow (from Orch Web → Broker)
```
Orch Web:3047 ──POST /api/flows/:id/deploy──▶ Broker:8047/deploy
                                               │
                                               ▼ Store in Memory
                                          ┌────────────┐
                                          │ Flow Cache │
                                          │ (HashMap)  │
                                          └────────────┘
```

### 2. Execute Flow (Broker at work)
```
Client ──▶ Broker:8047/api/v1/orders/submit
                │
                ▼
        Match Route: "/api/v1/orders/*" → Flow ID: "flow-orders-001"
                │
                ▼ Load Flow Config from Cache
        ┌────────────────────────────────┐
        │ Execute Nodes:                 │
        │ 1. ExtractNode:               │
        │    - Extract user_id, amount  │
        │                               │
        │ 2. AuditNode:                 │
        │    - INSERT INTO audit_logs   │
        │    - Direct to PostgreSQL:5447│
        │                               │
        │ 3. TransformNode:             │
        │    - Transform data format    │
        │                               │
        │ 4. WebhookNode:               │
        │    - POST to external API     │
        │                               │
        │ 5. KafkaNode:                 │
        │    - Produce to Kafka:9047    │
        │                               │
        │ 6. ProxyNode:                 │
        │    - Call Backend API         │
        │    - Return Response          │
        └────────────────────────────────┘
                │
                ▼ Response
            Client
```

### 3. Kafka Consumer (separate)
```
Kafka:9047 ──Consume──▶ Consumer Service
                            │
                            ▼
                    ┌────────────────┐
                    │ Process Event  │
                    │ 1. Audit Log   │──▶ PostgreSQL:5447
                    │ 2. Call API    │──▶ Target API
                    │ 3. Response    │──▶ Return to caller
                    └────────────────┘
```

## Broker Responsibilities

### 1. Deploy Endpoint (called by Orch Web)
```rust
POST /deploy/flows/:id
Body: {
  "nodes": [...],
  "edges": [...],
  "flow_type": "audit_trail"
}
→ Store in: Arc<RwLock<HashMap<String, FlowConfig>>>
```

### 2. Execute Endpoint (called by clients)
```rust
ANY /api/v1/*
→ Match path to Flow
→ Execute each node
→ Return response
```

### 3. Node Execution
- **ExtractNode**: extract data from the request (JSON Path, XPath)
- **AuditNode**: write directly to PostgreSQL
- **TransformNode**: transform data (JSONata, JMESPath)
- **WebhookNode**: HTTP client calling an external endpoint
- **KafkaNode**: producer sending to Kafka
- **ProxyNode**: forward to a backend API

## Orch Web Responsibilities (Port 3047)

### Frontend Pages
- `/flows` - create/edit flows (visual editor)
- `/flows/:id/deploy` - deploy to the broker
- `/logs` - view audit logs (read from PostgreSQL)
- `/dashboard` - dashboard monitor

### API Endpoints
- `GET/POST/PUT/DELETE /api/flows` - CRUD flow config
- `POST /api/flows/:id/deploy` - deploy to the broker
- `GET /api/logs` - query audit logs
- `GET /api/dashboard` - stats

## Database (PostgreSQL:5447)

### Tables
- `flow_configs` - flow configurations (backup)
- `audit_logs` - audit logs (written directly by the broker)
- `api_logs` - API access logs
- `flow_executions` - flow execution history

## Deployment Flow

1. A **developer** opens Orch Web on port 3047
2. Go to `/flows` → create a new flow
3. Click **"Deploy"** → Orch Web sends a POST to Broker:8047/deploy
4. The broker stores the flow in memory
5. A client calls Broker:8047 → the broker uses the cached flow
6. The broker runs the flow → records the audit → sends to Kafka → returns the response
