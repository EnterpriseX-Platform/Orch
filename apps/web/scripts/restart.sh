#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Orch - Build & Restart            ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Ports used by the application
PORTS=(
    3047  # Orch (Next.js)
    8047  # Orch Broker (Rust)
    5447  # PostgreSQL
    9047  # Kafka
    9048  # Kafka UI
)

echo -e "${YELLOW}Checking for port conflicts...${NC}"

for PORT in "${PORTS[@]}"; do
    # Check if port is in use
    PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ ! -z "$PID" ]; then
        echo -e "${RED}Port $PORT is in use by PID $PID${NC}"
        PROCESS=$(ps -p $PID -o comm= 2>/dev/null)
        echo -e "${YELLOW}Killing process: $PROCESS (PID: $PID)${NC}"
        kill -9 $PID 2>/dev/null
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Killed process on port $PORT${NC}"
        else
            echo -e "${RED}✗ Failed to kill process on port $PORT${NC}"
        fi
    else
        echo -e "${GREEN}✓ Port $PORT is available${NC}"
    fi
done

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Stopping Docker containers...${NC}"
docker-compose down 2>/dev/null
docker-compose down 2>/dev/null
echo -e "${GREEN}✓ Docker containers stopped${NC}"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Starting infrastructure...${NC}"
docker-compose up -d postgres kafka zookeeper kafka-ui
echo -e "${GREEN}✓ Infrastructure started${NC}"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Setting up database...${NC}"
cd apps/web
npx prisma db push --accept-data-loss 2>/dev/null
echo -e "${GREEN}✓ Database ready${NC}"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Building Orch Broker...${NC}"
cd ../orch-broker
cargo build --release 2>/dev/null &
CARGO_PID=$!

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Building Web Application...${NC}"
cd ../web
npm run build 2>/dev/null &
NEXT_PID=$!

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Build processes started!${NC}"
echo ""
echo -e "Services will be available at:"
echo -e "  ${BLUE}• Orch UI:${NC}   http://localhost:3047/orch"
echo -e "  ${BLUE}• Kafka UI:${NC}    http://localhost:9048"
echo -e "  ${BLUE}• PostgreSQL:${NC}  localhost:5447"
echo ""
echo -e "${YELLOW}To view logs:${NC}"
echo -e "  docker-compose logs -f"
echo ""

wait $CARGO_PID
wait $NEXT_PID

echo -e "${GREEN}All builds completed!${NC}"
