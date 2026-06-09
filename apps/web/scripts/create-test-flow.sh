#!/bin/bash
# Script to create a test flow that calls real API
# Usage: ./scripts/create-test-flow.sh

API_BASE="http://localhost:3047/orch"

echo "🚀 Creating Test Flow with Real API Call..."

# 1. Create API Registration (if not exists)
echo "📋 Step 1: Registering API..."
curl -s -X POST "${API_BASE}/api/registers" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test External API",
    "endpoint": "/test-api",
    "method": "POST",
    "backendUrl": "https://jsonplaceholder.typicode.com/posts",
    "authType": "NONE",
    "status": "ACTIVE",
    "auditEnabled": true
  }' | jq .

# 2. Create Flow with HTTP Request → Call Service → HTTP Response
echo ""
echo "🔧 Step 2: Creating Flow..."
FLOW_RESPONSE=$(curl -s -X POST "${API_BASE}/api/flows" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Real API Flow",
    "triggerType": "HTTP",
    "executionMode": "sync",
    "executionStrategy": "fast",
    "flowCategory": "API_GATEWAY",
    "isActive": false,
    "nodes": [
      {
        "id": "trigger-1",
        "type": "flowNode",
        "position": { "x": 100, "y": 200 },
        "data": {
          "type": "httpRequest",
          "label": "HTTP Request",
          "sub": "Receive HTTP request",
          "icon": "H",
          "color": "#34D399",
          "config": {
            "path": "/test-flow",
            "method": "POST",
            "auth": "none"
          },
          "id": "trigger-1"
        }
      },
      {
        "id": "action-1",
        "type": "flowNode",
        "position": { "x": 350, "y": 200 },
        "data": {
          "type": "callService",
          "label": "Call External API",
          "sub": "Call JSONPlaceholder",
          "icon": "S",
          "color": "#60A5FA",
          "config": {
            "service": "jsonplaceholder",
            "endpoint": "/posts",
            "method": "POST",
            "timeout": 10,
            "retries": 2,
            "forwardAuth": false,
            "headers": {
              "Content-Type": "application/json"
            }
          },
          "id": "action-1"
        }
      },
      {
        "id": "output-1",
        "type": "flowNode",
        "position": { "x": 600, "y": 200 },
        "data": {
          "type": "httpResponse",
          "label": "HTTP Response",
          "sub": "Return API result",
          "icon": "R",
          "color": "#F87171",
          "config": {
            "statusCode": 200,
            "headers": {
              "Content-Type": "application/json"
            }
          },
          "id": "output-1"
        }
      }
    ],
    "edges": [
      {
        "id": "e1",
        "source": "trigger-1",
        "target": "action-1",
        "type": "smoothstep"
      },
      {
        "id": "e2",
        "source": "action-1",
        "target": "output-1",
        "type": "smoothstep"
      }
    ]
  }')

echo "$FLOW_RESPONSE" | jq .
FLOW_ID=$(echo "$FLOW_RESPONSE" | jq -r '.flow.id // .id')

if [ -z "$FLOW_ID" ] || [ "$FLOW_ID" = "null" ]; then
  echo "❌ Failed to create flow"
  exit 1
fi

echo ""
echo "✅ Flow created with ID: $FLOW_ID"

# 3. Deploy the flow
echo ""
echo "🚀 Step 3: Deploying Flow..."
curl -s -X POST "${API_BASE}/api/flows/${FLOW_ID}/deploy" | jq .

# 4. Link API to Flow
echo ""
echo "🔗 Step 4: Linking API to Flow..."
# Get the API ID
API_ID=$(curl -s "${API_BASE}/api/registers?search=test-api" | jq -r '.data[0].id // .registers[0].id')
if [ -n "$API_ID" ] && [ "$API_ID" != "null" ]; then
  curl -s -X PUT "${API_BASE}/api/registers/${API_ID}" \
    -H "Content-Type: application/json" \
    -d "{\"flowId\": \"${FLOW_ID}\"}" | jq .
fi

echo ""
echo "========================================"
echo "✅ Test Flow Setup Complete!"
echo ""
echo "📌 Test Commands:"
echo ""
echo "1. Simple GET request:"
echo "   curl -X GET http://localhost:8047/broker/api/v1/test-api/1"
echo ""
echo "2. POST request with data:"
echo "   curl -X POST http://localhost:8047/broker/api/v1/test-api \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"title\": \"foo\", \"body\": \"bar\", \"userId\": 1}'"
echo ""
echo "3. View Flow in UI:"
echo "   http://localhost:3047/orch/flows/builder/${FLOW_ID}"
echo ""
echo "📝 Note: The flow calls https://jsonplaceholder.typicode.com/posts"
echo "    which returns mock data for testing."
echo "========================================"
