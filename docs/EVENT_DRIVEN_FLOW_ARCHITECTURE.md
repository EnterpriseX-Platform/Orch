# Event-Driven Flow Architecture

## Overview
Kafka is used as the intermediary between nodes to reduce load and improve scalability.

## Target Flow

```
[HTTP Request] 
    ↓
[Extract Node] - extract data from the request
    ↓ (Kafka)
[Proxy Node] - call an external API
    ↓ (Kafka)
[Event Log Node] - log the event to PostgreSQL
    ↓ (Kafka)
[Audit Node] - record an audit trail
    ↓ (Kafka)
[Response Node] - build the response
    ↓
[HTTP Response]
```

## Kafka Topics

### 1. Dynamic Flow Topics
- `flow-{flow_id}-input` - input for each flow
- `flow-{flow_id}-node-{node_id}-out` - output of each node
- `flow-{flow_id}-error` - error handling

### 2. Common Topics
- `audit-events` - audit log events
- `event-logs` - application event logs
- `flow-responses` - responses to send back to the client

## Node Types

### 1. Extract Node
```json
{
  "id": "extract-001",
  "type": "EXTRACT",
  "config": {
    "fields": ["headers.X-Request-ID", "body.userId", "body.amount"],
    "store_as": "context"
  }
}
```

### 2. Proxy Node (Call API)
```json
{
  "id": "proxy-001",
  "type": "PROXY",
  "config": {
    "target_url": "https://api.example.com/payments",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer ${context.token}",
      "X-Request-ID": "${context.requestId}"
    },
    "body_template": "${context.body}",
    "timeout_ms": 30000,
    "retry_count": 3
  }
}
```

### 3. Event Log Node
```json
{
  "id": "eventlog-001",
  "type": "EVENT_LOG",
  "config": {
    "event_type": "API_CALL",
    "severity": "INFO",
    "metadata_fields": ["context.userId", "context.amount", "proxy.response_status"]
  }
}
```

### 4. Audit Node
```json
{
  "id": "audit-001",
  "type": "AUDIT",
  "config": {
    "action": "API_CALL",
    "entity_type": "PAYMENT",
    "user_field": "context.userId",
    "log_request": true,
    "log_response": true
  }
}
```

### 5. Response Node
```json
{
  "id": "response-001",
  "type": "RESPONSE",
  "config": {
    "status_code": "${proxy.status}",
    "headers": {
      "Content-Type": "application/json",
      "X-Request-ID": "${context.requestId}"
    },
    "body_template": {
      "success": true,
      "data": "${proxy.response_body}",
      "request_id": "${context.requestId}"
    }
  }
}
```

## Execution Modes

### 1. Synchronous Mode (Default)
Executes all nodes within the same request. Faster, and well suited to APIs that need an immediate response.

### 2. Asynchronous Mode (Kafka Pipeline)
Each node is an independent consumer:
- Reduces blocking between nodes
- Each node can scale independently
- Supports retries and a dead-letter queue
- Well suited to long-running processes

## orch-broker Components

### 1. Flow Engine
- Routes the request to the correct flow
- Initializes the execution context
- Manages state between nodes

### 2. Node Executors
Each type has its own executor:
- `ExtractExecutor`
- `ProxyExecutor`
- `EventLogExecutor`
- `AuditExecutor`
- `ResponseExecutor`

### 3. Kafka Integration
- Producer: sends an event to the next node
- Consumer: waits for an event and then executes

### 4. State Management
- In-memory: fast, but lost on restart
- Redis: fast and persistent
- PostgreSQL: slower but durable

## Database Schema

### Event Log Table
```sql
CREATE TABLE event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'INFO',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Flow Execution State
```sql
CREATE TABLE flow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id TEXT NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'RUNNING',
    context JSONB,
    current_node_id TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);
```
