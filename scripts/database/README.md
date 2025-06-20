# Database Management Scripts

This directory contains production-ready database management scripts for the BahinLink Workforce Management System.

## Overview

The database management system provides comprehensive tools for:
- **Migration Management**: Safe database schema updates with backup and rollback capabilities
- **Data Seeding**: Initial data setup for different environments
- **Backup & Restore**: Production-grade backup and restore operations

## Scripts

### 1. Migration Script (`migrate.js`)

Handles database schema migrations with production safety features.

#### Features
- Automatic backup creation before migrations (production)
- Dry-run mode for testing
- Migration status checking
- Rollback capabilities
- Environment validation

#### Usage

```bash
# Run migrations with backup (production)
npm run db:migrate

# Dry run to see what would be applied
npm run db:migrate:dry

# Force migration (skip confirmations)
npm run db:migrate:force

# Direct script usage
node scripts/database/migrate.js [options]
```

#### Options
- `--dry-run`: Show pending migrations without applying
- `--no-backup`: Skip backup creation
- `--force`: Force migration without confirmations
- `--environment <env>`: Specify environment

### 2. Seeding Script (`seed.js`)

Populates database with initial data for different environments.

#### Seed Types
- **basic**: Essential data for development
- **demo**: Sample data for demonstrations
- **production**: Minimal production setup

#### Usage

```bash
# Basic seeding (development)
npm run db:seed

# Demo data seeding
npm run db:seed:demo

# Production seeding
npm run db:seed:production

# Force seeding (overwrite existing)
npm run db:seed:force

# Clear all data (development only)
npm run db:seed:clear

# Direct script usage
node scripts/database/seed.js [options]
```

#### Options
- `--type <type>`: Seed type (basic, demo, production)
- `--force`: Overwrite existing data
- `--clear`: Clear all data (development only)

### 3. Backup Script (`backup.js`)

Comprehensive backup and restore operations.

#### Features
- Compressed backups
- Metadata tracking
- Integrity validation
- Automatic cleanup
- Schema-only or data-only backups

#### Usage

```bash
# Create full backup
npm run db:backup

# Schema-only backup
npm run db:backup:schema

# Data-only backup
npm run db:backup:data

# List available backups
npm run db:list-backups

# Restore from backup
npm run db:restore -- --file /path/to/backup.sql.gz

# Direct script usage
node scripts/database/backup.js <command> [options]
```

#### Commands
- `create`: Create new backup
- `restore`: Restore from backup
- `list`: List available backups

#### Options
- `--no-compress`: Skip compression
- `--schema-only`: Backup schema only
- `--data-only`: Backup data only
- `--name <name>`: Custom backup name
- `--file <path>`: Backup file path (for restore)
- `--force`: Force restore in production

## Environment Setup

### Required Environment Variables

```bash
# Database connection
DATABASE_URL="postgresql://user:password@localhost:5432/database"

# Admin user (for seeding)
ADMIN_EMAIL="admin@yourdomain.com"
ADMIN_PASSWORD="secure-password"
ADMIN_USERNAME="admin"

# Backup settings
MAX_BACKUPS=30

# Application version
npm_package_version="1.0.0"
```

### Prerequisites

1. **PostgreSQL Tools**: Ensure `pg_dump` and `psql` are available
2. **Database Access**: Valid DATABASE_URL with appropriate permissions
3. **Disk Space**: Sufficient space for backups (especially in production)

## Production Deployment

### Initial Setup

```bash
# 1. Run migrations
npm run db:migrate

# 2. Seed production data
npm run db:seed:production

# 3. Create initial backup
npm run db:backup
```

### Regular Maintenance

```bash
# Daily backup (add to cron)
0 2 * * * cd /app && npm run db:backup

# Weekly cleanup (automatic via script)
# Old backups are automatically cleaned up based on MAX_BACKUPS
```

### Emergency Procedures

#### Rollback Migration
```bash
# 1. Stop application
# 2. Restore from pre-migration backup
npm run db:restore -- --file /path/to/pre-migration-backup.sql.gz --force

# 3. Restart application
```

#### Data Recovery
```bash
# 1. List available backups
npm run db:list-backups

# 2. Restore from specific backup
npm run db:restore -- --file /path/to/backup.sql.gz --force
```

## Development Workflow

### Setting Up Development Environment

```bash
# 1. Setup database with demo data
npm run db:setup:demo

# 2. Start development server
npm run dev
```

### Resetting Development Database

```bash
# Clear all data and reseed
npm run db:seed:clear
npm run db:seed:demo
```

### Testing Migrations

```bash
# 1. Create backup
npm run db:backup -- --name before-test

# 2. Test migration
npm run db:migrate:dry

# 3. Apply migration
npm run db:migrate

# 4. If issues, restore backup
npm run db:restore -- --file /path/to/before-test.sql.gz
```

## Monitoring and Logging

All database operations are logged with:
- Timestamp and environment
- Operation details and results
- Error messages and stack traces
- Performance metrics

Logs are written to:
- Console (development)
- Log files (production)
- Application monitoring systems

## Security Considerations

### Production Safety
- Automatic backups before destructive operations
- Environment validation
- Force flags required for dangerous operations
- Credential sanitization in logs

### Access Control
- Database credentials via environment variables
- No hardcoded passwords
- Minimal required permissions

### Data Protection
- Backup encryption (file system level)
- Secure backup storage
- Retention policies

## Troubleshooting

### Common Issues

#### Migration Fails
```bash
# Check migration status
npm run db:migrate:dry

# Verify database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check logs for specific errors
```

#### Backup Fails
```bash
# Check disk space
df -h

# Verify pg_dump availability
which pg_dump

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"
```

#### Restore Fails
```bash
# Verify backup integrity
node scripts/database/backup.js list

# Check backup file exists and is readable
ls -la /path/to/backup.sql.gz

# Test with smaller backup first
```

### Getting Help

1. Check application logs
2. Verify environment configuration
3. Test database connectivity
4. Review script output for specific error messages

## Best Practices

### Development
- Always use demo data for development
- Test migrations on copy of production data
- Regular backup before major changes

### Production
- Schedule regular automated backups
- Test restore procedures regularly
- Monitor backup success/failure
- Keep multiple backup generations

### Security
- Rotate database credentials regularly
- Secure backup storage location
- Limit access to production database
- Audit database access logs
