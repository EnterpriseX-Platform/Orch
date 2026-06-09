# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Local development (fastest: Docker infra + local Next.js with hot reload)
apps/web/scripts/start-local.sh
apps/web/scripts/stop-local.sh

# Full Docker test environment (all services containerized)
apps/web/scripts/test.sh

# Turborepo commands (from root)
pnpm dev              # All dev servers
pnpm dev:web          # Next.js only
pnpm dev:broker       # Rust broker only
pnpm build            # Build all (SDK builds before web)
pnpm lint             # Lint all (ESLint)
pnpm test             # turbo test — but only the broker has tests (see "Tests & CI")

# Database (Prisma)
pnpm db:migrate       # Apply migrations (prisma migrate deploy)
pnpm db:generate      # Generate Prisma client
pnpm db:studio        # Open Prisma Studio

# Create new migration
cd apps/web && npx prisma migrate dev --name <description>

# Infrastructure only (PostgreSQL, Kafka, Zookeeper, Kafka UI)
pnpm start:infra
pnpm stop:infra

# Rust broker (run / test all / single test)
cd apps/orch-broker && cargo run
cd apps/orch-broker && cargo test
cd apps/orch-broker && cargo test <test_name>

# SDK — rebuild when its source changes; web imports the compiled dist/
cd packages/sdk && pnpm build
```

Note: `pnpm start` / `pnpm stop` run the full Docker stack (`docker compose up --build -d` / `docker compose down`). The granular dev scripts (`start-local.sh`, `stop-local.sh`, `test.sh`, …) live in `apps/web/scripts/`, not at the repo root.

### Tests & CI

- **The web app has no automated test suite** — `pnpm test` is effectively a no-op for it. The real tests live in the Rust broker: `cd apps/orch-broker && cargo test` (single test: `cargo test <name>`). When verifying a web change, rely on `pnpm lint` + `pnpm build` (which type-checks).
- **What CI enforces** (`.github/workflows/ci.yml`) — run these locally before pushing:
  - Web: `pnpm db:generate` → `pnpm lint` → `pnpm build`
  - Broker: `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings` (**warnings fail the build**), `cargo build --release`, `cargo test --release`
  - A Trivy filesystem security scan
- CI runs on `master`, `main`, and `develop` (this repo's default branch is `master`). Both `ci.yml` and `docker-build.yml` include `master` in their triggers. (Note: changing the default branch to `main` needs repo-admin access, which the maintainer account lacks — hence `master` stays default and is wired into CI directly.)

## Architecture Overview

Monorepo (Turborepo + PNPM) with two apps and a shared SDK.

**apps/web** (package: `orch-web`) — Next.js 16 (App Router) on port 3047, base path `/orch`
- Web UI for managing data catalogs, API registrations, flow integrations, audit trails
- API routes under `app/api/` serve as backend (Prisma + PostgreSQL on port 5447)
- Dashboard pages under `app/(dashboard)/` with shared layout
- Gateway proxy at `app/api/v1/[[...path]]/route.ts` forwards requests to broker (caches API registrations with 60s TTL, injects `X-Request-Id`, `X-API-Id`, `X-Flow-Id` headers)
- Output mode: `standalone`; Turbopack `root` is `../../` so workspace packages resolve in dev (`next.config.ts`)

**apps/orch-broker** — Rust/Axum Broker on port 8047
- Executes deployed flows, matches routes, integrates with Kafka (`kafka:9092` in-cluster)
- AppState holds: ApiRegistry, ConfigManager, FlowExecutor, FlowExecutorSdk, NodeRegistry, KafkaProducer, HttpClient, WorkerManager
- Flows stored in memory cache (`DashMap` concurrent hashmap)
- **The live executor is `services/flow_executor_sdk.rs`** (mirrors the TS SDK node definitions in `sdk/`). The older `services/flow_executor.rs` is now just a data-context struct — its node executor was removed; don't add node logic there.
- **3-level routing** (`routes/execute.rs` + `services/api_resolver.rs`): (1) request matches a registered API → full flow runs; (2) else matches a project `pathPrefix` → validate + passthrough proxy; (3) else global `DEFAULT_BACKEND_URL` fallback. Patterns support exact / `:param` / `*`.
- **Execution strategies**: `Fast` (all sync, in-memory), `Reliable` (async via Kafka worker queue), `Custom` (per-node `executionMode`). The in-process `WorkerConsumer` runs async jobs; standalone external workers are scaffolding (Phase 2).
- Client-facing routes in `routes/`; deploy/admin handlers in `handlers/`
- Deploy via Orch Web UI → POST to broker `/deploy/flows/:id`
- Error handling: `AppError` enum (NotFound, BadRequest, InternalServerError, ServiceUnavailable) implementing Axum's `IntoResponse`

**packages/sdk** — Shared TypeScript SDK (`@orch/sdk`)
- `NodeRegistry` + `registerBuiltins()` for node type registration
- Node categories: `trigger`, `extract`, `integration`, `action`, `output`
- Exports: `NodeMetadata`, `NodeTypeDefinition`, `FlowNode`, `FlowEdge`, `FlowDefinition`, `OrchClient`
- Built with `tsup` to `dist/` (cjs + esm + dts). The web app imports the built output — rebuild after editing SDK sources, or `pnpm build` from root.
- **SDK ↔ broker drift (gotcha):** the FlowBuilder palette comes from the SDK's ~20 builtins, but the broker registers ~23 handlers (`apps/orch-broker/src/sdk/registry.rs`). The broker splits `pubsub` into `pub`/`sub` and adds `decision`/`switch` (not in the SDK palette); the SDK's single `pubsub` has no broker handler. When adding/renaming a node, update **both** sides or a deployed node won't resolve.

### Data Flow
Client → Next.js gateway (`/orch/api/v1/*`) → Broker (8047) → route match → execute flow nodes (extract, transform, proxy, audit, Kafka) → response

- **Multiple APIs can share one URL** — the gateway resolves which `MessageFormat` applies via a ladder: request-body discriminator → header → screen-button detection rule → lone format → `isDefault`. See `app/api/v1/[[...path]]/route.ts` (`resolveMessageFormat`) + `lib/format-resolver.ts`.
- **Audit is written in TWO places**: the broker `audit` node (for flows; sets `X-Orch-Audit: node`) AND a gateway fallback writer (for proxy / Level-1 paths with no flow). When changing audit capture, update both.

### Key Infrastructure
- PostgreSQL: host port 5447, DB name `orchiodb`
- Kafka: `kafka:9092` in-cluster (host `localhost:29092` via the EXTERNAL listener), UI on port 9048, pre-created topics: `audit-logs`, `event-logs`
- Default `DATABASE_URL`: `postgresql://postgres:postgres@localhost:5447/orchiodb`
- Cross-service env the code actually reads: web → broker via `ORCH_BROKER_URL`; broker → web config via `API_BASE_URL` (include the `/orch` base path)

### Running locally
The whole stack runs from source with one command:

```bash
docker compose up --build      # then open http://localhost:3047/orch
```

`docker-compose.yml` brings up PostgreSQL, Zookeeper, Kafka, Kafka UI, a one-shot Prisma `migrate` step, the Next.js web app, and the Rust broker. Override `JWT_SECRET` via env or a `.env` file (defaults to `change-me-in-production`).

## Code Conventions

- **Imports**: Use `@/` alias for source directory imports in the web app
- **UI components**: shadcn/ui (`components/ui/`) + MUI 7 + Tailwind CSS 4; icons from `lucide-react`; toasts via `sonner`; tables via `ag-grid`; charts via `recharts`
- **Forms**: React Hook Form + Zod validation; user-facing validation messages in English
- **State**: Zustand (global/auth with localStorage persistence via `auth-storage` key) + TanStack Query (server state, 1-minute staleTime)
- **Auth flow**: JWT login → `accessToken` stored in Zustand → auto-injected via `ApiClient` singleton in `lib/api.ts`
- **Flow editor**: ReactFlow (@xyflow/react) with SDK-defined node types registered via `NodeRegistry`
- **IDs**: CUID format via `@paralleldrive/cuid2` for all model primary keys
- **Prisma schema**: camelCase fields mapped to snake_case in DB via `@map()` (~700 lines)
- **Rust**: `anyhow` for app errors, `thiserror` for library errors, async handlers with `tokio`; Kafka via `rdkafka` (dynamic-linking); XPath via `sxd-xpath`; DB via `sqlx` (not Prisma)
- **Language**: Code, comments, and user-facing text are all in English (date/number formatting helpers live in `lib/utils.ts`)

## Key Files

- `apps/web/prisma/schema.prisma` — Full database schema (all models, enums, relations)
- `apps/web/lib/api.ts` — API client singleton with auth token injection and all endpoint methods
- `apps/web/lib/utils.ts` — Formatting, validation, file helpers (~250 lines)
- `apps/web/stores/authStore.ts` — JWT auth store (Zustand + localStorage)
- `apps/web/middleware.ts` — Next.js middleware (basePath / auth)
- `apps/web/app/providers.tsx` — App-wide providers (React Query, Auth, etc.)
- `apps/web/app/api/v1/[[...path]]/route.ts` — Gateway proxy to Orch Broker
- `apps/web/scripts/` — Dev scripts: `start-local.sh`, `stop-local.sh`, `test.sh`, `dev.sh`, `restart.sh`, `mock-backend.js`, `seed-test.ts` (note: not at repo root)
- `apps/orch-broker/src/main.rs` — Broker entry point, Axum router & AppState
- `apps/orch-broker/src/services/flow_executor_sdk.rs` — Live SDK-based flow executor (the one to edit)
- `apps/orch-broker/src/sdk/` — Node handlers + registry (23 handlers); mirrors `@orch/sdk` builtins
- `apps/orch-broker/src/config/mod.rs` — Flow cache, legacy NodeType enum (13 variants), route config
- `apps/orch-broker/src/error.rs` — AppError enum
- `docker-compose.yml` — all-in-one local stack (Postgres, Kafka, migrate, web, broker)
- `docs/ARCHITECTURE.md`, `docs/PORTS.md`, `docs/CONFIG_CONCEPT.md` — Architecture deep-dives
- `AGENTS.md` — Detailed agent guide with full project structure, API endpoints, and database schema
