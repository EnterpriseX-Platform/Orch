# Local Development Mode

Running locally is much faster than a Docker build (no need to rebuild the image every time).

## How much faster?

| Method | Time |
|------|------|
| Docker Build | 2-3 minutes |
| **Local Dev** | **10-15 seconds** |

## How to use

### 1. Start Infrastructure (Docker)
```bash
# Run only the Database + Kafka (no need to build the Orch web app)
docker compose up -d postgres kafka zookeeper kafka-ui
```

### 2. Setup Database (first time only)
```bash
cd apps/web
npx prisma migrate deploy
npx prisma generate
```

### 3. Start Next.js Dev Server
```bash
cd apps/web
npm run dev -- -p 3047
```

Or use the **ready-made script**:
```bash
./scripts/start-local.sh
```

## URLs

| Service | URL |
|---------|-----|
| Orch (Next.js) | http://localhost:3047/orch |
| Kafka UI | http://localhost:9048 |
| PostgreSQL | localhost:5447 |

## Stopping

```bash
./scripts/stop-local.sh
```

Or manually:
```bash
# Stop Next.js: Ctrl+C

# Stop Docker
docker compose down
```

## Hot Reload

When running in Local Dev mode:
- Edit code -> the web page updates **instantly**
- No rebuild required
- No waiting on Docker

## Environment Variables

Set these in `apps/web/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5447/orchiodb
ORCH_BROKER_URL=http://localhost:8047
NEXT_PUBLIC_API_BASE_URL=/orch/api
```
