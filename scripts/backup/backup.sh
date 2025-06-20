#!/bin/bash

# BahinLink Backup Script
# Automated backup solution for PostgreSQL database and application files

set -e

# Configuration
BACKUP_DIR="/backups"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-bahinlink}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
AWS_S3_BACKUP_BUCKET="${AWS_S3_BACKUP_BUCKET}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Create backup directory
create_backup_dir() {
    local backup_date=$(date +%Y%m%d_%H%M%S)
    local backup_path="${BACKUP_DIR}/${backup_date}"
    
    mkdir -p "${backup_path}"
    echo "${backup_path}"
}

# Database backup
backup_database() {
    local backup_path=$1
    local db_backup_file="${backup_path}/database.sql"
    
    log "Starting database backup..."
    
    # Set password for pg_dump
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    
    # Create database dump
    if pg_dump -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
        --verbose --clean --no-owner --no-privileges > "${db_backup_file}"; then
        success "Database backup completed: ${db_backup_file}"
        
        # Compress the backup
        gzip "${db_backup_file}"
        success "Database backup compressed: ${db_backup_file}.gz"
    else
        error "Database backup failed"
        return 1
    fi
    
    unset PGPASSWORD
}

# Application files backup
backup_application_files() {
    local backup_path=$1
    local files_backup_file="${backup_path}/application_files.tar.gz"
    
    log "Starting application files backup..."
    
    # Files and directories to backup
    local backup_items=(
        "/app/uploads"
        "/app/logs"
        "/app/.env"
        "/app/package.json"
        "/app/package-lock.json"
    )
    
    # Create tar archive of application files
    if tar -czf "${files_backup_file}" -C / "${backup_items[@]}" 2>/dev/null; then
        success "Application files backup completed: ${files_backup_file}"
    else
        warning "Some application files may not exist, backup created with available files"
    fi
}

# Configuration backup
backup_configuration() {
    local backup_path=$1
    local config_backup_file="${backup_path}/configuration.tar.gz"
    
    log "Starting configuration backup..."
    
    # Configuration files to backup
    local config_items=(
        "/etc/nginx"
        "/app/prisma"
        "/app/docker-compose.yml"
        "/app/.env.example"
    )
    
    # Create tar archive of configuration files
    if tar -czf "${config_backup_file}" -C / "${config_items[@]}" 2>/dev/null; then
        success "Configuration backup completed: ${config_backup_file}"
    else
        warning "Some configuration files may not exist, backup created with available files"
    fi
}

# Upload to S3
upload_to_s3() {
    local backup_path=$1
    local backup_name=$(basename "${backup_path}")
    
    if [ -z "${AWS_S3_BACKUP_BUCKET}" ]; then
        warning "AWS S3 bucket not configured, skipping cloud backup"
        return 0
    fi
    
    log "Uploading backup to S3..."
    
    # Create tar archive of entire backup
    local backup_archive="${backup_path}.tar.gz"
    tar -czf "${backup_archive}" -C "${BACKUP_DIR}" "${backup_name}"
    
    # Upload to S3
    if aws s3 cp "${backup_archive}" "s3://${AWS_S3_BACKUP_BUCKET}/backups/${backup_name}.tar.gz"; then
        success "Backup uploaded to S3: s3://${AWS_S3_BACKUP_BUCKET}/backups/${backup_name}.tar.gz"
        
        # Remove local archive after successful upload
        rm -f "${backup_archive}"
    else
        error "Failed to upload backup to S3"
        return 1
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."
    
    # Local cleanup
    find "${BACKUP_DIR}" -type d -name "20*" -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true
    
    # S3 cleanup (if configured)
    if [ -n "${AWS_S3_BACKUP_BUCKET}" ]; then
        local cutoff_date=$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d)
        aws s3 ls "s3://${AWS_S3_BACKUP_BUCKET}/backups/" | while read -r line; do
            local file_date=$(echo "$line" | awk '{print $1}')
            local file_name=$(echo "$line" | awk '{print $4}')
            
            if [[ "$file_date" < "$cutoff_date" ]]; then
                aws s3 rm "s3://${AWS_S3_BACKUP_BUCKET}/backups/${file_name}"
                log "Removed old S3 backup: ${file_name}"
            fi
        done
    fi
    
    success "Old backups cleaned up"
}

