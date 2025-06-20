#!/bin/bash

# BahinLink Integration Test Script
# This script runs comprehensive integration tests across all components

set -e

# Configuration
API_URL=${API_URL:-"http://localhost:3001"}
ADMIN_PORTAL_URL=${ADMIN_PORTAL_URL:-"http://localhost:3002"}
CLIENT_PORTAL_URL=${CLIENT_PORTAL_URL:-"http://localhost:3003"}
TEST_TIMEOUT=${TEST_TIMEOUT:-300}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((TESTS_FAILED++))
    FAILED_TESTS+=("$1")
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Wait for service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for ${service_name} to be ready..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f "${url}/health" &> /dev/null || curl -f "${url}" &> /dev/null; then
            log_success "${service_name} is ready"
            return 0
        fi
        
        log_info "Waiting for ${service_name}... (attempt ${attempt}/${max_attempts})"
        sleep 10
        ((attempt++))
    done
    
    log_error "${service_name} failed to start after ${max_attempts} attempts"
    return 1
}

# Test API endpoints
test_api_endpoints() {
    log_info "Testing API endpoints..."
    
    # Test health endpoint
    if curl -f "${API_URL}/health" &> /dev/null; then
        log_success "API health endpoint working"
    else
        log_error "API health endpoint failed"
        return 1
    fi
    
    # Test authentication
    local login_response=$(curl -s -X POST "${API_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"testadmin","password":"testpassword123"}')
    
    if echo "$login_response" | grep -q "token"; then
        log_success "API authentication working"
        
        # Extract token for further tests
        local token=$(echo "$login_response" | jq -r '.token')
        
        # Test protected endpoint
        if curl -f -H "Authorization: Bearer $token" "${API_URL}/api/users" &> /dev/null; then
            log_success "API protected endpoints working"
        else
            log_error "API protected endpoints failed"
        fi
    else
        log_error "API authentication failed"
    fi
}

# Test database connectivity
test_database() {
    log_info "Testing database connectivity..."
    
    # Test database connection through API
    local response=$(curl -s -X GET "${API_URL}/api/health/database")
    
    if echo "$response" | grep -q "healthy"; then
        log_success "Database connectivity working"
    else
        log_error "Database connectivity failed"
    fi
}

# Test Redis connectivity
test_redis() {
    log_info "Testing Redis connectivity..."
    
    # Test Redis connection through API
    local response=$(curl -s -X GET "${API_URL}/api/health/redis")
    
    if echo "$response" | grep -q "healthy"; then
        log_success "Redis connectivity working"
    else
        log_error "Redis connectivity failed"
    fi
}

# Test WebSocket connectivity
test_websocket() {
    log_info "Testing WebSocket connectivity..."
    
    # Use a simple WebSocket test
    if command -v wscat &> /dev/null; then
        timeout 10s wscat -c "${API_URL/http/ws}/socket.io/?EIO=4&transport=websocket" &> /dev/null
        if [[ $? -eq 0 ]]; then
            log_success "WebSocket connectivity working"
        else
            log_error "WebSocket connectivity failed"
        fi
    else
        log_warning "wscat not available, skipping WebSocket test"
    fi
}

# Test file upload functionality
test_file_upload() {
    log_info "Testing file upload functionality..."
    
    # Create a test file
    echo "Test file content" > /tmp/test_upload.txt
    
    # Login to get token
    local login_response=$(curl -s -X POST "${API_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"testadmin","password":"testpassword123"}')
    
    local token=$(echo "$login_response" | jq -r '.token')
    
    # Test file upload
    local upload_response=$(curl -s -X POST "${API_URL}/api/upload" \
        -H "Authorization: Bearer $token" \
        -F "file=@/tmp/test_upload.txt")
    
    if echo "$upload_response" | grep -q "success"; then
        log_success "File upload functionality working"
    else
        log_error "File upload functionality failed"
    fi
    
    # Clean up
    rm -f /tmp/test_upload.txt
}

# Test admin portal
test_admin_portal() {
    log_info "Testing Admin Portal..."
    
    # Test if admin portal loads
    if curl -f "${ADMIN_PORTAL_URL}" &> /dev/null; then
        log_success "Admin Portal loads successfully"
        
        # Test if static assets load
        if curl -f "${ADMIN_PORTAL_URL}/static/js/" &> /dev/null; then
            log_success "Admin Portal static assets working"
        else
            log_warning "Admin Portal static assets may have issues"
        fi
    else
        log_error "Admin Portal failed to load"
    fi
}

# Test client portal
test_client_portal() {
    log_info "Testing Client Portal..."
    
    # Test if client portal loads
    if curl -f "${CLIENT_PORTAL_URL}" &> /dev/null; then
        log_success "Client Portal loads successfully"
        
        # Test if static assets load
        if curl -f "${CLIENT_PORTAL_URL}/static/js/" &> /dev/null; then
            log_success "Client Portal static assets working"
        else
            log_warning "Client Portal static assets may have issues"
        fi
    else
        log_error "Client Portal failed to load"
    fi
}

# Test end-to-end workflow
test_e2e_workflow() {
    log_info "Testing end-to-end workflow..."
    
    # Login as admin
    local admin_token=$(curl -s -X POST "${API_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"testadmin","password":"testpassword123"}' | jq -r '.token')
    
    if [[ "$admin_token" != "null" && "$admin_token" != "" ]]; then
        # Create a test shift
        local shift_response=$(curl -s -X POST "${API_URL}/api/shifts" \
            -H "Authorization: Bearer $admin_token" \
            -H "Content-Type: application/json" \
            -d '{
                "siteId": "test-site-1",
                "agentId": "test-agent-1",
                "startTime": "'$(date -d "+1 hour" -Iseconds)'",
                "endTime": "'$(date -d "+9 hours" -Iseconds)'",
                "shiftType": "REGULAR"
            }')
        
        if echo "$shift_response" | grep -q "id"; then
            log_success "End-to-end shift creation working"
            
            # Get shift ID for cleanup
            local shift_id=$(echo "$shift_response" | jq -r '.shift.id')
            
            # Clean up test shift
            curl -s -X DELETE "${API_URL}/api/shifts/$shift_id" \
                -H "Authorization: Bearer $admin_token" &> /dev/null
        else
            log_error "End-to-end shift creation failed"
        fi
    else
        log_error "End-to-end workflow failed - authentication issue"
    fi
}

# Test performance
test_performance() {
    log_info "Testing basic performance..."
    
    # Test API response time
    local start_time=$(date +%s%N)
    curl -f "${API_URL}/health" &> /dev/null
    local end_time=$(date +%s%N)
    local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    if [[ $response_time -lt 1000 ]]; then
        log_success "API response time acceptable (${response_time}ms)"
    else
        log_warning "API response time slow (${response_time}ms)"
    fi
    
    # Test concurrent requests
    log_info "Testing concurrent requests..."
    for i in {1..10}; do
        curl -f "${API_URL}/health" &> /dev/null &
    done
    wait
    
    log_success "Concurrent requests test completed"
}

# Test security headers
test_security() {
    log_info "Testing security headers..."
    
    local headers=$(curl -s -I "${API_URL}/health")
    
    # Check for security headers
    if echo "$headers" | grep -q "X-Content-Type-Options"; then
        log_success "X-Content-Type-Options header present"
    else
        log_error "X-Content-Type-Options header missing"
    fi
    
    if echo "$headers" | grep -q "X-Frame-Options"; then
        log_success "X-Frame-Options header present"
    else
        log_error "X-Frame-Options header missing"
    fi
    
    if echo "$headers" | grep -q "X-XSS-Protection"; then
        log_success "X-XSS-Protection header present"
    else
        log_error "X-XSS-Protection header missing"
    fi
}

# Generate test report
generate_report() {
    log_info "Generating test report..."
    
    local total_tests=$((TESTS_PASSED + TESTS_FAILED))
    local success_rate=$(( TESTS_PASSED * 100 / total_tests ))
    
    echo ""
    echo "=================================="
    echo "    INTEGRATION TEST REPORT"
    echo "=================================="
    echo "Total Tests: $total_tests"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"
    echo "Success Rate: $success_rate%"
    echo ""
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo "Failed Tests:"
        for test in "${FAILED_TESTS[@]}"; do
            echo "  - $test"
        done
        echo ""
    fi
    
    if [[ $success_rate -ge 90 ]]; then
        log_success "Integration tests PASSED with $success_rate% success rate"
        return 0
    else
        log_error "Integration tests FAILED with $success_rate% success rate"
        return 1
    fi
}

# Main test function
main() {
    log_info "Starting BahinLink Integration Tests..."
    
    # Wait for services to be ready
    wait_for_service "$API_URL" "API"
    wait_for_service "$ADMIN_PORTAL_URL" "Admin Portal"
    wait_for_service "$CLIENT_PORTAL_URL" "Client Portal"
    
    # Run tests
    test_api_endpoints
    test_database
    test_redis
    test_websocket
    test_file_upload
    test_admin_portal
    test_client_portal
    test_e2e_workflow
    test_performance
    test_security
    
    # Generate report
    generate_report
}

# Run main function
main "$@"
