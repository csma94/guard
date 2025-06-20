#!/bin/sh

# BahinLink Backend Production Startup Script
set -e

echo "Starting BahinLink Backend in production mode..."

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check if a service is ready
wait_for_service() {
    local host=$1
    local port=$2
    local service_name=$3
    local timeout=${4:-30}
    
    log "Waiting for $service_name to be ready at $host:$port..."
    
    for i in $(seq 1 $timeout); do
        if nc -z "$host" "$port" 2>/dev/null; then
            log "$service_name is ready!"
            return 0
        fi
        log "Waiting for $service_name... ($i/$timeout)"
        sleep 1
    done
    
    log "ERROR: $service_name is not ready after ${timeout}s"
    return 1
}

# Function to run database migrations
run_migrations() {
    log "Running database migrations..."
    
    if npx prisma migrate deploy; then
        log "Database migrations completed successfully"
    else
        log "ERROR: Database migrations failed"
        exit 1
    fi
}

# Function to seed initial data if needed
seed_data() {
    if [ "$SEED_DATA" = "true" ]; then
        log "Seeding initial data..."
        
        if npx prisma db seed; then
            log "Data seeding completed successfully"
        else
            log "WARNING: Data seeding failed, continuing anyway"
        fi
    fi
}

# Function to validate environment variables
validate_environment() {
    log "Validating environment variables..."
    
    required_vars="DATABASE_URL REDIS_URL JWT_SECRET"
    
    for var in $required_vars; do
        if [ -z "$(eval echo \$$var)" ]; then
            log "ERROR: Required environment variable $var is not set"
            exit 1
        fi
    done
    
    log "Environment validation passed"
}

# Function to check disk space
check_disk_space() {
    log "Checking disk space..."
    
    available_space=$(df /app | awk 'NR==2 {print $4}')
    min_space=1048576  # 1GB in KB
    
    if [ "$available_space" -lt "$min_space" ]; then
        log "WARNING: Low disk space available: ${available_space}KB"
    else
        log "Disk space check passed: ${available_space}KB available"
    fi
}

# Function to setup logging
setup_logging() {
    log "Setting up logging..."
    
    # Create log directory if it doesn't exist
    mkdir -p /app/logs
    
    # Set log file permissions
    touch /app/logs/application.log
    touch /app/logs/error.log
    touch /app/logs/access.log
    
    log "Logging setup completed"
}

# Function to cleanup old logs
cleanup_logs() {
    if [ "$LOG_CLEANUP_ENABLED" = "true" ]; then
        log "Cleaning up old log files..."
        
        # Remove logs older than 30 days
        find /app/logs -name "*.log" -type f -mtime +30 -delete 2>/dev/null || true
        
        log "Log cleanup completed"
    fi
}

# Function to start the application
start_application() {
    log "Starting BahinLink Backend application..."
    
    # Set NODE_OPTIONS for production optimization
    export NODE_OPTIONS="--max-old-space-size=1024 --optimize-for-size"
    
    # Start the application based on cluster mode
    if [ "$CLUSTER_MODE" = "true" ]; then
        log "Starting in cluster mode..."
        exec node dist/cluster.js
    else
        log "Starting in single process mode..."
        exec node dist/server.js
    fi
}

# Function to handle graceful shutdown
cleanup() {
    log "Received shutdown signal, cleaning up..."
    
    # Kill background processes
    jobs -p | xargs -r kill
    
    # Wait for processes to finish
    wait
    
    log "Cleanup completed, exiting..."
    exit 0
}

# Set up signal handlers
trap cleanup TERM INT

# Main execution
main() {
    log "BahinLink Backend startup initiated"
    
    # Validate environment
    validate_environment
    
    # Check system resources
    check_disk_space
    
    # Setup logging
    setup_logging
    
    # Cleanup old logs
    cleanup_logs
    
    # Wait for dependencies
    if [ -n "$DATABASE_HOST" ] && [ -n "$DATABASE_PORT" ]; then
        wait_for_service "$DATABASE_HOST" "$DATABASE_PORT" "Database" 60
    fi
    
    if [ -n "$REDIS_HOST" ] && [ -n "$REDIS_PORT" ]; then
        wait_for_service "$REDIS_HOST" "$REDIS_PORT" "Redis" 30
    fi
    
    # Run database migrations
    if [ "$AUTO_MIGRATE" = "true" ]; then
        run_migrations
    fi
    
    # Seed data if needed
    seed_data
    
    # Start the application
    start_application
}

# Execute main function
main "$@"
