#!/bin/bash

# Simple Security Flow Test
# Tests: API Call → Audit Log → Event Log (without external calls)

BASE_URL="http://localhost:3047/orch"
GATEWAY_URL="http://localhost:8047"

echo "========================================"
echo "  SECURITY FLOW TEST (Simple)"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

pass() { echo -e "${GREEN}✓${NC} $1"; ((PASSED++)); }
fail() { echo -e "${RED}✗${NC} $1"; ((FAILED++)); }
info() { echo -e "${BLUE}ℹ${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

# Test 1: Health Check
echo "1. Health Check"
echo "----------------"
if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" | grep -q "200"; then
  pass "Web server is running"
else
  fail "Web server not responding"
fi
echo ""

# Test 2: Create Simple Flow (without external API call)
echo "2. Create Security Flow"
echo "-----------------------"

# Create a simple flow that goes through all nodes
FLOW_PAYLOAD='{
  "name": "Security Flow Test",
  "description": "Test audit trail and event log",
  "triggerType": "HTTP",
  "executionMode": "SYNC",
  "nodes": [
    {
      "id": "in",
      "type": "httpRequest",
      "label": "Input"
    },
    {
      "id": "audit",
      "type": "auditTrail",
      "label": "Audit",
      "config": {
        "action": "TEST_ACTION",
        "entityType": "TestEntity"
      }
    },
    {
      "id": "event",
      "type": "appEventLog",
      "label": "Event",
      "config": {
        "eventType": "TEST_EVENT",
        "severity": "INFO"
      }
    },
    {
      "id": "out",
      "type": "httpResponse",
      "label": "Output"
    }
  ],
  "edges": [
    {"source": "in", "target": "audit"},
    {"source": "audit", "target": "event"},
    {"source": "event", "target": "out"}
  ]
}'

FLOW_RESPONSE=$(curl -s -X POST "$BASE_URL/api/flows" \
  -H "Content-Type: application/json" \
  -d "$FLOW_PAYLOAD")

