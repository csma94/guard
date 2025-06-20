#!/bin/sh

# BahinLink Backend Health Check Script
set -e

# Configuration
HEALTH_ENDPOINT="${HEALTH_CHECK_PATH:-/health}"
PORT="${PORT:-3000}"
TIMEOUT="${HEALTH_CHECK_TIMEOUT:-5}"
MAX_RETRIES=3
RETRY_DELAY=1

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] HEALTH: $1"
}

# Function to check HTTP endpoint
check_http_endpoint() {
    local endpoint=$1
    local expected_status=${2:-200}
    
    log "Checking HTTP endpoint: $endpoint"
    
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time "$TIMEOUT" \
        --connect-timeout "$TIMEOUT" \
        "http://localhost:${PORT}${endpoint}" 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        log "HTTP endpoint check passed: $endpoint (status: $response)"
        return 0
    else
        log "HTTP endpoint check failed: $endpoint (status: $response, expected: $expected_status)"
        return 1
    fi
}

# Function to check database connectivity
check_database() {
    log "Checking database connectivity..."
    
    if check_http_endpoint "/health/database" 200; then
        log "Database connectivity check passed"
        return 0
    else
        log "Database connectivity check failed"
        return 1
    fi
}

# Function to check Redis connectivity
check_redis() {
    log "Checking Redis connectivity..."
    
    if check_http_endpoint "/health/redis" 200; then
        log "Redis connectivity check passed"
        return 0
    else
        log "Redis connectivity check failed"
        return 1
    fi
}

# Function to check memory usage
check_memory() {
    log "Checking memory usage..."
    
    if check_http_endpoint "/health/memory" 200; then
        log "Memory usage check passed"
        return 0
    else
        log "Memory usage check failed"
        return 1
    fi
}

# Function to check disk space
check_disk_space() {
    log "Checking disk space..."
    
    # Check available disk space (in KB)
    available_space=$(df /app | awk 'NR==2 {print $4}')
    min_space=102400  # 100MB in KB
    
    if [ "$available_space" -gt "$min_space" ]; then
        log "Disk space check passed: ${available_space}KB available"
        return 0
    else
        log "Disk space check failed: ${available_space}KB available (minimum: ${min_space}KB)"
        return 1
    fi
}

# Function to check process status
check_process() {
    log "Checking process status..."
    
    # Check if the main process is running
    if pgrep -f "node.*server.js\|node.*cluster.js" > /dev/null; then
        log "Process status check passed"
        return 0
    else
        log "Process status check failed: main process not found"
        return 1
    fi
}

# Function to check WebSocket connectivity
check_websocket() {
    if [ "$WS_HEALTH_CHECK_ENABLED" = "true" ]; then
        log "Checking WebSocket connectivity..."
        
        if check_http_endpoint "/health/websocket" 200; then
            log "WebSocket connectivity check passed"
            return 0
        else
            log "WebSocket connectivity check failed"
            return 1
        fi
    else
        log "WebSocket health check disabled"
        return 0
    fi
}

# Function to perform comprehensive health check
comprehensive_health_check() {
    local failed_checks=0
    
    log "Starting comprehensive health check..."
    
    # Basic HTTP health check
    if ! check_http_endpoint "$HEALTH_ENDPOINT" 200; then
        failed_checks=$((failed_checks + 1))
    fi
    
    # Database connectivity
    if ! check_database; then
        failed_checks=$((failed_checks + 1))
    fi
    
    # Redis connectivity
    if ! check_redis; then
        failed_checks=$((failed_checks + 1))
    fi
    
    # Memory usage
    if ! check_memory; then
        failed_checks=$((failed_checks + 1))
    fi
    
    # Disk space
    if ! check_disk_space; then
        failed_checks=$((failed_checks + 1))
    fi
    
    # Process status
    if ! check_process; then
        failed_checks=$((failed_checks + 1))
    fi
    
    # WebSocket connectivity
    if ! check_websocket; then
        failed_checks=$((failed_checks + 1))
    fi
    
    if [ $failed_checks -eq 0 ]; then
        log "Comprehensive health check passed"
        return 0
    else
        log "Comprehensive health check failed: $failed_checks checks failed"
        return 1
    fi
}

# Function to perform quick health check
quick_health_check() {
    log "Starting quick health check..."
    
    if check_http_endpoint "$HEALTH_ENDPOINT" 200; then
        log "Quick health check passed"
        return 0
    else
        log "Quick health check failed"
        return 1
    fi
}

# Function to perform readiness check
readiness_check() {
    log "Starting readiness check..."
    
    if check_http_endpoint "/ready" 200; then
        log "Readiness check passed"
        return 0
    else
        log "Readiness check failed"
        return 1
    fi
}

# Function to perform liveness check
liveness_check() {
    log "Starting liveness check..."
    
    if check_http_endpoint "/health/live" 200; then
        log "Liveness check passed"
        return 0
    else
        log "Liveness check failed"
        return 1
    fi
}

# Function to retry health check
retry_health_check() {
    local check_function=$1
    local retries=0
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if $check_function; then
            return 0
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            log "Health check failed, retrying in ${RETRY_DELAY}s... (attempt $retries/$MAX_RETRIES)"
            sleep $RETRY_DELAY
        fi
    done
    
    log "Health check failed after $MAX_RETRIES attempts"
    return 1
}

# Main health check function
main() {
    local check_type="${1:-quick}"
    
    case "$check_type" in
        "comprehensive"|"full")
            retry_health_check comprehensive_health_check
            ;;
        "readiness"|"ready")
            retry_health_check readiness_check
            ;;
        "liveness"|"live")
            retry_health_check liveness_check
            ;;
        "quick"|*)
            retry_health_check quick_health_check
            ;;
    esac
    
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        log "Health check completed successfully"
    else
        log "Health check failed"
    fi
    
    exit $exit_code
}

# Execute main function with arguments
main "$@"
