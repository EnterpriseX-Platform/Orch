# Orch - Orchestration Platform - Agent Guide

## Project Overview

Orch is an **Orchestration Platform** that provides a unified platform for designing, deploying, and managing data pipelines, API integrations, and workflow automations with a high-performance execution engine.

### Key Features
- **Data Catalog**: Register and manage datasets with schema definitions (supports hierarchical parent-child relationships)
- **API Registration**: Register APIs with endpoint configuration, authentication, and audit settings
- **Flow Integration Builder**: Visual drag-and-drop workflow designer using ReactFlow with gateway-specific nodes
- **Orch Broker**: High-performance Rust-based broker (Axum) for flow execution with route filtering and Kafka integration
- **Audit Trail**: Complete logging of all API requests with search and export capabilities

### System Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Orch (Next.js) │────▶│  Orch Broker    │
│   Web UI + API  │     │     (Rust)      │
└─────────────────┘     └────────┬────────┘
       Port: 3047                │
       Base: /orch      ┌────────┼────────┐
                        ▼        ▼        ▼
                  ┌─────────┐ ┌─────────┐ ┌─────────┐
                  │  Kafka  │ │PostgreSQL│ │Pipeline │
                  │ :9047   │ │ :5447   │ │ Engine  │
                  └─────────┘ └─────────┘ └─────────┘