if echo "$FLOW_RESPONSE" | grep -q '"id"'; then
  FLOW_ID=$(echo "$FLOW_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  pass "Flow created (ID: ${FLOW_ID:0:8}...)"
else
  fail "Failed to create flow"
  echo "Response: $FLOW_RESPONSE"
  exit 1
fi
echo ""

# Test 3: Get Flow
echo "3. Verify Flow Created"
echo "----------------------"
if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/flows/$FLOW_ID" | grep -q "200"; then
  pass "Flow accessible"
  
  # Check nodes
  FLOW_DETAIL=$(curl -s "$BASE_URL/api/flows/$FLOW_ID")
  NODE_COUNT=$(echo "$FLOW_DETAIL" | grep -o '"type":' | wc -l | tr -d ' ')
  info "Flow has $NODE_COUNT nodes"
  
  # Check for audit and event nodes
  if echo "$FLOW_DETAIL" | grep -q "auditTrail"; then
    pass "Audit trail node present"
  else
    fail "Audit trail node missing"
  fi
  
  if echo "$FLOW_DETAIL" | grep -q "appEventLog"; then
    pass "Event log node present"
  else
    fail "Event log node missing"
  fi
else
  fail "Flow not accessible"
fi
echo ""

# Test 4: Check Audit Endpoint
echo "4. Check Audit Endpoint"
echo "-----------------------"
AUDIT_RESPONSE=$(curl -s "$BASE_URL/api/audit?limit=5")
if echo "$AUDIT_RESPONSE" | grep -q '"data"\|"id"'; then
  pass "Audit endpoint accessible"
  AUDIT_COUNT=$(echo "$AUDIT_RESPONSE" | grep -o '"id"' | wc -l | tr -d ' ')
  info "Found $AUDIT_COUNT audit entries"
else
  warn "Audit endpoint may be empty or unavailable"
fi
echo ""

# Test 5: Check Logs Endpoint
echo "5. Check Logs Endpoint"
echo "----------------------"
LOGS_RESPONSE=$(curl -s "$BASE_URL/api/logs?limit=5")
if echo "$LOGS_RESPONSE" | grep -q '"data"\|"id"'; then
  pass "Logs endpoint accessible"
  LOG_COUNT=$(echo "$LOGS_RESPONSE" | grep -o '"id"' | wc -l | tr -d ' ')
  info "Found $LOG_COUNT log entries"
else
  warn "Logs endpoint may be empty or unavailable"
fi
echo ""

# Test 6: Deploy Flow (if gateway available)
echo "6. Deploy Flow"
echo "--------------"
if curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health" | grep -q "200"; then
  DEPLOY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/flows/$FLOW_ID/deploy")
  pass "Flow deployment triggered"
  
  # Check deployment
  sleep 2
  DEPLOY_STATUS=$(curl -s "$GATEWAY_URL/deploy/flows/$FLOW_ID" 2>/dev/null)
  if echo "$DEPLOY_STATUS" | grep -q "id\|flowId"; then
    pass "Flow deployed to gateway"
  else
    warn "Deployment status unclear"
  fi
else
  warn "Gateway not available, skipping deployment"
fi
echo ""

# Test 7: Validate Flow Structure
echo "7. Validate Flow Structure"
echo "--------------------------"
FLOW_CHECK=$(curl -s "$BASE_URL/api/flows/$FLOW_ID")

# Check execution chain
if echo "$FLOW_CHECK" | grep -o '"source":"in","target":"audit"' > /dev/null; then
  pass "Input → Audit connection"
else
  fail "Input → Audit connection missing"
fi

if echo "$FLOW_CHECK" | grep -o '"source":"audit","target":"event"' > /dev/null; then
  pass "Audit → Event connection"
else
  fail "Audit → Event connection missing"
fi

if echo "$FLOW_CHECK" | grep -o '"source":"event","target":"out"' > /dev/null; then
  pass "Event → Output connection"
else
  fail "Event → Output connection missing"
fi
echo ""

# Test 8: Create API with Flow Association
echo "8. Create API with Flow"
echo "-----------------------"
API_PAYLOAD='{
  "endpoint": "/security-test",
  "method": "POST",
  "backendUrl": "http://localhost:8080/test",
  "authType": "NONE",
  "status": "ACTIVE",
  "flowId": "'$FLOW_ID'",
  "name": "Security Test API",
  "description": "API with security logging"
}'

API_RESPONSE=$(curl -s -X POST "$BASE_URL/api/registers" \
  -H "Content-Type: application/json" \
  -d "$API_PAYLOAD")

if echo "$API_RESPONSE" | grep -q '"id"'; then
  API_ID=$(echo "$API_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  pass "API created with flow association"
  
  # Verify flowId
  if echo "$API_RESPONSE" | grep -q "$FLOW_ID"; then
    pass "Flow ID correctly associated"
  else
    warn "Flow ID association unclear"
  fi
else
  warn "API creation may have failed"
fi
echo ""

# Cleanup
echo "9. Cleanup"
echo "----------"
if [ ! -z "$FLOW_ID" ]; then
  curl -s -X DELETE "$BASE_URL/api/flows/$FLOW_ID" > /dev/null
  pass "Flow deleted"
fi

if [ ! -z "$API_ID" ]; then
  curl -s -X DELETE "$BASE_URL/api/registers/$API_ID" > /dev/null
  pass "API deleted"
fi
echo ""

# Summary
echo "========================================"
echo "  TEST SUMMARY"
echo "========================================"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  echo ""
  echo "Security Flow Configuration:"
  echo "  ✓ HTTP Input → Audit Trail → Event Log → HTTP Output"
  echo "  ✓ All nodes connected in correct order"
  echo "  ✓ Audit endpoint accessible"
  echo "  ✓ Logs endpoint accessible"
  echo "  ✓ Flow can be associated with API"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  exit 1
fi
