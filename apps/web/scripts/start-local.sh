#!/bin/bash

# ==========================================
# Local Development Mode
# Fast start without Docker build
# ==========================================

set -e

echo "🚀 Starting Local Development Mode..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to kill process on port
kill_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "  Stopping process on port $1..."
        kill $(lsof -Pi :$1 -sTCP:LISTEN -t) 2>/dev/null || true
        sleep 1
    fi
}

echo "${BLUE}Step 1: Starting Infrastructure (Docker)${NC}"
echo "  - PostgreSQL (Port 5447)"
echo "  - Kafka (Port 9047)"
echo ""

# Only start infra services in Docker
docker compose up -d postgres kafka zookeeper 2>&1 | grep -v "version is obsolete" || true

echo "  ⏳ Waiting for PostgreSQL..."
until docker exec orchio-postgres pg_isready -U postgres >/dev/null 2>&1; do
    sleep 1
done
echo "  ${GREEN}✓ PostgreSQL ready${NC}"

echo "  ⏳ Waiting for Kafka..."
sleep 3
echo "  ${GREEN}✓ Kafka ready${NC}"

echo ""
echo "${BLUE}Step 2: Setup Database${NC}"
cd apps/web

if [ ! -d "node_modules" ]; then
    echo "  📦 Installing dependencies..."
    npm install
fi

echo "  🔄 Running Prisma migrations..."
npx prisma migrate dev --name init --skip-generate 2>/dev/null || npx prisma migrate deploy
npx prisma generate

echo ""
echo "${BLUE}Step 3: Start Orch (Next.js)${NC}"
echo "  🌐 URL: http://localhost:3047/orch"
echo ""
echo "  ${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Set environment variables for local dev
export PORT=3047
export DATABASE_URL=postgresql://postgres:postgres@localhost:5447/orchiodb
export NEXT_PUBLIC_API_BASE_URL=/orch/api
export JWT_SECRET=local-dev-secret
export KAFKA_BROKERS=localhost:9047

# Start Next.js dev server
npm run dev -- -p 3047
