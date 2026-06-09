#!/bin/bash

# ==========================================
# Test Script - Orch
# ==========================================

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Orch - Test Environment                   ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Starting services...                                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to wait for service
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=1
    
    echo -n "Waiting for $name..."
    while ! curl -s "$url" > /dev/null 2>&1; do
        if [ $attempt -eq $max_attempts ]; then
            echo " FAILED"
            echo "Service $name did not start"
            exit 1
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    echo " ${GREEN}OK${NC}"
}

# Stop existing containers
echo "Stopping existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true

# Build and start services
echo ""
echo "Building and starting services..."
docker-compose up --build -d

echo ""
echo "Waiting for services to be ready..."
echo ""

# Wait for PostgreSQL
echo -n "⏳ PostgreSQL (Port 5447)..."
until docker exec orchio-postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo -n "."
    sleep 2
done
echo " ${GREEN}OK${NC}"

# Wait for Orch
wait_for_service "http://localhost:3047/orch/api/health" "Orch (Port 3047)"

# Wait for Kafka
echo -n "⏳ Kafka (Port 9047)..."
sleep 5
until docker exec orchio-kafka kafka-broker-api-versions --bootstrap-server localhost:9092 > /dev/null 2>&1; do
    echo -n "."
    sleep 3
done
echo " ${GREEN}OK${NC}"

# Wait for Kafka UI
wait_for_service "http://localhost:9048" "Kafka UI (Port 9048)"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ All services are running!                                ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  🌐 Orch Frontend: http://localhost:3047/orch             ║"
echo "║  🔌 API Endpoint:   http://localhost:3047/orch/api           ║"
echo "║  🗄️  PostgreSQL:     localhost:5447                          ║"
echo "║  📨 Kafka:          localhost:9047                          ║"
echo "║  🖥️  Kafka UI:       http://localhost:9048                   ║"
echo "║                                                              ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Commands:                                                   ║"
echo "║    docker-compose logs -f         ║"
echo "║    docker-compose down            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Test endpoints
echo "Testing endpoints..."
echo ""

echo "1. Testing Orch Health:"
curl -s http://localhost:3047/orch/api/health 2>/dev/null || echo "  (Health endpoint not configured yet)"

echo ""
echo "2. Testing Database connection:"
docker exec orchio-postgres psql -U postgres -d orchiodb -c "SELECT version();" 2>/dev/null | head -3 || echo "  (Database initializing)"

echo ""
echo "${GREEN}✅ Test environment is ready!${NC}"
echo ""
echo "Open: ${BLUE}http://localhost:3047/orch${NC}"
echo ""