# Verify backup integrity
verify_backup() {
    local backup_path=$1
    
    log "Verifying backup integrity..."
    
    # Check if database backup exists and is not empty
    local db_backup="${backup_path}/database.sql.gz"
    if [ -f "${db_backup}" ] && [ -s "${db_backup}" ]; then
        # Test gzip integrity
        if gzip -t "${db_backup}"; then
            success "Database backup integrity verified"
        else
            error "Database backup is corrupted"
            return 1
        fi
    else
        error "Database backup file is missing or empty"
        return 1
    fi
    
    # Check application files backup
    local files_backup="${backup_path}/application_files.tar.gz"
    if [ -f "${files_backup}" ]; then
        if tar -tzf "${files_backup}" >/dev/null 2>&1; then
            success "Application files backup integrity verified"
        else
            error "Application files backup is corrupted"
            return 1
        fi
    fi
    
    # Check configuration backup
    local config_backup="${backup_path}/configuration.tar.gz"
    if [ -f "${config_backup}" ]; then
        if tar -tzf "${config_backup}" >/dev/null 2>&1; then
            success "Configuration backup integrity verified"
        else
            error "Configuration backup is corrupted"
            return 1
        fi
    fi
    
    success "All backup files verified successfully"
}

# Generate backup report
generate_backup_report() {
    local backup_path=$1
    local report_file="${backup_path}/backup_report.json"
    
    log "Generating backup report..."
    
    # Get backup statistics
    local backup_size=$(du -sh "${backup_path}" | cut -f1)
    local file_count=$(find "${backup_path}" -type f | wc -l)
    local backup_date=$(date -Iseconds)
    
    # Create JSON report
    cat > "${report_file}" << EOF
{
  "backup_date": "${backup_date}",
  "backup_path": "${backup_path}",
  "backup_size": "${backup_size}",
  "file_count": ${file_count},
  "components": {
    "database": {
      "file": "database.sql.gz",
      "size": "$([ -f "${backup_path}/database.sql.gz" ] && du -sh "${backup_path}/database.sql.gz" | cut -f1 || echo "N/A")",
      "status": "$([ -f "${backup_path}/database.sql.gz" ] && echo "success" || echo "failed")"
    },
    "application_files": {
      "file": "application_files.tar.gz",
      "size": "$([ -f "${backup_path}/application_files.tar.gz" ] && du -sh "${backup_path}/application_files.tar.gz" | cut -f1 || echo "N/A")",
      "status": "$([ -f "${backup_path}/application_files.tar.gz" ] && echo "success" || echo "failed")"
    },
    "configuration": {
      "file": "configuration.tar.gz",
      "size": "$([ -f "${backup_path}/configuration.tar.gz" ] && du -sh "${backup_path}/configuration.tar.gz" | cut -f1 || echo "N/A")",
      "status": "$([ -f "${backup_path}/configuration.tar.gz" ] && echo "success" || echo "failed")"
    }
  },
  "s3_upload": {
    "enabled": $([ -n "${AWS_S3_BACKUP_BUCKET}" ] && echo "true" || echo "false"),
    "bucket": "${AWS_S3_BACKUP_BUCKET:-null}"
  }
}
EOF
    
    success "Backup report generated: ${report_file}"
}

# Send notification
send_notification() {
    local backup_path=$1
    local status=$2
    
    if [ -n "${WEBHOOK_URL}" ]; then
        local message
        if [ "${status}" = "success" ]; then
            message="✅ BahinLink backup completed successfully at $(date)"
        else
            message="❌ BahinLink backup failed at $(date)"
        fi
        
        curl -X POST "${WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"${message}\"}" \
            >/dev/null 2>&1 || true
    fi
}

# Main backup function
main() {
    log "Starting BahinLink backup process..."
    
    # Check prerequisites
    if [ -z "${POSTGRES_PASSWORD}" ]; then
        error "POSTGRES_PASSWORD environment variable is required"
        exit 1
    fi
    
    # Create backup directory
    local backup_path
    backup_path=$(create_backup_dir)
    
    # Perform backups
    local backup_status="success"
    
    if ! backup_database "${backup_path}"; then
        backup_status="failed"
    fi
    
    backup_application_files "${backup_path}"
    backup_configuration "${backup_path}"
    
    # Verify backup integrity
    if [ "${backup_status}" = "success" ]; then
        if ! verify_backup "${backup_path}"; then
            backup_status="failed"
        fi
    fi
    
    # Upload to S3 if successful
    if [ "${backup_status}" = "success" ]; then
        upload_to_s3 "${backup_path}" || backup_status="failed"
    fi
    
    # Generate report
    generate_backup_report "${backup_path}"
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Send notification
    send_notification "${backup_path}" "${backup_status}"
    
    if [ "${backup_status}" = "success" ]; then
        success "Backup process completed successfully"
        success "Backup location: ${backup_path}"
        exit 0
    else
        error "Backup process completed with errors"
        exit 1
    fi
}

# Run main function
main "$@"
