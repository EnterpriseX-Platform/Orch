# Orch Web

The Orch web application — a Next.js + Prisma front end and API layer for the Orch orchestration platform. It provides the UI for managing data catalogs, API registrations, and integration flows, plus an internal API backed by PostgreSQL.

## Project Structure

```
apps/web/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Dashboard layout group
│   │   ├── layout.tsx            # Dashboard layout with sidebar
│   │   ├── dashboard/            # Dashboard monitor
│   │   ├── datasets/             # Data Catalog (datasets)
│   │   ├── apis/                 # API registration
│   │   ├── flows/                # Flow integration
│   │   ├── logs/                 # API logs
│   │   └── audit/                # Audit trail
│   ├── api/                      # API routes (backend API)
│   │   ├── datasets/             # Data Catalog CRUD
│   │   ├── apis/                 # API registration CRUD
│   │   ├── flows/                # Flow CRUD + types
│   │   ├── logs/                 # Query API logs
│   │   ├── audit/                # Query audit trail
│   │   └── dashboard/            # Dashboard statistics
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home (redirects to dashboard)
│   ├── providers.tsx             # React Query + toast provider
│   └── globals.css               # Global styles
├── components/                   # React components
│   ├── ui/                       # shadcn/ui components
│   └── layout/                   # Layout components
├── lib/                          # Utilities
│   ├── prisma.ts                 # Prisma client
│   ├── api.ts                    # API client
│   └── utils.ts                  # Helper functions
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── migrations/               # Database migrations
├── stores/                       # Zustand stores
│   └── authStore.ts              # Authentication state
├── types/                        # TypeScript types
│   └── index.ts                  # Type definitions
└── public/                       # Static assets
```

## Key Features

### 1. Data Catalog
- Create, edit, and delete datasets
- Organize datasets into categories (e.g. transactional, master data, operational, other)
- Define a JSON Schema and sample data for each dataset

### 2. API Registration
- Register API endpoints that expose registered data
- Support all common HTTP methods: GET, POST, PUT, PATCH, DELETE
- Configure a backend URL (proxy to the upstream service)
- Configure authentication: JWT, API Key, OAuth2
- Set rate limits
- Enable or disable the audit trail per endpoint

### 3. Flow Integration (multiple types)
Choose from several flow types:
- **Audit Trail** — record activity to the database
- **Event Stream** — publish events to Kafka
- **Data Transform** — transform data according to a schema
- **Webhook** — call an outbound HTTP webhook
- **Notification** — send notifications (email, chat, etc.)
- **Custom** — build your own

### 4. API Logs
- View all API call logs
- Filter by method, status, and date range
- Export to CSV/Excel

### 5. Audit Trail
- Record data changes (CREATE, UPDATE, DELETE)
- Record login/logout events
- Browse historical change records
- Export reports

### 6. Dashboard Monitor
- API usage statistics
- Historical request charts
- Top APIs by call volume
- Error rate and response time

## Getting Started

### 1. Install Dependencies
```bash
cd apps/web
npm install
```

### 2. Configure the Database
```bash
# Create the .env file
cp .env.example .env

# Edit DATABASE_URL in .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5447/orchiodb"

# Run migrations
npx prisma migrate dev --name init
```

### 3. Generate the Prisma Client
```bash
npx prisma generate
```

### 4. Run the Development Server
```bash
npm run dev
```

Then open: http://localhost:3047/orch

## Integration with the Orch Broker (Rust)

The Orch Broker is responsible for:
1. Receiving requests from clients
2. Validating the JWT token
3. Forwarding to the backend (the Next.js API)
4. Executing the configured flow
5. Recording the audit trail

Request path:
```
Client → Orch Broker (Rust) → Next.js API → PostgreSQL
                                    ↓
                                 Kafka (Events)
```

## Database Schema

### Core Tables
- `users` — user accounts
- `data_catalogs` — datasets (Data Catalog)
- `api_registrations` — registered APIs
- `flow_integrations` — flow integrations
- `flow_executions` — flow execution history
- `api_logs` — API call logs
- `audit_logs` — audit trail

## API Endpoints

### Data Catalog
- `GET /api/datasets` — list datasets
- `POST /api/datasets` — create a dataset
- `GET /api/datasets/:id` — get details
- `PUT /api/datasets/:id` — update
- `DELETE /api/datasets/:id` — delete

### API Registration
- `GET /api/registers` — list APIs
- `POST /api/registers` — register an API
- `GET /api/registers/:id` — get details
- `PUT /api/registers/:id` — update
- `DELETE /api/registers/:id` — delete

### Flow Integration
- `GET /api/flows` — list flows
- `POST /api/flows` — create a flow
- `GET /api/flows/:id` — get details
- `PUT /api/flows/:id` — update
- `DELETE /api/flows/:id` — delete
- `GET /api/flows/types` — list supported flow types

### Logs & Audit
- `GET /api/logs` — API logs
- `GET /api/audit` — audit trail
- `GET /api/dashboard` — dashboard statistics
