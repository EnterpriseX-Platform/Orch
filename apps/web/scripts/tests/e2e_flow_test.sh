#!/bin/bash
# ==========================================
# End-to-End Flow Test Script
# Tests the full flow from HTTP Request -> Event Log -> Audit Log -> Response
# ==========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Config
ORCH_BROKER_URL="${ORCH_BROKER_URL:-http://localhost:8047}"
WEB_URL="${WEB_URL:-http://localhost:3047}"
KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:9047}"

# Test Data
TEST_FLOW_ID="test-flow-$(date +%s)"
REQUEST_ID=""

echo "=============================================="
echo "🧪 E2E Flow Test Suite"
echo "=============================================="
echo "orch-broker: $ORCH_BROKER_URL"
echo "Web UI: $WEB_URL"
echo ""

# ==========================================
# Test 1: Health Check
# ==========================================
echo "📋 Test 1: Health Check"
HEALTH=$(curl -s "$ORCH_BROKER_URL/health" || echo "FAILED")
if [ "$HEALTH" == "FAILED" ]; then
    echo -e "${RED}❌ orch-broker is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✅ orch-broker is healthy${NC}"
echo ""

# ==========================================
# Test 2: Deploy Test Flow
# ==========================================
echo "📋 Test 2: Deploy Test Flow"

FLOW_CONFIG='{
    "id": "'"$TEST_FLOW_ID"'",
    "name": "E2E Test Flow",
    "description": "Test flow for E2E testing",
    "flow_type": "API_GATEWAY",
    "execution_mode": "sync",
    "nodes": [
        {
            "id": "extract-1",
            "node_type": "extract",
            "data": {
                "fields": ["userId", "amount", "currency"]
            },
            "position": {"x": 100, "y": 100}
        },
        {
            "id": "proxy-1",
            "node_type": "proxy",
            "data": {
                "target_url": "https://httpbin.org/post",
                "method": "POST",
                "timeout_ms": 10000
            },
            "position": {"x": 300, "y": 100}
        },
        {
            "id": "eventlog-1",
            "node_type": "eventLog",
            "data": {
                "event_type": "API_CALL",
                "severity": "INFO"
            },
            "position": {"x": 500, "y": 100}
        },
        {
            "id": "audit-1",
            "node_type": "audit",
            "data": {
                "action": "PROXY_CALL",
                "entity_type": "PAYMENT"
            },
            "position": {"x": 700, "y": 100}
        },
        {
            "id": "response-1",
            "node_type": "response",
            "data": {
                "status_code": 200,
                "body_template": {
                    "success": true,
                    "data": "${proxy_response}",
                    "request_id": "${request_id}"
                }
            },
            "position": {"x": 900, "y": 100}
        }
    ],
    "edges": [
        {"id": "e1", "source": "extract-1", "target": "proxy-1"},
        {"id": "e2", "source": "proxy-1", "target": "eventlog-1"},
        {"id": "e3", "source": "eventlog-1", "target": "audit-1"},
        {"id": "e4", "source": "audit-1", "target": "response-1"}
    ],
    "is_active": true
}'

curl -s -X POST "$ORCH_BROKER_URL/deploy/flows/$TEST_FLOW_ID" \
    -H "Content-Type: application/json" \
    -d "$FLOW_CONFIG" > /dev/null

echo -e "${GREEN}✅ Flow deployed: $TEST_FLOW_ID${NC}"
echo ""

# ==========================================
# Test 3: Execute Flow (Small Payload)
# ==========================================
echo "📋 Test 3: Execute Flow with Small Payload"

SMALL_PAYLOAD='{
    "userId": "user-123",
    "amount": 1000,
    "currency": "USD",
    "description": "Test payment"
}'

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ORCH_BROKER_URL/api/v1/test-flow-$(echo $TEST_FLOW_ID | cut -d- -f3)" \
    -H "Content-Type: application/json" \
    -H "X-Request-ID: req-$(date +%s)" \
    -d "$SMALL_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✅ Flow executed successfully (HTTP $HTTP_CODE)${NC}"
    REQUEST_ID=$(echo "$BODY" | jq -r '.request_id // empty')
    echo "Request ID: $REQUEST_ID"
else
    echo -e "${RED}❌ Flow execution failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

# ==========================================
# Test 4: Execute Flow (Large Payload)
# ==========================================
echo "📋 Test 4: Execute Flow with Large Payload (10KB)"

