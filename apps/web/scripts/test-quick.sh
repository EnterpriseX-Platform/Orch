#!/bin/bash
# Quick Test Suite for Orch
# Version: v0.2.1

BASE_URL="http://localhost:3047/orch"
GATEWAY_URL="http://localhost:8047"

echo "========================================"
echo "  Orch QUICK TEST SUITE v0.2.1"
echo "========================================"
echo ""

PASSED=0
FAILED=0

test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local data=${4:-}
    
    echo -n "  $name ... "
    
    if [ -z "$data" ]; then
        CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" 2>/dev/null)
    else
        CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" -d "$data" 2>/dev/null)
    fi
    
    if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
        echo "✓ PASS (HTTP $CODE)"
        ((PASSED++))
    else
        echo "✗ FAIL (HTTP $CODE)"
        ((FAILED++))
    fi
}

echo "1. Health Checks"
echo "----------------"
test_endpoint "Web Server" "$BASE_URL/api/health"
test_endpoint "Gateway" "$GATEWAY_URL/health"

echo ""
echo "2. Authentication"
echo "-----------------"
test_endpoint "Login" "$BASE_URL/api/auth/login" "POST" '{"username":"admin","password":"admin"}'

echo ""
echo "3. Dashboard"
echo "------------"
test_endpoint "Dashboard Stats" "$BASE_URL/api/dashboard"

echo ""
echo "4. Data Catalog (Datasets)"
echo "--------------------------"
test_endpoint "List Datasets" "$BASE_URL/api/datasets"
test_endpoint "Create Dataset" "$BASE_URL/api/datasets" "POST" '{"name":"Test","source":"Script","category":"OTHER","schema":{}}'
test_endpoint "Update Dataset" "$BASE_URL/api/datasets/1" "PUT" '{"description":"Updated"}'

echo ""
echo "5. API Registration"
echo "-------------------"
test_endpoint "List APIs" "$BASE_URL/api/registers"
test_endpoint "Create API" "$BASE_URL/api/registers" "POST" '{"endpoint":"/test","method":"GET","backendUrl":"http://localhost/test","authType":"NONE","status":"ACTIVE"}'

echo ""
echo "6. Flow Integration"
echo "-------------------"
test_endpoint "List Flows" "$BASE_URL/api/flows"
test_endpoint "Create Flow" "$BASE_URL/api/flows" "POST" '{"name":"Test","triggerType":"HTTP","executionMode":"SYNC","nodes":[],"edges":[]}'

echo ""
echo "7. Worker Management"
echo "--------------------"
test_endpoint "Worker Status" "$GATEWAY_URL/broker/admin/workers"

echo ""
echo "8. User Management"
echo "------------------"
test_endpoint "List Users" "$BASE_URL/api/users"
test_endpoint "Create User" "$BASE_URL/api/users" "POST" '{"username":"testuser","email":"test@test.com","password":"test123","roles":["user"],"isActive":true}'

echo ""
echo "========================================"
echo "  TEST SUMMARY"
echo "========================================"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "  Total:  $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "  ✓ All tests passed!"
    exit 0
else
    echo "  ✗ Some tests failed"
    exit 1
fi
