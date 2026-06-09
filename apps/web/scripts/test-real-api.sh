#!/bin/bash
# Quick test script for real API calls through Orch
# This script creates a simple flow and tests it immediately

set -e

API_BASE="http://localhost:3047/orch"
BROKER_URL="http://localhost:8047/broker"

echo "🚀 Orch Real API Test"
echo "========================"
echo ""

# Check if services are running
echo "📡 Checking services..."
if ! curl -s "${BROKER_URL}/health" > /dev/null 2>&1; then
  echo "❌ Orch Broker is not running on port 8047"
  echo "   Start it with: cd apps/orch-broker && cargo run"
  exit 1
fi

if ! curl -s "${API_BASE}/api/health" > /dev/null 2>&1; then
  echo "❌ Next.js app is not running on port 3047"
  echo "   Start it with: cd apps/web && npm run dev"
  exit 1
fi

echo "✅ All services are running"
echo ""

# Create test flow
echo "🔧 Creating test flow..."
FLOW_DATA='{
  "name": "Real API Test Flow",
  "triggerType": "HTTP",
  "executionMode": "sync",
  "executionStrategy": "fast",
  "flowCategory": "API_GATEWAY",
  "isActive": true,
  "nodes": [
    {
      "id": "trigger",
      "type": "flowNode",
      "position": { "x": 100, "y": 200 },
      "data": {
        "type": "httpRequest",
        "label": "HTTP Request",
        "sub": "Receive request",
        "icon": "H",
        "color": "#34D399",
        "config": {},
        "id": "trigger"
      }
    },
    {
      "id": "call-api",
      "type": "flowNode",
      "position": { "x": 350, "y": 200 },
      "data": {
        "type": "callService",
        "label": "Call JSONPlaceholder",
        "sub": "Get posts",
        "icon": "S",
        "color": "#60A5FA",
        "config": {
          "service": "jsonplaceholder",
          "endpoint": "/posts/1",
          "method": "GET",
          "timeout": 10,
          "retries": 2,
          "forwardAuth": false
        },
        "id": "call-api"
      }
    },
    {
      "id": "response",
      "type": "flowNode",
      "position": { "x": 600, "y": 200 },
      "data": {
        "type": "httpResponse",
        "label": "HTTP Response",
        "sub": "Return data",
        "icon": "R",
        "color": "#F87171",
        "config": { "statusCode": 200 },
        "id": "response"
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "trigger", "target": "call-api", "type": "smoothstep" },
    { "id": "e2", "source": "call-api", "target": "response", "type": "smoothstep" }
  ]
}'

# Create flow
FLOW_RESPONSE=$(curl -s -X POST "${API_BASE}/api/flows" \
  -H "Content-Type: application/json" \
  -d "$FLOW_DATA")

FLOW_ID=$(echo "$FLOW_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$FLOW_ID" ]; then
  echo "❌ Failed to create flow"
  echo "Response: $FLOW_RESPONSE"
  exit 1
fi

echo "✅ Flow created: $FLOW_ID"

# Deploy flow
echo "🚀 Deploying flow..."
curl -s -X POST "${API_BASE}/api/flows/${FLOW_ID}/deploy" > /dev/null

echo "✅ Flow deployed"
echo ""

# Wait a moment for deployment
echo "⏳ Waiting for deployment..."
sleep 2

# Test 1: GET Request
echo ""
echo "🧪 Test 1: GET Request to JSONPlaceholder"
echo "-------------------------------------------"
echo "Command: curl ${BROKER_URL}/api/v1/flows/${FLOW_ID}"
echo ""
echo "Response:"
curl -s "${BROKER_URL}/api/v1/flows/${FLOW_ID}" | jq . 2>/dev/null || curl -s "${BROKER_URL}/api/v1/flows/${FLOW_ID}"

echo ""
echo ""

# Create API registration for easier testing
echo "📋 Creating API Registration..."
REG_DATA='{
  "name": "JSONPlaceholder Proxy",
  "endpoint": "/external/posts",
  "method": "GET",
  "backendUrl": "https://jsonplaceholder.typicode.com/posts",
  "authType": "NONE",
  "status": "ACTIVE",
  "flowId": "'"$FLOW_ID"'",
  "auditEnabled": true
}'

REG_RESPONSE=$(curl -s -X POST "${API_BASE}/api/registers" \
  -H "Content-Type: application/json" \
  -d "$REG_DATA")

echo "✅ API Registration created"
echo ""

# Test 2: Direct API call
echo "🧪 Test 2: Direct API call via Gateway"
echo "---------------------------------------"
echo "Command: curl ${BROKER_URL}/api/v1/external/posts/1"
echo ""
echo "Response:"
curl -s "${BROKER_URL}/api/v1/external/posts/1" | jq . 2>/dev/null || curl -s "${BROKER_URL}/api/v1/external/posts/1"

echo ""
echo ""

# Test 3: POST request
echo "🧪 Test 3: POST Request"
echo "-----------------------"
echo "Command:"
echo "  curl -X POST ${BROKER_URL}/api/v1/external/posts \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"title\":\"Test\",\"body\":\"Hello from Orch\",\"userId\":1}'"
echo ""
echo "Response:"
curl -s -X POST "${BROKER_URL}/api/v1/external/posts" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","body":"Hello from Orch","userId":1}' | jq . 2>/dev/null || echo "Raw response received"

echo ""
echo ""

# Summary
echo "✅ Tests Complete!"
echo "=================="
echo ""
echo "📌 Flow Details:"
echo "   Flow ID: $FLOW_ID"
echo "   Flow URL: http://localhost:3047/orch/flows/builder/$FLOW_ID"
echo ""
echo "📌 API Endpoints:"
echo "   GET  ${BROKER_URL}/api/v1/external/posts/1"
echo "   POST ${BROKER_URL}/api/v1/external/posts"
echo ""
echo "📌 Monitor:"
echo "   http://localhost:3047/orch/monitor"
echo ""
echo "🧹 Cleanup (optional):"
echo "   curl -X DELETE ${API_BASE}/api/flows/$FLOW_ID"
echo ""