```

## Technology Stack

| Component | Technology | Purpose | Port |
|-----------|------------|---------|------|
| Orch Web (Main App) | Next.js 16.1.6 + React 19 + TypeScript | Web UI + Orchestration Engine | 3047 |
| Orch Broker | Rust + Axum 0.7 | Flow Execution Engine | 8047 |
| Database | PostgreSQL 15 | Primary data store | 5447 |
| Message Queue | Apache Kafka 7.5 (Confluent) | Event streaming | 9047 |
| Kafka UI | provectuslabs/kafka-ui | Kafka management | 9048 |
| Styling | Tailwind CSS 4 + MUI 7 | CSS framework | - |
| State Management | Zustand 5 | Global state with persistence | - |
| Data Fetching | TanStack Query 5 | Server state management | - |
| Forms | React Hook Form + Zod 4 | Form handling & validation | - |
| Database ORM | Prisma 6 | Database access | - |
| Flow Editor | ReactFlow 12 (@xyflow/react) | Visual workflow builder | - |

## Project Structure

```
orch/                                   # Monorepo Root (Turborepo + PNPM)
├── apps/
│   ├── web/                            # Next.js 16 Application (Port 3047)
│   │   ├── app/                        # App Router
│   │   │   ├── (dashboard)/            # Dashboard pages with shared layout
│   │   │   │   ├── registrations/      # API Registration management
│   │   │   │   ├── datasets/           # Data Catalog management
│   │   │   │   ├── flows/              # Flow Integration Builder
│   │   │   │   │   ├── builder/[[...id]]/  # Flow editor with ReactFlow
│   │   │   │   ├── audit/              # Audit Trail views
│   │   │   │   ├── logs/               # API Logs
│   │   │   │   └── dashboard/          # Dashboard page
│   │   │   ├── api/                    # API Routes (Next.js Route Handlers)
│   │   │   │   ├── datasets/           # Data Catalog CRUD API
│   │   │   │   ├── registers/          # API Registration CRUD API
│   │   │   │   ├── flows/              # Flow CRUD API
│   │   │   │   ├── audit/              # Audit Trail API
│   │   │   │   ├── logs/               # API Logs API
│   │   │   │   └── health/             # Health check endpoint
│   │   │   ├── layout.tsx              # Root layout
│   │   │   ├── page.tsx                # Home (redirects to /dashboard)
│   │   │   ├── globals.css             # Global styles
│   │   │   └── providers.tsx           # App providers (React Query, etc.)
│   │   ├── components/
│   │   │   ├── ui/                     # shadcn/ui components
│   │   │   ├── layout/                 # Layout components (Sidebar, Header)
│   │   │   └── flow/                   # Flow editor node components
│   │   ├── lib/
│   │   │   ├── api.ts                  # API client with all endpoint methods
│   │   │   ├── prisma.ts               # Prisma client singleton
│   │   │   ├── utils.ts                # Utility functions
│   │   │   └── theme.ts                # MUI theme config
│   │   ├── stores/
│   │   │   └── authStore.ts            # Zustand auth store with persistence
│   │   ├── types/
│   │   │   ├── index.ts                # TypeScript type definitions
│   │   │   └── audit.ts                # Audit-related types
│   │   ├── prisma/
│   │   │   ├── schema.prisma           # Database schema
│   │   │   └── migrations/             # Database migrations (SQL files)
│   │   ├── hooks/                      # Custom React hooks
│   │   ├── public/                     # Static assets
│   │   ├── next.config.ts              # Next.js config (basePath: /orch)
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   └── orch-broker/                    # Rust Orch Broker (Port 8047)
│       ├── src/
│       │   ├── main.rs                 # Entry point - Axum router setup
│       │   ├── config/
│       │   │   └── mod.rs              # Flow cache, config constants, NodeType enum
│       │   ├── handlers/
│       │   │   ├── deploy.rs           # Deploy/undeploy/list flows
│       │   │   ├── execute.rs          # Execute flows (sync/async)
│       │   │   └── mod.rs
│       │   ├── middleware/
│       │   │   ├── audit.rs            # Audit logging middleware
│       │   │   ├── auth.rs             # JWT auth middleware
│       │   │   └── mod.rs
│       │   ├── middlewares/
│       │   │   ├── logging.rs          # Request logging middleware
│       │   │   └── mod.rs
│       │   ├── models/
│       │   │   └── mod.rs              # Data models (AuditEvent, etc.)
│       │   ├── services/
│       │   │   ├── flow_executor.rs    # Flow execution logic
│       │   │   ├── kafka.rs            # Kafka producer service
│       │   │   ├── route_cache.rs      # Route caching
│       │   │   ├── xpath_extractor.rs  # XPath extraction utility
│       │   │   └── mod.rs
│       │   └── utils/
│       │       └── mod.rs              # General utilities
│       ├── Cargo.toml
│       └── Dockerfile
│
├── packages/
│   └── sdk/                           # Shared TypeScript SDK (@orch/sdk)
│
├── scripts/                            # Shell scripts
│   ├── test.sh                         # Run test environment (Docker)
│   ├── start-local.sh                  # Start local dev mode (fast)
│   └── stop-local.sh                   # Stop local dev mode
│
├── package.json                        # Root package.json (Turborepo)
├── pnpm-workspace.yaml                 # PNPM workspace config
├── turbo.json                          # Turborepo config
└── docker-compose.yml                  # All-in-one local stack
```

## Build and Run Commands

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ and PNPM 9+ (for local development)
- Rust 1.75+ (for Orch Broker development)

### Quick Start (Test Environment)

```bash
# Run the test environment (builds and starts all services)
./scripts/test.sh

# Access URLs:
# - Orch Web UI:  http://localhost:3047/orch
# - Orch Web API: http://localhost:3047/orch/api
# - Kafka UI:    http://localhost:9048
# - PostgreSQL:  localhost:5447
```

### Local Development Mode (Fastest)

```bash
# Start infrastructure + Next.js dev server
./scripts/start-local.sh

# Stop local development
./scripts/stop-local.sh
```

This mode:
- Runs PostgreSQL, Kafka, Zookeeper in Docker
- Runs Next.js dev server locally with hot reload
- No Docker build required (10-15 seconds vs 2-3 minutes)

### Manual Commands

```bash
# Start infrastructure only
docker compose up -d postgres kafka zookeeper kafka-ui

