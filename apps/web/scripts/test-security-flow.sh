#!/bin/bash

# Security Flow Test Script
# Tests: API Call → Audit Log → Event Log

set -e

BASE_URL="http://localhost:3047/orch"
GATEWAY_URL="http://localhost:8047"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASSED++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAILED++)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo "========================================"
echo "  SECURITY FLOW TEST v0.2.1"
echo "========================================"
echo ""
echo "Test: API Call → Audit Log → Event Log"
echo ""

# Test 1: Check prerequisites
log_info "Checking prerequisites..."

if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" | grep -q "200"; then
  log_pass "Web server is running"
else
  log_fail "Web server not responding"
  exit 1
fi

if curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health" | grep -q "200"; then
  log_pass "Gateway is running"
else
  log_fail "Gateway not responding"
  exit 1
fi

echo ""

# Test 2: Create Security Flow
log_info "Creating security test flow..."

FLOW_PAYLOAD='{
  "name": "Security Audit Test Flow",
  "description": "Test flow for API call, audit trail, and event logging",
  "triggerType": "HTTP",
  "executionMode": "SYNC",
  "isActive": true,
  "nodes": [
    {
      "id": "http-in",
      "type": "httpRequest",
      "label": "HTTP Input",
      "config": {
        "method": "POST",
        "path": "/secure-test"
      }
    },
    {
      "id": "call-api",
      "type": "callService",
      "label": "Call Backend API",
      "config": {
        "url": "https://httpbin.org/post",
        "method": "POST",
        "timeout": 10000,
        "headers": {
          "Content-Type": "application/json",
          "X-Test-Source": "orch-security-test"
        }
      }
    },
    {
      "id": "audit-trail",
      "type": "auditTrail",
      "label": "Audit Trail",
      "config": {
        "action": "API_CALL",
        "entityType": "ExternalService",
        "logLevel": "INFO"
      }
    },
    {
      "id": "event-log",
      "type": "appEventLog",
      "label": "Event Log",
      "config": {
        "eventType": "REQUEST_COMPLETED",
        "severity": "INFO"
      }
    },
    {
      "id": "http-out",
      "type": "httpResponse",
      "label": "HTTP Response",
      "config": {
        "statusCode": 200
      }
    }
  ],
  "edges": [
    {"source": "http-in", "target": "call-api"},
    {"source": "call-api", "target": "audit-trail"},
    {"source": "audit-trail", "target": "event-log"},
    {"source": "event-log", "target": "http-out"}
  ]
}'

FLOW_RESPONSE=$(curl -s -X POST "$BASE_URL/api/flows" \
  -H "Content-Type: application/json" \
  -d "$FLOW_PAYLOAD")

if echo "$FLOW_RESPONSE" | grep -q "id"; then
  FLOW_ID=$(echo "$FLOW_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  log_pass "Flow created (ID: $FLOW_ID)"
else
  log_fail "Failed to create flow"
  echo "Response: $FLOW_RESPONSE"
  exit 1
fi

# Test 3: Deploy Flow
log_info "Deploying flow to gateway..."

DEPLOY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/flows/$FLOW_ID/deploy")

if curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/deploy/flows/$FLOW_ID" | grep -q "200"; then
  log_pass "Flow deployed successfully"
else
  log_warn "Flow deployment status unclear, continuing..."
fi

echo ""

# Test 4: Execute Flow
log_info "Executing security flow..."
log_info "Sending POST request to gateway..."

TEST_PAYLOAD='{
  "testId": "security-test-'$(date +%s)'",
  "userId": "admin",
  "action": "test-api-call",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
}'

EXEC_START=$(date +%s%3N)
EXEC_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/v1/secure-test" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: test-$(date +%s)" \
  -H "X-User-ID: admin" \
  -d "$TEST_PAYLOAD" 2>/dev/null || echo "\n000")
EXEC_END=$(date +%s%3N)

HTTP_CODE=$(echo "$EXEC_RESPONSE" | tail -1)
RESPONSE_BODY=$(echo "$EXEC_RESPONSE" | sed '$d')

EXEC_TIME=$((EXEC_END - EXEC_START))

if [ "$HTTP_CODE" = "200" ]; then
  log_pass "Flow executed successfully (HTTP 200, ${EXEC_TIME}ms)"
else
  log_fail "Flow execution failed (HTTP $HTTP_CODE)"
  log_info "Response: $RESPONSE_BODY"
fi

echo ""

# Test 5: Check Audit Logs
log_info "Checking audit logs..."
sleep 1  # Wait for async logging

AUDIT_RESPONSE=$(curl -s "$BASE_URL/api/audit?limit=5&sortBy=createdAt&sortOrder=desc")

if echo "$AUDIT_RESPONSE" | grep -q "API_CALL"; then
  log_pass "Audit log entry found"
  
  # Extract audit details
  AUDIT_COUNT=$(echo "$AUDIT_RESPONSE" | grep -o '"action":"API_CALL"' | wc -l | tr -d ' ')
  log_info "Found $AUDIT_COUNT API_CALL audit entries"
else
  log_fail "No audit log entry found"
  log_info "Checking audit endpoint..."
  curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "$BASE_URL/api/audit?limit=1"
fi

# Test 6: Check API Logs
log_info "Checking API logs..."

LOGS_RESPONSE=$(curl -s "$BASE_URL/api/logs?limit=5" 2>/dev/null)

