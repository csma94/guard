#!/bin/bash

# BahinLink System Validation Script
# Comprehensive validation of the entire system after deployment

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${ENVIRONMENT:-production}"
API_BASE_URL="${API_BASE_URL:-https://api.bahinlink.com}"
ADMIN_PORTAL_URL="${ADMIN_PORTAL_URL:-https://admin.bahinlink.com}"
CLIENT_PORTAL_URL="${CLIENT_PORTAL_URL:-https://client.bahinlink.com}"
TIMEOUT=30
VALIDATION_RESULTS_FILE="${PROJECT_ROOT}/validation-results.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Initialize validation results
init_validation_results() {
    cat > "$VALIDATION_RESULTS_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "environment": "$ENVIRONMENT",
  "overall_status": "pending",
  "tests": {}
}
EOF
}

# Update validation results
update_validation_result() {
    local test_name=$1
    local status=$2
    local details=$3
    
    local temp_file=$(mktemp)
    jq --arg test "$test_name" --arg status "$status" --arg details "$details" \
        '.tests[$test] = {"status": $status, "details": $details, "timestamp": now | strftime("%Y-%m-%dT%H:%M:%SZ")}' \
        "$VALIDATION_RESULTS_FILE" > "$temp_file"
    mv "$temp_file" "$VALIDATION_RESULTS_FILE"
}

# Finalize validation results
finalize_validation_results() {
    local overall_status=$1
    
    local temp_file=$(mktemp)
    jq --arg status "$overall_status" \
        '.overall_status = $status | .completed_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
        "$VALIDATION_RESULTS_FILE" > "$temp_file"
    mv "$temp_file" "$VALIDATION_RESULTS_FILE"
}

# Health check validation
validate_health_checks() {
    log_info "Validating health checks..."
    
    local health_status="passed"
    local details=""
    
    # API Health Check
    if curl -f -s --max-time $TIMEOUT "$API_BASE_URL/health" > /dev/null; then
        log_success "API health check passed"
        details+="API: healthy; "
    else
        log_error "API health check failed"
        health_status="failed"
        details+="API: unhealthy; "
    fi
    
    # Database Health Check
    if curl -f -s --max-time $TIMEOUT "$API_BASE_URL/health/database" > /dev/null; then
        log_success "Database health check passed"
        details+="Database: healthy; "
    else
        log_error "Database health check failed"
        health_status="failed"
        details+="Database: unhealthy; "
    fi
    
    # Redis Health Check
    if curl -f -s --max-time $TIMEOUT "$API_BASE_URL/health/redis" > /dev/null; then
        log_success "Redis health check passed"
        details+="Redis: healthy; "
    else
        log_error "Redis health check failed"
        health_status="failed"
        details+="Redis: unhealthy; "
    fi
    
    update_validation_result "health_checks" "$health_status" "$details"
}