# Setup database (first time)
cd apps/web
npx prisma migrate deploy
npx prisma generate

# Run Orch Web (Next.js)
cd apps/web
npm install
npm run dev -- -p 3047

# Run Orch Broker (Rust)
cd apps/orch-broker
cargo run
```

### Root Package Scripts

```bash
pnpm dev              # Run all dev servers (via Turbo)
pnpm dev:web          # Run only web dev server
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm test             # Run all tests
pnpm db:migrate       # Run database migrations
pnpm db:generate      # Generate Prisma client
pnpm db:studio        # Open Prisma Studio
pnpm start:infra      # Start infrastructure services
pnpm stop:infra       # Stop infrastructure services
```

## Environment Variables

### Orch Web (apps/web/.env)
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5447/orchiodb
ORCH_BROKER_URL=http://localhost:8047
NEXT_PUBLIC_API_BASE_URL=/orch/api
```

### Orch Broker (apps/orch-broker/src/config/mod.rs)
```rust
pub const GATEWAY_PORT: u16 = 8047;
// DATABASE_URL from env or default: "postgresql://postgres:postgres@localhost:5447/orchiodb"
// KAFKA_BROKERS from env or default: "localhost:9047"
```

## Database Schema (Prisma)

### Core Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `User` | Authentication | id, username, email, passwordHash, roles |
| `DataCatalog` | Data catalog (datasets) | id, name, source, category, schema (JSON), parentId (hierarchical) |
| `ApiRegistration` | API endpoints | id, endpoint, method, backendUrl, authType, auditEnabled, flowId |
| `FlowIntegration` | Workflow definitions | id, triggerType, executionMode, nodes (JSON), edges (JSON), isActive |
| `FlowExecution` | Execution logs | id, flowId, status, inputData, outputData, duration |
| `ApiLog` | API access logs | id, requestId, apiId, userId, method, path, duration, partitionKey |
| `AuditLog` | Data change logs | id, action, entityType, entityId, changes |
| `SystemConfig` | System settings | id, key, value (JSON) |

### Enums
- `DataCategory`: TRANSACTIONAL, RESERVED, TRANSFER, PERFORMANCE, EXPENDITURE, PROCUREMENT, MASTER_DATA, OTHER
- `HttpMethod`: GET, POST, PUT, PATCH, DELETE
- `AuthType`: NONE, JWT, API_KEY, OAUTH2
- `TriggerType`: HTTP, KAFKA_CONSUMER, SCHEDULER, WEBHOOK, MESSAGE_QUEUE
- `FlowCategory`: API_GATEWAY, CONSUMER, HYBRID
- `ExecutionMode`: SYNC, ASYNC
- `ExecutionStatus`: PENDING, RUNNING, SUCCESS, FAILED, PARTIAL
- `AuditAction`: CREATE, UPDATE, DELETE, LOGIN, LOGOUT, VIEW, EXPORT, APPROVE, REJECT

## API Endpoints

### Orch Web Internal API (Base Path: /orch/api)

**Data Catalog:**
- `GET /api/datasets` - List datasets (supports `?tree=true` for hierarchical)
- `POST /api/datasets` - Create dataset
- `GET /api/datasets/:id` - Get dataset
- `PUT /api/datasets/:id` - Update dataset
- `DELETE /api/datasets/:id` - Delete dataset

**API Registration:**
- `GET /api/registers` - List APIs
- `POST /api/registers` - Register API
- `GET /api/registers/:id` - Get API
- `PUT /api/registers/:id` - Update API
- `DELETE /api/registers/:id` - Delete API

**Flow Integration:**
- `GET /api/flows` - List flows
- `POST /api/flows` - Create flow
- `GET /api/flows/:id` - Get flow
- `PUT /api/flows/:id` - Update flow
- `DELETE /api/flows/:id` - Delete flow
- `POST /api/flows/:id/deploy` - Deploy flow to gateway
- `GET /api/flows/types` - Get available flow types

