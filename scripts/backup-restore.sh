#!/bin/bash

# BahinLink Backup and Disaster Recovery Script
# This script provides comprehensive backup and restore capabilities

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/bahinlink}"
S3_BUCKET="${S3_BUCKET:-bahinlink-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check required tools
    local required_tools=("kubectl" "pg_dump" "pg_restore" "aws" "gpg")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "$tool is required but not installed"
            exit 1
        fi
    done
    
    # Check environment variables
    if [[ -z "${DATABASE_URL:-}" ]]; then
        log_error "DATABASE_URL environment variable is required"
        exit 1
    fi
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    log_success "Prerequisites check completed"
}

# Database backup
backup_database() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/database_backup_$timestamp.sql"
    local compressed_file="$backup_file.gz"
    local encrypted_file="$compressed_file.gpg"
    
    log_info "Starting database backup..."
    
    # Extract database connection details
    local db_url="${DATABASE_URL}"
    local db_host=$(echo "$db_url" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    local db_port=$(echo "$db_url" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    local db_name=$(echo "$db_url" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    local db_user=$(echo "$db_url" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    
    # Create database backup
    log_info "Creating database dump..."
    PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
        -h "$db_host" \
        -p "$db_port" \
        -U "$db_user" \
        -d "$db_name" \
        --verbose \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        > "$backup_file"
    
    # Compress backup
    log_info "Compressing backup..."
    gzip "$backup_file"
    
    # Encrypt backup if encryption key is provided
    if [[ -n "$ENCRYPTION_KEY" ]]; then
        log_info "Encrypting backup..."
        echo "$ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 --symmetric --cipher-algo AES256 "$compressed_file"
        rm "$compressed_file"
        compressed_file="$encrypted_file"
    fi
    
    # Upload to S3
    if command -v aws &> /dev/null && [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
        log_info "Uploading backup to S3..."
        aws s3 cp "$compressed_file" "s3://$S3_BUCKET/database/$(basename "$compressed_file")"
        
        # Set lifecycle policy for automatic cleanup
        aws s3api put-object-tagging \
            --bucket "$S3_BUCKET" \
            --key "database/$(basename "$compressed_file")" \
            --tagging "TagSet=[{Key=RetentionDays,Value=$RETENTION_DAYS}]"
    fi
    
    log_success "Database backup completed: $compressed_file"
    echo "$compressed_file"
}

# Application files backup
backup_application_files() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/app_files_backup_$timestamp.tar.gz"
    local encrypted_file="$backup_file.gpg"
    
    log_info "Starting application files backup..."
    
    # Create tar archive of important files
    tar -czf "$backup_file" \
        -C "$PROJECT_ROOT" \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='logs' \
        --exclude='coverage' \
        --exclude='dist' \
        --exclude='build' \
        uploads/ \
        config/ \
        k8s/ \
        scripts/ \
        package.json \
        package-lock.json \
        docker-compose.yml \
        Dockerfile \
        .env.example
    
    # Encrypt if encryption key is provided
    if [[ -n "$ENCRYPTION_KEY" ]]; then
        log_info "Encrypting application files backup..."
        echo "$ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 --symmetric --cipher-algo AES256 "$backup_file"
        rm "$backup_file"
        backup_file="$encrypted_file"
    fi
    
    # Upload to S3
    if command -v aws &> /dev/null && [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
        log_info "Uploading application files to S3..."
        aws s3 cp "$backup_file" "s3://$S3_BUCKET/application/$(basename "$backup_file")"
    fi
    
    log_success "Application files backup completed: $backup_file"
    echo "$backup_file"
}

# Kubernetes configuration backup
backup_kubernetes_config() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/k8s_config_backup_$timestamp.yaml"
    local compressed_file="$backup_file.gz"
    
    log_info "Starting Kubernetes configuration backup..."
    
    # Export all Kubernetes resources
    kubectl get all,configmaps,secrets,pvc,ingress -n bahinlink -o yaml > "$backup_file"
    
    # Compress
    gzip "$backup_file"
    
    # Upload to S3
    if command -v aws &> /dev/null && [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
        log_info "Uploading Kubernetes config to S3..."
        aws s3 cp "$compressed_file" "s3://$S3_BUCKET/kubernetes/$(basename "$compressed_file")"
    fi
    
    log_success "Kubernetes configuration backup completed: $compressed_file"
    echo "$compressed_file"
}

# Full system backup
backup_full_system() {
    log_info "Starting full system backup..."
    
    local db_backup=$(backup_database)
    local app_backup=$(backup_application_files)
    local k8s_backup=$(backup_kubernetes_config)
    
    # Create backup manifest
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local manifest_file="$BACKUP_DIR/backup_manifest_$timestamp.json"
    
    cat > "$manifest_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "version": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "backups": {
    "database": "$(basename "$db_backup")",
    "application": "$(basename "$app_backup")",
    "kubernetes": "$(basename "$k8s_backup")"
  },
  "retention_days": $RETENTION_DAYS
}
EOF
    
    # Upload manifest to S3
    if command -v aws &> /dev/null && [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
        aws s3 cp "$manifest_file" "s3://$S3_BUCKET/manifests/$(basename "$manifest_file")"
    fi
    
    log_success "Full system backup completed. Manifest: $manifest_file"
}

# Restore database
restore_database() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log_info "Starting database restore from: $backup_file"
    
    # Decrypt if needed
    local restore_file="$backup_file"
    if [[ "$backup_file" == *.gpg ]]; then
        if [[ -z "$ENCRYPTION_KEY" ]]; then
            log_error "Encryption key required to decrypt backup"
            exit 1
        fi
        
        log_info "Decrypting backup..."
        local decrypted_file="${backup_file%.gpg}"
        echo "$ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 --decrypt "$backup_file" > "$decrypted_file"
        restore_file="$decrypted_file"
    fi
    
    # Decompress if needed
    if [[ "$restore_file" == *.gz ]]; then
        log_info "Decompressing backup..."
        gunzip -c "$restore_file" > "${restore_file%.gz}"
        restore_file="${restore_file%.gz}"
    fi
    
    # Extract database connection details
    local db_url="${DATABASE_URL}"
    local db_host=$(echo "$db_url" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    local db_port=$(echo "$db_url" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    local db_name=$(echo "$db_url" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    local db_user=$(echo "$db_url" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    
    # Restore database
    log_info "Restoring database..."
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "$db_host" \
        -p "$db_port" \
        -U "$db_user" \
        -d "$db_name" \
        -f "$restore_file"
    
    log_success "Database restore completed"
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up old backups..."
    
    # Local cleanup
    find "$BACKUP_DIR" -name "*.sql.gz*" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "*.tar.gz*" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "*.yaml.gz*" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "*.json" -mtime +$RETENTION_DAYS -delete
    
    # S3 cleanup (if configured)
    if command -v aws &> /dev/null && [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
        log_info "Cleaning up old S3 backups..."
        
        # List and delete old backups
        local cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y%m%d)
        
        aws s3 ls "s3://$S3_BUCKET/" --recursive | while read -r line; do
            local file_date=$(echo "$line" | awk '{print $1}' | tr -d '-')
            local file_path=$(echo "$line" | awk '{print $4}')
            
            if [[ "$file_date" < "$cutoff_date" ]]; then
                aws s3 rm "s3://$S3_BUCKET/$file_path"
                log_info "Deleted old backup: $file_path"
            fi
        done
    fi
    
    log_success "Cleanup completed"
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    # Check database connectivity
    if ! PGPASSWORD="${POSTGRES_PASSWORD}" psql "$DATABASE_URL" -c "SELECT 1;" &> /dev/null; then
        log_error "Database health check failed"
        return 1
    fi
    
    # Check API health
    if command -v curl &> /dev/null; then
        if ! curl -f "${API_URL:-http://localhost:3000}/health" &> /dev/null; then
            log_warning "API health check failed"
        fi
    fi
    
    # Check disk space
    local disk_usage=$(df "$BACKUP_DIR" | tail -1 | awk '{print $5}' | sed 's/%//')
    if [[ "$disk_usage" -gt 90 ]]; then
        log_warning "Disk usage is high: ${disk_usage}%"
    fi
    
    log_success "Health check completed"
}

# Main function
main() {
    local action="${1:-}"
    local backup_file="${2:-}"
    
    case "$action" in
        "backup-db")
            check_prerequisites
            backup_database
            ;;
        "backup-files")
            check_prerequisites
            backup_application_files
            ;;
        "backup-k8s")
            check_prerequisites
            backup_kubernetes_config
            ;;
        "backup-full")
            check_prerequisites
            backup_full_system
            ;;
        "restore-db")
            if [[ -z "$backup_file" ]]; then
                log_error "Backup file path required for restore"
                exit 1
            fi
            check_prerequisites
            restore_database "$backup_file"
            ;;
        "cleanup")
            cleanup_old_backups
            ;;
        "health")
            health_check
            ;;
        *)
            echo "Usage: $0 {backup-db|backup-files|backup-k8s|backup-full|restore-db|cleanup|health} [backup-file]"
            echo ""
            echo "Commands:"
            echo "  backup-db      - Backup database only"
            echo "  backup-files   - Backup application files only"
            echo "  backup-k8s     - Backup Kubernetes configuration only"
            echo "  backup-full    - Full system backup"
            echo "  restore-db     - Restore database from backup file"
            echo "  cleanup        - Clean up old backups"
            echo "  health         - Perform health check"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
