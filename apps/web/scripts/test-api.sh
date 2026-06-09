#!/bin/bash

# Orch API Test Suite
# Version: v0.2.1

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3047/orch"
GATEWAY_URL="http://localhost:8047"
AUTH_TOKEN=""

# Counters
PASSED=0
FAILED=0

# Helper functions
print_header() {
    echo ""
    echo "========================================"
    echo "  $1"
    echo "========================================"
}

print_test() {
    echo -n "  $1 ... "
}

pass() {
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗ FAIL${NC} - $1"
    ((FAILED++))
}

# Test functions
test_health() {
    print_header "1. Health Check Tests"
    
    print_test "Web Server Health"
    if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" | grep -q "200"; then
        pass
    else
        fail "Server not responding"
    fi
    
    print_test "Gateway Health"
    if curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health" | grep -q "200"; then
        pass
    else
        fail "Gateway not responding"
    fi
}

test_auth() {
    print_header "2. Authentication Tests"
    
    print_test "Valid Login"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin"}')
    
    if echo "$RESPONSE" | grep -q "accessToken"; then
        AUTH_TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
        pass
    else
        fail "Login failed"
    fi
    
    print_test "Invalid Login"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"wrong"}')
    
    if echo "$RESPONSE" | grep -q "error\|Unauthorized"; then
        pass
    else
        fail "Should reject invalid credentials"
    fi
}

test_dashboard() {
    print_header "3. Dashboard API Tests"
    
    print_test "Dashboard Stats"
    if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/dashboard" | grep -q "200"; then
        pass
    else
        fail "Dashboard API failed"
    fi
}

test_datasets() {
    print_header "4. Data Catalog (Datasets) Tests"
    
    print_test "List Datasets"
    if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/datasets" | grep -q "200"; then
        pass
    else
        fail "Cannot list datasets"
    fi
    
    print_test "Create Dataset"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/datasets" \
        -H "Content-Type: application/json" \
        -d '{"name":"Test Dataset","source":"API Test","category":"OTHER","schema":{"type":"object"}}')
    
    if echo "$RESPONSE" | grep -q "id\|name"; then
        DATASET_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        pass
    else
        fail "Cannot create dataset"
    fi
    
    if [ ! -z "$DATASET_ID" ]; then
        print_test "Get Dataset Detail"
        if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/datasets/$DATASET_ID" | grep -q "200"; then
            pass
        else
            fail "Cannot get dataset detail"
        fi
        
        print_test "Update Dataset"
        if curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/api/datasets/$DATASET_ID" \
            -H "Content-Type: application/json" \
            -d '{"description":"Updated description"}' | grep -q "200"; then
            pass
        else
            fail "Cannot update dataset"
        fi
        
        print_test "Delete Dataset"
        if curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/api/datasets/$DATASET_ID" | grep -q "200"; then
            pass
        else
            fail "Cannot delete dataset"
        fi
    fi
}

test_registers() {
    print_header "5. API Registration Tests"
    
    print_test "List APIs"
    if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/registers" | grep -q "200"; then
        pass
    else
        fail "Cannot list APIs"
    fi
    
    print_test "Create API"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/registers" \
        -H "Content-Type: application/json" \
        -d '{
            "endpoint":"/test-api",
            "method":"GET",
            "backendUrl":"http://localhost:8080/test",
            "authType":"NONE",
            "status":"ACTIVE"
        }')
    
    if echo "$RESPONSE" | grep -q "id\|endpoint"; then
        API_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        pass
    else
        fail "Cannot create API"
    fi
    
    if [ ! -z "$API_ID" ]; then
        print_test "Get API Detail"
        if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/registers/$API_ID" | grep -q "200"; then
            pass
        else
            fail "Cannot get API detail"
        fi
        
        print_test "Update API Status"
        if curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/api/registers/$API_ID" \
            -H "Content-Type: application/json" \
            -d '{"status":"INACTIVE"}' | grep -q "200"; then
            pass
        else
            fail "Cannot update API"
        fi
        
        print_test "Delete API"
        if curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/api/registers/$API_ID" | grep -q "200"; then
            pass
        else
            fail "Cannot delete API"
        fi
    fi
}