**Logs & Audit:**
- `GET /api/logs` - API access logs
- `GET /api/audit` - Audit trail
- `GET /api/dashboard` - Dashboard statistics

**Health:**
- `GET /api/health` - Health check

### Orch Broker (Port 8047)

**Deploy Endpoints (from Orch Web):**
- `GET /deploy/flows` - List deployed flows
- `POST /deploy/flows/:id` - Deploy flow
- `GET /deploy/flows/:id` - Get deployed flow
- `DELETE /deploy/flows/:id` - Undeploy flow

**Execute Endpoints (from Clients):**
- `ANY /api/v1/*path` - Execute flow by path matching

**Health:**
- `GET /health` - Health check

## Flow Execution Architecture

### Broker Flow Nodes

The Orch Broker supports these node types for flow execution:

**Trigger Nodes:**
- `httpRequest` - Receive HTTP request from client
- `webhookTrigger` - Receive webhook from external systems

**Process Nodes:**
- `appEventLog` - Log application events
- `auditTrail` - Record audit logs to PostgreSQL
- `callService` - Call backend services

**Output Nodes:**
- `httpResponse` - Send HTTP response to client
- `pushToKafka` - Send events to Kafka topic
- `end` - Terminate flow execution

### Execution Modes

1. **SYNC (Synchronous)**: Real-time processing, returns response immediately
2. **ASYNC (Asynchronous)**: Queue via Kafka, returns 202 Accepted with request_id

### Flow Execution Flow

```
1. Client ──▶ Orch Broker (8047)
                    │
                    ▼
2. Broker ──▶ Match Route ──▶ Load Flow Config (from memory cache)
                    │
                    ▼
3. Broker ──▶ Execute Flow Nodes:
   - httpRequest:  Parse incoming request
   - auditTrail:   Log to PostgreSQL:5447
   - callService:  Call backend API
   - pushToKafka:  Send event to Kafka:9047
   - httpResponse: Return to client
                    │
                    ▼
4. Broker ──▶ Response to Client
```

### Deploy Flow

```
Orch Web:3047 ──POST /api/flows/:id/deploy──▶ Broker:8047/deploy/flows/:id
                                                  │
                                                  ▼ Store in Memory
                                             ┌────────────┐
                                             │ Flow Cache │
                                             │ (RwLock<HashMap>)
                                             └────────────┘
```

## Code Style Guidelines

### TypeScript/React (apps/web)

**Naming Conventions:**
- Components: `PascalCase` (e.g., `Sidebar.tsx`, `FlowBuilder.tsx`)
- Hooks: `camelCase` starting with `use` (e.g., `useAuth.ts`)
- Types/Interfaces: `PascalCase` (e.g., `ApiRegistration`, `FlowNode`)
- Functions/Variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

**File Organization:**
- Use `@/` alias for imports from source directory
- Co-locate related files (component + styles + tests)
- API routes use Next.js Route Handlers pattern

**Form Handling:**
- Use React Hook Form for form state management
- Use Zod for schema validation
- Example:
```typescript
const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
})
```

**API Client Pattern:**
```typescript
// lib/api.ts
export const apiClient = new ApiClient()
export const datasetApi = {
  list: (params) => apiClient.get('/datasets', params),
  create: (data) => apiClient.post('/datasets', data),
}
```

**State Management:**
- Use Zustand for global state with persistence
- Auth store persists to localStorage
- Use TanStack Query for server state

### Rust (apps/orch-broker)

**Naming Conventions:**
- Types: `PascalCase` (e.g., `FlowConfig`, `NodeType`)
- Functions/Variables: `snake_case` (e.g., `deploy_flow`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `GATEWAY_PORT`)
- Modules: Each folder has `mod.rs` as entry point

**Error Handling:**
- Use `anyhow` for application errors
- Use `thiserror` for library errors
- All handlers are async using `tokio`