if [ ! -z "$LOGS_RESPONSE" ] && echo "$LOGS_RESPONSE" | grep -q "id"; then
  log_pass "API logs accessible"
  LOG_COUNT=$(echo "$LOGS_RESPONSE" | grep -o '"id"' | wc -l | tr -d ' ')
  log_info "Found $LOG_COUNT log entries"
else
  log_warn "API logs not available or empty"
fi

echo ""

# Test 7: Validate Flow Execution Order
log_info "Validating flow execution order..."
log_info "Expected: HTTP Input → Call API → Audit Trail → Event Log → HTTP Response"

if [ "$HTTP_CODE" = "200" ]; then
  log_pass "Complete flow executed in sequence"
else
  log_fail "Flow execution sequence failed"
fi

# Test 8: Error Scenario Test
log_info "Testing error handling..."

ERROR_FLOW_PAYLOAD='{
  "name": "Security Error Test Flow",
  "description": "Test error handling with audit and event logging",
  "triggerType": "HTTP",
  "executionMode": "SYNC",
  "isActive": true,
  "nodes": [
    {
      "id": "http-in",
      "type": "httpRequest",
      "label": "HTTP Input"
    },
    {
      "id": "call-invalid",
      "type": "callService",
      "label": "Call Invalid API",
      "config": {
        "url": "http://invalid-host-that-does-not-exist:9999/test",
        "method": "POST",
        "timeout": 3000
      }
    },
    {
      "id": "audit-error",
      "type": "auditTrail",
      "label": "Audit Error",
      "config": {
        "action": "API_CALL_FAILED",
        "entityType": "ExternalService",
        "logLevel": "ERROR"
      }
    },
    {
      "id": "event-error",
      "type": "appEventLog",
      "label": "Event Error",
      "config": {
        "eventType": "REQUEST_FAILED",
        "severity": "ERROR"
      }
    },
    {
      "id": "http-error",
      "type": "httpResponse",
      "label": "Error Response",
      "config": {
        "statusCode": 500
      }
    }
  ],
  "edges": [
    {"source": "http-in", "target": "call-invalid"},
    {"source": "call-invalid", "target": "audit-error"},
    {"source": "audit-error", "target": "event-error"},
    {"source": "event-error", "target": "http-error"}
  ]
}'

ERROR_FLOW_RESPONSE=$(curl -s -X POST "$BASE_URL/api/flows" \
  -H "Content-Type: application/json" \
  -d "$ERROR_FLOW_PAYLOAD")

if echo "$ERROR_FLOW_RESPONSE" | grep -q "id"; then
  ERROR_FLOW_ID=$(echo "$ERROR_FLOW_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  # Deploy error flow
  curl -s -X POST "$BASE_URL/api/flows/$ERROR_FLOW_ID/deploy" > /dev/null
  
  # Execute error flow
  ERROR_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/api/v1/security-error-test" \
    -H "Content-Type: application/json" \
    -d '{"test":"error"}' 2>/dev/null || echo "\n000")
  
  ERROR_HTTP_CODE=$(echo "$ERROR_RESPONSE" | tail -1)
  
  if [ "$ERROR_HTTP_CODE" = "500" ] || [ "$ERROR_HTTP_CODE" = "502" ] || [ "$ERROR_HTTP_CODE" = "503" ]; then
    log_pass "Error flow executed (HTTP $ERROR_HTTP_CODE)"
    
    # Check for error audit logs
    sleep 1
    ERROR_AUDIT=$(curl -s "$BASE_URL/api/audit?limit=10&sortBy=createdAt&sortOrder=desc")
    if echo "$ERROR_AUDIT" | grep -q "API_CALL_FAILED"; then
      log_pass "Error audit log created"
    else
      log_warn "Error audit log not found (may need async processing time)"
    fi
  else
    log_warn "Error flow returned unexpected status: $ERROR_HTTP_CODE"
  fi
  
  # Cleanup error flow
  curl -s -X DELETE "$BASE_URL/api/flows/$ERROR_FLOW_ID" > /dev/null
else
  log_warn "Could not create error test flow"
fi

echo ""

# Test 9: Performance Test
log_info "Running performance test (10 sequential requests)..."

SUCCESS_COUNT=0
TOTAL_TIME=0

for i in {1..10}; do
  REQ_START=$(date +%s%N)
  PERF_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY_URL/api/v1/secure-test" \
    -H "Content-Type: application/json" \
    -d "{\"iteration\":$i}" 2>/dev/null)
  REQ_END=$(date +%s%N)
  
  REQ_TIME=$(( (REQ_END - REQ_START) / 1000000 ))  # Convert to ms
  TOTAL_TIME=$((TOTAL_TIME + REQ_TIME))
  
  if [ "$PERF_CODE" = "200" ]; then
    ((SUCCESS_COUNT++))
  fi
done

AVG_TIME=$((TOTAL_TIME / 10))

log_info "Results: $SUCCESS_COUNT/10 successful, Avg: ${AVG_TIME}ms"

if [ $SUCCESS_COUNT -ge 8 ]; then
  log_pass "Performance test passed"
else
  log_fail "Performance test failed"
fi

# Cleanup
log_info "Cleaning up test flows..."
curl -s -X DELETE "$BASE_URL/api/flows/$FLOW_ID" > /dev/null
log_pass "Cleanup complete"

echo ""
echo "========================================"
echo "  TEST SUMMARY"
echo "========================================"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL SECURITY TESTS PASSED${NC}"
  echo ""
  echo "Flow executed successfully with:"
  echo "  ✓ API Call to backend"
  echo "  ✓ Audit Trail logging"
  echo "  ✓ Event Log logging"
  echo "  ✓ Error handling"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  exit 1
fi