test_flows() {
    print_header "6. Flow Integration Tests"
    
    print_test "List Flows"
    if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/flows" | grep -q "200"; then
        pass
    else
        fail "Cannot list flows"
    fi
    
    print_test "Create Flow"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/flows" \
        -H "Content-Type: application/json" \
        -d '{
            "name":"Test Flow",
            "description":"API Test Flow",
            "triggerType":"HTTP",
            "executionMode":"SYNC",
            "nodes":[
                {"id":"1","type":"httpRequest","label":"HTTP Request"},
                {"id":"2","type":"httpResponse","label":"HTTP Response"}
            ],
            "edges":[{"source":"1","target":"2"}]
        }')
    
    if echo "$RESPONSE" | grep -q "id\|name"; then
        FLOW_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        pass
    else
        fail "Cannot create flow"
    fi
    
    if [ ! -z "$FLOW_ID" ]; then
        print_test "Get Flow Detail"
        if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/flows/$FLOW_ID" | grep -q "200"; then
            pass
        else
            fail "Cannot get flow detail"
        fi
        
        print_test "Update Flow"
        if curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/api/flows/$FLOW_ID" \
            -H "Content-Type: application/json" \
            -d '{"description":"Updated flow"}' | grep -q "200"; then
            pass
        else
            fail "Cannot update flow"
        fi
        
        print_test "Deploy Flow"
        if curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/flows/$FLOW_ID/deploy" | grep -q "200\|201"; then
            pass
        else
            fail "Cannot deploy flow"
        fi
        
        print_test "Delete Flow"
        if curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/api/flows/$FLOW_ID" | grep -q "200"; then
            pass
        else
            fail "Cannot delete flow"
        fi
    fi
}

test_workers() {
    print_header "7. Worker Management Tests"
    
    print_test "Get Worker Status"
    if curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/broker/admin/workers" | grep -q "200"; then
        pass
    else
        fail "Cannot get worker status"
    fi
}

test_users() {
    print_header "8. User Management Tests"
    
    print_test "List Users"
    if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/users" | grep -q "200"; then
        pass
    else
        fail "Cannot list users"
    fi
    
    print_test "Create User"
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/users" \
        -H "Content-Type: application/json" \
        -d '{
            "username":"testuser",
            "email":"test@example.com",
            "password":"password123",
            "firstName":"Test",
            "lastName":"User",
            "roles":["user"],
            "isActive":true
        }')
    
    if echo "$RESPONSE" | grep -q "id\|username"; then
        USER_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        pass
    else
        fail "Cannot create user"
    fi
    
    if [ ! -z "$USER_ID" ]; then
        print_test "Get User Detail"
        if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/users/$USER_ID" | grep -q "200"; then
            pass
        else
            fail "Cannot get user detail"
        fi
        
        print_test "Update User"
        if curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/api/users/$USER_ID" \
            -H "Content-Type: application/json" \
            -d '{"department":"IT"}' | grep -q "200"; then
            pass
        else
            fail "Cannot update user"
        fi
        
        print_test "Delete User"
        if curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/api/users/$USER_ID" | grep -q "200"; then
            pass
        else
            fail "Cannot delete user"
        fi
    fi
}

test_system_info() {
    print_header "9. System Information Tests"
    
    print_test "Get System Status"
    # This is a mock endpoint - adjust based on actual implementation
    if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" | grep -q "200"; then
        pass
    else
        fail "Cannot get system status"
    fi
}

# Main execution
main() {
    print_header "Orch API TEST SUITE v0.2.1"
    echo "  Base URL: $BASE_URL"
    echo "  Gateway: $GATEWAY_URL"
    echo ""
    
    # Run tests
    test_health
    test_auth
    test_dashboard
    test_datasets
    test_registers
    test_flows
    test_workers
    test_users
    test_system_info
    
    # Summary
    print_header "TEST SUMMARY"
    echo -e "  ${GREEN}Passed: $PASSED${NC}"
    echo -e "  ${RED}Failed: $FAILED${NC}"
    echo "  Total: $((PASSED + FAILED))"
    echo ""
    
    if [ $FAILED -eq 0 ]; then
        echo -e "  ${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo -e "  ${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

# Run main
main
