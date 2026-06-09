#!/bin/bash
# Simple test - just call the test endpoint directly
# No flow creation needed - uses existing API registration

echo "🚀 Simple API Test"
echo "=================="
echo ""

BROKER_URL="http://localhost:8047"

echo "Testing Orch Broker connection..."
if curl -s "${BROKER_URL}/health" > /dev/null 2>&1; then
  echo "✅ Broker is running"
else
  echo "❌ Broker not available at ${BROKER_URL}"
  exit 1
fi

echo ""
echo "Test 1: GET request to JSONPlaceholder (via Orch)"
echo "Command: curl ${BROKER_URL}/api/v1/external/posts/1"
echo ""
curl -s "${BROKER_URL}/api/v1/external/posts/1" | head -c 500
echo ""
echo "..."
echo ""

echo "Test 2: GET all posts"
echo "Command: curl ${BROKER_URL}/api/v1/external/posts"
echo ""
curl -s "${BROKER_URL}/api/v1/external/posts" | head -c 800
echo ""
echo "... (truncated)"
echo ""

echo "Test 3: POST new post"
echo "Command: curl -X POST ${BROKER_URL}/api/v1/external/posts -H 'Content-Type: application/json' -d '{...}'"
echo ""
curl -s -X POST "${BROKER_URL}/api/v1/external/posts" \
  -H "Content-Type: application/json" \
  -d '{"title":"Orch Test","body":"Created by Orch","userId":99}'
echo ""
echo ""

echo "✅ Tests complete!"