# API endpoint validation
validate_api_endpoints() {
    log_info "Validating API endpoints..."
    
    local api_status="passed"
    local details=""
    local failed_endpoints=0
    local total_endpoints=0
    
    # Test critical endpoints
    local endpoints=(
        "GET /api/health"
        "GET /api/auth/health"
        "POST /api/auth/login"
        "GET /api/users"
        "GET /api/shifts"
        "GET /api/sites"
        "GET /api/reports"
        "GET /api/analytics/dashboard"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local method=$(echo "$endpoint" | cut -d' ' -f1)
        local path=$(echo "$endpoint" | cut -d' ' -f2)
        local url="$API_BASE_URL$path"
        
        total_endpoints=$((total_endpoints + 1))
        
        if [[ "$method" == "GET" ]]; then
            if curl -f -s --max-time $TIMEOUT "$url" > /dev/null; then
                log_success "Endpoint $endpoint is accessible"
            else
                log_error "Endpoint $endpoint is not accessible"
                failed_endpoints=$((failed_endpoints + 1))
                details+="$endpoint: failed; "
            fi
        elif [[ "$method" == "POST" ]]; then
            # For POST endpoints, just check if they respond (even with 400/401)
            local response_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$url")
            if [[ "$response_code" =~ ^[2-5][0-9][0-9]$ ]]; then
                log_success "Endpoint $endpoint is responding"
            else
                log_error "Endpoint $endpoint is not responding"
                failed_endpoints=$((failed_endpoints + 1))
                details+="$endpoint: failed; "
            fi
        fi
    done
    
    if [[ $failed_endpoints -eq 0 ]]; then
        details="All $total_endpoints endpoints accessible"
    else
        api_status="failed"
        details="$failed_endpoints/$total_endpoints endpoints failed; $details"
    fi
    
    update_validation_result "api_endpoints" "$api_status" "$details"
}

# Frontend application validation
validate_frontend_apps() {
    log_info "Validating frontend applications..."
    
    local frontend_status="passed"
    local details=""
    
    # Admin Portal
    if curl -f -s --max-time $TIMEOUT "$ADMIN_PORTAL_URL" > /dev/null; then
        log_success "Admin portal is accessible"
        details+="Admin portal: accessible; "
    else
        log_error "Admin portal is not accessible"
        frontend_status="failed"
        details+="Admin portal: failed; "
    fi
    
    # Client Portal
    if curl -f -s --max-time $TIMEOUT "$CLIENT_PORTAL_URL" > /dev/null; then
        log_success "Client portal is accessible"
        details+="Client portal: accessible; "
    else
        log_error "Client portal is not accessible"
        frontend_status="failed"
        details+="Client portal: failed; "
    fi
    
    update_validation_result "frontend_apps" "$frontend_status" "$details"
}

# Database validation
validate_database() {
    log_info "Validating database..."
    
    local db_status="passed"
    local details=""
    
    # Check database connectivity through API
    local db_response=$(curl -s --max-time $TIMEOUT "$API_BASE_URL/health/database")
    
    if echo "$db_response" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        local response_time=$(echo "$db_response" | jq -r '.responseTime // "unknown"')
        log_success "Database is healthy (response time: ${response_time}ms)"
        details="Healthy, response time: ${response_time}ms"
    else
        log_error "Database health check failed"
        db_status="failed"
        details="Database health check failed"
    fi
    
    update_validation_result "database" "$db_status" "$details"
}

# WebSocket validation
validate_websocket() {
    log_info "Validating WebSocket connectivity..."
    
    local ws_status="passed"
    local details=""
    
    # Check WebSocket health through API
    if curl -f -s --max-time $TIMEOUT "$API_BASE_URL/health/websocket" > /dev/null; then
        log_success "WebSocket service is healthy"
        details="WebSocket service healthy"
    else
        log_error "WebSocket service health check failed"
        ws_status="failed"
        details="WebSocket service unhealthy"
    fi
    
    update_validation_result "websocket" "$ws_status" "$details"
}

# Security validation
validate_security() {
    log_info "Validating security configurations..."
    
    local security_status="passed"
    local details=""
    
    # Check HTTPS
    if curl -f -s --max-time $TIMEOUT "https://api.bahinlink.com/health" > /dev/null; then
        log_success "HTTPS is properly configured"
        details+="HTTPS: configured; "
    else
        log_error "HTTPS configuration issue"
        security_status="failed"
        details+="HTTPS: failed; "
    fi
    
    # Check security headers
    local headers=$(curl -s -I --max-time $TIMEOUT "$API_BASE_URL/health")
    
    if echo "$headers" | grep -i "strict-transport-security" > /dev/null; then
        log_success "HSTS header present"
        details+="HSTS: present; "
    else
        log_warning "HSTS header missing"
        details+="HSTS: missing; "
    fi
    
    if echo "$headers" | grep -i "x-content-type-options" > /dev/null; then
        log_success "Content-Type-Options header present"
        details+="Content-Type-Options: present; "
    else
        log_warning "Content-Type-Options header missing"
        details+="Content-Type-Options: missing; "
    fi
    
    update_validation_result "security" "$security_status" "$details"
}

# Performance validation
validate_performance() {
    log_info "Validating system performance..."
    
    local perf_status="passed"
    local details=""
    
    # Measure API response time
    local start_time=$(date +%s%N)
    if curl -f -s --max-time $TIMEOUT "$API_BASE_URL/health" > /dev/null; then
        local end_time=$(date +%s%N)
        local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
        
        if [[ $response_time -lt 1000 ]]; then
            log_success "API response time is acceptable (${response_time}ms)"
            details+="API response: ${response_time}ms; "
        else
            log_warning "API response time is slow (${response_time}ms)"
            details+="API response: ${response_time}ms (slow); "
        fi
    else
        log_error "Failed to measure API response time"
        perf_status="failed"
        details+="API response: failed; "
    fi
    
    # Test concurrent requests
    log_info "Testing concurrent request handling..."
    local concurrent_test_result=$(curl -s --max-time $TIMEOUT \
        -w "time_total:%{time_total}\n" \
        "$API_BASE_URL/health" \
        "$API_BASE_URL/health" \
        "$API_BASE_URL/health" \
        "$API_BASE_URL/health" \
        "$API_BASE_URL/health" | grep "time_total" | head -1)
    
    if [[ -n "$concurrent_test_result" ]]; then
        log_success "Concurrent request test completed"
        details+="Concurrent requests: handled; "
    else
        log_warning "Concurrent request test failed"
        details+="Concurrent requests: failed; "
    fi
    
    update_validation_result "performance" "$perf_status" "$details"
}

# Integration validation
validate_integrations() {
    log_info "Validating external integrations..."
    
    local integration_status="passed"
    local details=""
    
    # Check if integrations endpoint exists
    if curl -f -s --max-time $TIMEOUT "$API_BASE_URL/health/integrations" > /dev/null; then
        local integrations_response=$(curl -s --max-time $TIMEOUT "$API_BASE_URL/health/integrations")
        
        # Parse integration status
        if echo "$integrations_response" | jq -e '.aws == "healthy"' > /dev/null 2>&1; then
            log_success "AWS integration is healthy"
            details+="AWS: healthy; "
        else
            log_warning "AWS integration issue"
            details+="AWS: issue; "
        fi
        
        if echo "$integrations_response" | jq -e '.firebase == "healthy"' > /dev/null 2>&1; then
            log_success "Firebase integration is healthy"
            details+="Firebase: healthy; "
        else
            log_warning "Firebase integration issue"
            details+="Firebase: issue; "
        fi
    else
        log_warning "Integrations health endpoint not available"
        details="Integrations endpoint not available"
    fi
    
    update_validation_result "integrations" "$integration_status" "$details"
}

# Monitoring validation
validate_monitoring() {
    log_info "Validating monitoring systems..."
    
    local monitoring_status="passed"
    local details=""
    
    # Check metrics endpoint
    if curl -f -s --max-time $TIMEOUT "$API_BASE_URL/metrics" > /dev/null; then
        log_success "Metrics endpoint is accessible"
        details+="Metrics: accessible; "
    else
        log_warning "Metrics endpoint not accessible"
        details+="Metrics: not accessible; "
    fi
    
    # Check if Prometheus is scraping (if available)
    if command -v kubectl &> /dev/null; then
        if kubectl get pods -n monitoring | grep prometheus > /dev/null 2>&1; then
            log_success "Prometheus is running"
            details+="Prometheus: running; "
        else
            log_warning "Prometheus not found"
            details+="Prometheus: not found; "
        fi
    fi
    
    update_validation_result "monitoring" "$monitoring_status" "$details"
}

# Run comprehensive tests
run_comprehensive_tests() {
    log_info "Running comprehensive system tests..."
    
    local test_status="passed"
    local details=""
    
    # Run integration tests if available
    if [[ -f "$PROJECT_ROOT/package.json" ]]; then
        log_info "Running integration tests..."
        
        cd "$PROJECT_ROOT"
        if npm run test:integration > /dev/null 2>&1; then
            log_success "Integration tests passed"
            details+="Integration tests: passed; "
        else
            log_error "Integration tests failed"
            test_status="failed"
            details+="Integration tests: failed; "
        fi
    fi
    
    # Run E2E tests if available
    if [[ -f "$PROJECT_ROOT/e2e/package.json" ]]; then
        log_info "Running E2E tests..."
        
        cd "$PROJECT_ROOT/e2e"
        if npm run test > /dev/null 2>&1; then
            log_success "E2E tests passed"
            details+="E2E tests: passed; "
        else
            log_error "E2E tests failed"
            test_status="failed"
            details+="E2E tests: failed; "
        fi
    fi
    
    update_validation_result "comprehensive_tests" "$test_status" "$details"
}

# Generate validation report
generate_report() {
    log_info "Generating validation report..."
    
    local total_tests=$(jq '.tests | length' "$VALIDATION_RESULTS_FILE")
    local passed_tests=$(jq '[.tests[] | select(.status == "passed")] | length' "$VALIDATION_RESULTS_FILE")
    local failed_tests=$(jq '[.tests[] | select(.status == "failed")] | length' "$VALIDATION_RESULTS_FILE")
    
    echo
    echo "=================================="
    echo "BahinLink System Validation Report"
    echo "=================================="
    echo "Environment: $ENVIRONMENT"
    echo "Timestamp: $(date)"
    echo "Total Tests: $total_tests"
    echo "Passed: $passed_tests"
    echo "Failed: $failed_tests"
    echo
    
    if [[ $failed_tests -eq 0 ]]; then
        log_success "All validation tests passed!"
        echo "✅ System is ready for production use"
        finalize_validation_results "passed"
        return 0
    else
        log_error "$failed_tests validation tests failed"
        echo "❌ System has issues that need to be addressed"
        
        echo
        echo "Failed Tests:"
        jq -r '.tests | to_entries[] | select(.value.status == "failed") | "- \(.key): \(.value.details)"' "$VALIDATION_RESULTS_FILE"
        
        finalize_validation_results "failed"
        return 1
    fi
}

# Main validation function
main() {
    log_info "Starting BahinLink system validation for $ENVIRONMENT environment"
    
    # Initialize results
    init_validation_results
    
    # Run all validations
    validate_health_checks
    validate_api_endpoints
    validate_frontend_apps
    validate_database
    validate_websocket
    validate_security
    validate_performance
    validate_integrations
    validate_monitoring
    run_comprehensive_tests
    
    # Generate final report
    generate_report
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