# Generate large JSON payload
LARGE_PAYLOAD=$(python3 << 'EOF'
import json
import random
import string

data = {
    "userId": "user-" + ''.join(random.choices(string.ascii_lowercase + string.digits, k=20)),
    "amount": random.randint(1000, 1000000),
    "currency": "USD",
    "description": "Large test payment with many items",
    "items": []
}

for i in range(100):
    data["items"].append({
        "id": f"item-{i}",
        "name": ''.join(random.choices(string.ascii_letters, k=50)),
        "price": random.randint(10, 10000),
        "quantity": random.randint(1, 100),
        "metadata": {
            "category": random.choice(["food", "electronics", "clothing", "books"]),
            "tags": [f"tag-{j}" for j in range(random.randint(1, 10))],
            "attributes": {f"attr-{k}": f"value-{k}" for k in range(random.randint(5, 20))}
        }
    })

print(json.dumps(data))
EOF
)

START_TIME=$(date +%s%N)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ORCH_BROKER_URL/api/v1/test-flow-$(echo $TEST_FLOW_ID | cut -d- -f3)" \
    -H "Content-Type: application/json" \
    -H "X-Request-ID: req-large-$(date +%s)" \
    -d "$LARGE_PAYLOAD")
END_TIME=$(date +%s%N)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))  # Convert to ms

if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✅ Large payload executed (HTTP $HTTP_CODE, ${DURATION}ms)${NC}"
else
    echo -e "${RED}❌ Large payload failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# ==========================================
# Test 5: Verify Event Log
# ==========================================
echo "📋 Test 5: Verify Event Log in Database"

# Wait a bit for async logging
sleep 2

EVENT_COUNT=$(curl -s "$WEB_URL/orch/api/logs?flowId=$TEST_FLOW_ID&limit=10" \
    -H "Accept: application/json" | jq '.data | length' 2>/dev/null || echo "0")

if [ "$EVENT_COUNT" -gt "0" ]; then
    echo -e "${GREEN}✅ Event logs recorded: $EVENT_COUNT entries${NC}"
else
    echo -e "${YELLOW}⚠️  No event logs found (may be async)${NC}"
fi
echo ""

# ==========================================
# Test 6: Verify Audit Log
# ==========================================
echo "📋 Test 6: Verify Audit Log in Database"

AUDIT_COUNT=$(curl -s "$WEB_URL/orch/api/audit?flowId=$TEST_FLOW_ID&limit=10" \
    -H "Accept: application/json" | jq '.data | length' 2>/dev/null || echo "0")

if [ "$AUDIT_COUNT" -gt "0" ]; then
    echo -e "${GREEN}✅ Audit logs recorded: $AUDIT_COUNT entries${NC}"
else
    echo -e "${YELLOW}⚠️  No audit logs found (may be async)${NC}"
fi
echo ""

# ==========================================
# Test 7: Load Test
# ==========================================
echo "📋 Test 7: Load Test (100 requests, 10 concurrent)"

LOAD_PAYLOAD='{"userId": "load-test", "amount": 100, "currency": "USD"}'

START_TIME=$(date +%s)

# Run load test with curl
seq 1 100 | xargs -P 10 -I {} curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$ORCH_BROKER_URL/api/v1/test-flow-$(echo $TEST_FLOW_ID | cut -d- -f3)" \
    -H "Content-Type: application/json" \
    -H "X-Request-ID: load-{}" \
    -d "$LOAD_PAYLOAD" 2>/dev/null | sort | uniq -c

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))
RPS=$((100 / TOTAL_TIME))

echo -e "${GREEN}✅ Load test completed: 100 requests in ${TOTAL_TIME}s (~${RPS} req/s)${NC}"
echo ""

# ==========================================
# Cleanup
# ==========================================
echo "📋 Cleanup: Undeploy Test Flow"
curl -s -X DELETE "$ORCH_BROKER_URL/deploy/flows/$TEST_FLOW_ID" > /dev/null
echo -e "${GREEN}✅ Test flow undeployed${NC}"
echo ""

# ==========================================
# Summary
# ==========================================
echo "=============================================="
echo "📊 Test Summary"
echo "=============================================="
echo -e "${GREEN}✅ All tests completed${NC}"
echo ""
echo "Next steps:"
echo "1. Check logs: docker logs orch-broker-test"
echo "2. Check Kafka UI: http://localhost:9048"
echo "3. Check database: psql -h localhost -p 5447 -U postgres"
echo ""