**Example Handler Structure:**
```rust
pub async fn deploy_flow(
    State(state): State<Arc<AppState>>,
    Path(flow_id): Path<String>,
    Json(request): Json<DeployFlowRequest>,
) -> Result<Json<DeployFlowResponse>, StatusCode> {
    // Implementation
}
```

### Prisma Schema

**Naming Conventions:**
- Model names: `PascalCase`
- Field names: `camelCase`
- Map to snake_case for database: `@map("field_name")`
- Enum names: `PascalCase`
- Enum values: `SCREAMING_SNAKE_CASE` with `@map("lowercase")`

### SQL (migrations)

**Style:**
- Keywords: UPPERCASE (`CREATE TABLE`, `SELECT`)
- Identifiers: `snake_case`
- Include `IF EXISTS` / `IF NOT EXISTS` for idempotency

## Testing

### Rust
```bash
cd apps/orch-broker
cargo test
```

### Node.js
Currently minimal test coverage. Tests can be added:
```bash
cd apps/web
npm test
```

## Base Path Configuration

The Orch Web application runs under base path `/orch`:
- Frontend: `http://localhost:3047/orch`
- API: `http://localhost:3047/orch/api/*`
- Configured in `next.config.ts`: `basePath: '/orch'`

## Security Considerations

1. **Authentication**: JWT-based with access tokens (stored in Zustand + localStorage)
2. **Password Hashing**: bcrypt (in Orch Broker)
3. **CORS**: Configured as permissive in development (`CorsLayer::permissive()`)
4. **Input Validation**: Zod schemas (frontend), manual validation (backend)
5. **SQL Injection Prevention**: Prisma ORM

### Production Checklist

1. Change default `JWT_SECRET` to cryptographically secure random string
2. Change default admin password
3. Configure specific CORS origins (remove permissive mode)
4. Enable TLS/SSL for all services
5. Configure PostgreSQL SSL connections
6. Set up Kafka security (SASL/SSL)
7. Enable audit event partitioning
8. Configure log aggregation

## Troubleshooting

**PostgreSQL connection refused:**
- Check if postgres container is running: `docker-compose ps`
- Verify `DATABASE_URL` host matches (use `localhost` for local dev, `postgres` for Docker)

**Kafka connection errors:**
- Ensure zookeeper starts before kafka
- Check `KAFKA_ADVERTISED_LISTENERS` is accessible from host

**Prisma Client errors:**
- Regenerate client: `npx prisma generate`
- Check migration status: `npx prisma migrate status`

**Rust build failures:**
- Update Rust: `rustup update`
- Clean build: `cargo clean && cargo build`
- Check musl target for Alpine: `rustup target add x86_64-unknown-linux-musl`

**Port already in use:**
- Check what's using the port: `lsof -i :3047`
- Kill process or change port in config

## Common Development Tasks

### Add a New API Endpoint

1. Add route handler in `apps/web/app/api/{resource}/route.ts`
2. Create page component in `apps/web/app/(dashboard)/{resource}/page.tsx`
3. Add navigation link in `apps/web/components/layout/Sidebar.tsx`
4. Add API client methods in `apps/web/lib/api.ts`

### Modify Database Schema

1. Edit `apps/web/prisma/schema.prisma`
2. Run migration:
   ```bash
   cd apps/web
   npx prisma migrate dev --name {description}
   npx prisma generate
   ```

### Deploy Flow to Broker

1. Create/edit flow in the Orch Web UI at `/orch/flows`
2. Click "Deploy" button
3. Orch Web sends POST to Broker at `/deploy/flows/:id`
4. Broker stores flow config in memory cache (`Arc<RwLock<HashMap>>`)

## Language Notes

The project uses English throughout:
- Code, comments, and technical documentation: English
- User-facing text and labels: English
- Validation messages in Zod schemas: English
