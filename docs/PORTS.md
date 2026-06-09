# Orch - Port Configuration

## Port Mapping

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| **Orch (Next.js)** | `3047` | HTTP | Frontend UI + Backend Config API |
| **Orch Broker (Rust)** | `8047` | HTTP | Flow Execution Engine |
| **PostgreSQL** | `5447` | TCP | Database |
| **Kafka** | `9047` | TCP | Event Streaming |
| **Kafka UI** | `9048` | HTTP | Kafka Management Interface |

## Architecture Flow

```
┌─────────────┐      ┌──────────────────────────┐      ┌──────────────┐
│   Client    │─────▶│  Orch Broker (Rust)      │─────▶│  PostgreSQL  │
│  (Browser)  │◀─────│  Port: 8047              │◀─────│  Port: 5447  │
└─────────────┘      └──────────────────────────┘      └──────────────┘
                              │
                              │ Fetch Config
                              ▼
                       ┌──────────────┐
                       │  Orch     │
                       │  (Next.js)   │
                       │  Port: 3047  │
                       └──────────────┘
                              │
                              │ Send Event
                              ▼
                       ┌──────────────┐
                       │  Kafka       │
                       │  Port: 9047  │
                       └──────────────┘
```

## Flow Execution

```
1. Client ──▶ Orch Broker (8047)
                   │
                   ▼
2. Broker ──▶ Fetch Flow Config ──▶ Orch (3047)
                   │
                   ▼
3. Broker ──▶ Execute Flow Nodes
   - auditNode ──▶ Send Audit ──▶ PostgreSQL (5447)
   - kafkaNode ──▶ Send Event ──▶ Kafka (9047)
   - webhookNode ──▶ Call External API
   - transformNode ──▶ Transform Data
                   │
                   ▼
4. Broker ──▶ Response to Client
```

## Environment Variables

### Orch (Next.js) - Port 3047
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5447/orchiodb"
ORCH_BROKER_URL="http://localhost:8047"
NEXT_PUBLIC_API_BASE_URL="/orch/api"
KAFKA_BROKERS="localhost:9047"
```

### Orch Broker (Rust) - Port 8047
```bash
PORT=8047
DATABASE_URL="postgresql://postgres:postgres@localhost:5447/orchiodb"
KAFKA_BROKERS="localhost:9047"
```

## URLs

- **Orch UI**: http://localhost:3047/orch
- **Orch Broker**: http://localhost:8047
- **Kafka UI**: http://localhost:9048
- **PostgreSQL**: localhost:5447

## Docker Compose

```bash
# Start all services
docker compose up -d

# Check logs
docker compose logs -f

# Stop
docker compose down
```

## Testing

```bash
# Test Orch (3047)
curl http://localhost:3047/orch/api/health

# Test Orch Broker (8047)
curl http://localhost:8047/health

# Test Kafka (9047)
nc -zv localhost 9047

# Test PostgreSQL (5447)
psql -h localhost -p 5447 -U postgres -d orchiodb
```
