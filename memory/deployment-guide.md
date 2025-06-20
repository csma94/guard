# Deployment Guide: BahinLink

**Version:** 1.0  
**Date:** December 17, 2024  
**Document Type:** Deployment Guide  
**Project:** BahinLink Workforce Management Solution  

## Table of Contents

1. [Deployment Overview](#1-deployment-overview)
2. [Infrastructure Requirements](#2-infrastructure-requirements)
3. [Environment Configuration](#3-environment-configuration)
4. [Database Setup](#4-database-setup)
5. [Application Deployment](#5-application-deployment)
6. [Mobile App Distribution](#6-mobile-app-distribution)
7. [Monitoring and Logging](#7-monitoring-and-logging)
8. [Backup and Recovery](#8-backup-and-recovery)
9. [Security Configuration](#9-security-configuration)
10. [Maintenance Procedures](#10-maintenance-procedures)

## 1. Deployment Overview

### 1.1 Deployment Architecture

**Production Environment Components:**
- Load Balancer (AWS ALB/Nginx)
- Application Servers (2+ instances)
- Database Server (PostgreSQL with read replica)
- File Storage (AWS S3 or equivalent)
- Cache Server (Redis)
- Monitoring Stack (Prometheus/Grafana)

**Deployment Strategy:**
- Blue-Green deployment for zero downtime
- Automated deployment pipeline
- Database migration automation
- Rollback capabilities
- Health checks and monitoring

### 1.2 Deployment Environments

**Development:**
- Local development setup
- Docker Compose for services
- Local database and file storage
- Mock external services

**Staging:**
- Production-like environment
- Automated deployment from main branch
- Real external service integrations
- Performance and security testing

**Production:**
- High-availability setup
- Load balancing and auto-scaling
- Comprehensive monitoring
- Backup and disaster recovery

## 2. Infrastructure Requirements

### 2.1 Cloud Infrastructure (AWS Example)

**Compute Resources:**
```yaml
Application Servers:
  - Instance Type: t3.medium (2 vCPU, 4GB RAM)
  - Count: 2 (minimum), auto-scaling to 4
  - Operating System: Ubuntu 20.04 LTS
  - Storage: 50GB SSD

Database Server:
  - Instance Type: db.t3.medium (2 vCPU, 4GB RAM)
  - Storage: 100GB SSD with auto-scaling
  - Multi-AZ: Yes (for high availability)
  - Read Replica: 1 instance

Cache Server:
  - Instance Type: cache.t3.micro (1 vCPU, 0.5GB RAM)
  - Redis version: 6.2+
  - Cluster mode: Disabled (single node)

Load Balancer:
  - Type: Application Load Balancer (ALB)
  - SSL/TLS termination
  - Health checks enabled
  - Cross-zone load balancing
```

**Network Configuration:**
```yaml
VPC Configuration:
  - CIDR: 10.0.0.0/16
  - Public Subnets: 2 (for load balancer)
  - Private Subnets: 2 (for application servers)
  - Database Subnets: 2 (for RDS)
  - NAT Gateway: 1 (for outbound internet access)

Security Groups:
  - Load Balancer: HTTP/HTTPS from internet
  - Application Servers: HTTP from load balancer
  - Database: PostgreSQL from application servers
  - Cache: Redis from application servers
```

### 2.2 Storage Requirements

**File Storage:**
- AWS S3 bucket for media files
- CloudFront CDN for global distribution
- Lifecycle policies for cost optimization
- Cross-region replication for disaster recovery

**Database Storage:**
- Primary database: 100GB initial, auto-scaling enabled
- Backup storage: 30-day retention
- Point-in-time recovery enabled
- Encryption at rest enabled

### 2.3 Monitoring and Logging

**Monitoring Stack:**
- CloudWatch for AWS resource monitoring
- Application Performance Monitoring (APM)
- Custom metrics for business logic
- Alerting for critical issues

**Logging:**
- Centralized logging with ELK stack or CloudWatch Logs
- Application logs with structured format
- Audit logs for security compliance
- Log retention policies

## 3. Environment Configuration

### 3.1 Environment Variables

**Application Configuration:**
```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@host:5432/bahinlink
DATABASE_POOL_SIZE=20
DATABASE_TIMEOUT=30000

# Redis Configuration
REDIS_URL=redis://cache-server:6379
REDIS_TTL=3600

# File Storage
AWS_S3_BUCKET=bahinlink-media
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# External Services
GOOGLE_MAPS_API_KEY=AIza...
FCM_SERVER_KEY=AAAA...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...

# Security
JWT_SECRET=your-super-secret-key
ENCRYPTION_KEY=32-byte-encryption-key
BCRYPT_ROUNDS=12

# Application Settings
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
CORS_ORIGIN=https://admin.bahinlink.com
```

**Mobile App Configuration:**
```javascript
// config/production.js
export default {
  API_BASE_URL: 'https://api.bahinlink.com/v1',
  WEBSOCKET_URL: 'wss://api.bahinlink.com/ws',
  GOOGLE_MAPS_API_KEY: 'AIza...',
  FCM_SENDER_ID: '123456789',
  SENTRY_DSN: 'https://...@sentry.io/...',
  LOG_LEVEL: 'warn',
  OFFLINE_STORAGE_SIZE: '50MB',
  SYNC_INTERVAL: 300000, // 5 minutes
};
```

### 3.2 Configuration Management

**Secrets Management:**
- AWS Secrets Manager for sensitive data
- Environment-specific configuration files
- Kubernetes secrets for container deployments
- Rotation policies for API keys and passwords

**Feature Flags:**
- LaunchDarkly or similar service
- Environment-specific feature toggles
- Gradual rollout capabilities
- A/B testing support

## 4. Database Setup

### 4.1 PostgreSQL Installation and Configuration

**Installation (Ubuntu):**
```bash
# Install PostgreSQL 14
sudo apt update
sudo apt install postgresql-14 postgresql-contrib-14

# Install PostGIS extension
sudo apt install postgresql-14-postgis-3

# Configure PostgreSQL
sudo -u postgres psql
```

**Database Configuration:**
```sql
-- Create database and user
CREATE DATABASE bahinlink;
CREATE USER bahinlink_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE bahinlink TO bahinlink_user;

-- Enable extensions
\c bahinlink
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
```

**Performance Tuning:**
```bash
# postgresql.conf optimizations
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
```

### 4.2 Database Migration

**Migration Tool Setup:**
```bash
# Using Flyway for database migrations
wget -qO- https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/8.5.13/flyway-commandline-8.5.13-linux-x64.tar.gz | tar xvz
```

**Migration Scripts Structure:**
```
migrations/
├── V001__initial_schema.sql
├── V002__add_user_tables.sql
├── V003__add_location_tracking.sql
├── V004__add_reporting_tables.sql
└── V005__add_indexes.sql
```

**Migration Execution:**
```bash
# Run migrations
flyway -url=jdbc:postgresql://localhost:5432/bahinlink \
       -user=bahinlink_user \
       -password=secure_password \
       -locations=filesystem:./migrations \
       migrate
```

### 4.3 Database Backup Configuration

**Automated Backup Script:**
```bash
#!/bin/bash
# backup-database.sh

BACKUP_DIR="/var/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="bahinlink"

# Create backup
pg_dump -h localhost -U bahinlink_user -d $DB_NAME | gzip > $BACKUP_DIR/bahinlink_$DATE.sql.gz

# Upload to S3
aws s3 cp $BACKUP_DIR/bahinlink_$DATE.sql.gz s3://bahinlink-backups/database/

# Cleanup old local backups (keep 7 days)
find $BACKUP_DIR -name "bahinlink_*.sql.gz" -mtime +7 -delete
```

## 5. Application Deployment

### 5.1 Docker Configuration

**Backend Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["npm", "start"]
```

**Docker Compose (Development):**
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@db:5432/bahinlink
    depends_on:
      - db
      - redis

  db:
    image: postgis/postgis:14-3.2
    environment:
      - POSTGRES_DB=bahinlink
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6.2-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 5.2 Kubernetes Deployment

**Application Deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bahinlink-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: bahinlink-api
  template:
    metadata:
      labels:
        app: bahinlink-api
    spec:
      containers:
      - name: api
        image: bahinlink/api:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: bahinlink-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

**Service Configuration:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: bahinlink-api-service
spec:
  selector:
    app: bahinlink-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

### 5.3 CI/CD Pipeline

**GitHub Actions Workflow:**
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: npm test
    - run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Build Docker image
      run: docker build -t bahinlink/api:${{ github.sha }} .
    - name: Push to registry
      run: |
        echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
        docker push bahinlink/api:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
    - name: Deploy to Kubernetes
      run: |
        kubectl set image deployment/bahinlink-api api=bahinlink/api:${{ github.sha }}
        kubectl rollout status deployment/bahinlink-api
```

## 6. Mobile App Distribution

### 6.1 Android App Build and Distribution

**Build Configuration:**
```gradle
// android/app/build.gradle
android {
    compileSdkVersion 33
    buildToolsVersion "33.0.0"

    defaultConfig {
        applicationId "com.bahinlink.mobile"
        minSdkVersion 26
        targetSdkVersion 33
        versionCode 1
        versionName "1.0.0"
    }

    signingConfigs {
        release {
            storeFile file('bahinlink-release-key.keystore')
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            signingConfig signingConfigs.release
        }
    }
}
```

**Build and Release Process:**
```bash
# Build release APK
cd android
./gradlew assembleRelease

# Build App Bundle for Play Store
./gradlew bundleRelease

# Upload to Play Store (using fastlane)
fastlane supply --aab app/build/outputs/bundle/release/app-release.aab
```

**App Store Metadata:**
```yaml
# fastlane/metadata/android/en-US/
title: "BahinLink - Workforce Management"
short_description: "Professional security workforce management solution"
full_description: |
  BahinLink is a comprehensive workforce management solution designed for
  security companies. Features include real-time GPS tracking, digital
  reporting, scheduling, and communication tools.

keywords: "security, workforce, management, GPS, tracking, reporting"
```

### 6.2 App Distribution Strategy

**Internal Distribution (Beta Testing):**
- Firebase App Distribution for internal testing
- TestFlight equivalent for controlled rollout
- Feedback collection and bug reporting

**Play Store Distribution:**
- Staged rollout (10% → 50% → 100%)
- A/B testing for app store listing
- Crash reporting and analytics setup
- User feedback monitoring

**Enterprise Distribution:**
- Direct APK distribution for enterprise clients
- Mobile Device Management (MDM) integration
- Custom app store for organization

## 7. Monitoring and Logging

### 7.1 Application Monitoring

**Health Check Endpoints:**
```javascript
// Health check implementation
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION,
    checks: {
      database: 'healthy',
      redis: 'healthy',
      external_apis: 'healthy'
    }
  };

  res.status(200).json(health);
});

app.get('/ready', async (req, res) => {
  try {
    // Check database connection
    await db.query('SELECT 1');

    // Check Redis connection
    await redis.ping();

    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});
```

**Prometheus Metrics:**
```javascript
const prometheus = require('prom-client');

// Custom metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const activeUsers = new prometheus.Gauge({
  name: 'active_users_total',
  help: 'Number of currently active users'
});

const reportSubmissions = new prometheus.Counter({
  name: 'report_submissions_total',
  help: 'Total number of reports submitted',
  labelNames: ['type', 'status']
});
```

### 7.2 Logging Configuration

**Structured Logging:**
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'bahinlink-api',
    version: process.env.APP_VERSION
  },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

**Log Aggregation:**
```yaml
# Fluentd configuration for log collection
<source>
  @type tail
  path /var/log/bahinlink/*.log
  pos_file /var/log/fluentd/bahinlink.log.pos
  tag bahinlink.*
  format json
</source>

<match bahinlink.**>
  @type elasticsearch
  host elasticsearch.logging.svc.cluster.local
  port 9200
  index_name bahinlink-logs
  type_name _doc
</match>
```

### 7.3 Alerting Configuration

**Alert Rules:**
```yaml
# Prometheus alert rules
groups:
- name: bahinlink-alerts
  rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value }} errors per second"

  - alert: DatabaseConnectionFailure
    expr: up{job="postgresql"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Database connection failure"
      description: "PostgreSQL database is not responding"

  - alert: HighMemoryUsage
    expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High memory usage"
      description: "Memory usage is above 90%"
```

## 8. Backup and Recovery

### 8.1 Database Backup Strategy

**Automated Backup Script:**
```bash
#!/bin/bash
# Enhanced backup script with encryption and validation

BACKUP_DIR="/var/backups/postgresql"
S3_BUCKET="bahinlink-backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="bahinlink"
ENCRYPTION_KEY="/etc/backup/encryption.key"

# Create backup with compression
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME \
  | gzip \
  | gpg --symmetric --cipher-algo AES256 --compress-algo 1 \
        --passphrase-file $ENCRYPTION_KEY \
  > $BACKUP_DIR/bahinlink_$DATE.sql.gz.gpg

# Verify backup integrity
if [ $? -eq 0 ]; then
  echo "Backup created successfully: bahinlink_$DATE.sql.gz.gpg"

  # Upload to S3 with server-side encryption
  aws s3 cp $BACKUP_DIR/bahinlink_$DATE.sql.gz.gpg \
    s3://$S3_BUCKET/database/ \
    --server-side-encryption AES256

  # Test backup restoration (on staging)
  if [ "$ENVIRONMENT" = "production" ]; then
    ./test-backup-restore.sh $BACKUP_DIR/bahinlink_$DATE.sql.gz.gpg
  fi
else
  echo "Backup failed!" >&2
  exit 1
fi

# Cleanup old backups
find $BACKUP_DIR -name "bahinlink_*.sql.gz.gpg" -mtime +7 -delete
```

### 8.2 Disaster Recovery Procedures

**Recovery Time Objectives (RTO):**
- Database recovery: 2 hours
- Application recovery: 1 hour
- Full system recovery: 4 hours

**Recovery Point Objectives (RPO):**
- Database: 15 minutes (transaction log backup frequency)
- File storage: 1 hour (S3 cross-region replication)
- Application state: 5 minutes (Redis persistence)

**Recovery Procedures:**
```bash
# Database point-in-time recovery
pg_restore -h $NEW_DB_HOST -U $DB_USER -d $DB_NAME \
  --clean --if-exists \
  /path/to/backup/bahinlink_backup.sql

# Apply transaction logs for point-in-time recovery
pg_waldump --start=$START_LSN --end=$END_LSN /path/to/wal/files/
```

## 9. Security Configuration

### 9.1 SSL/TLS Configuration

**Nginx SSL Configuration:**
```nginx
server {
    listen 443 ssl http2;
    server_name api.bahinlink.com;

    ssl_certificate /etc/ssl/certs/bahinlink.crt;
    ssl_certificate_key /etc/ssl/private/bahinlink.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    ssl_session_timeout 1d;
    ssl_session_cache shared:MozTLS:10m;
    ssl_session_tickets off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 9.2 Firewall Configuration

**UFW Firewall Rules:**
```bash
# Reset firewall
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# SSH access (limit to specific IPs)
ufw allow from 203.0.113.0/24 to any port 22

# HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Database (only from application servers)
ufw allow from 10.0.1.0/24 to any port 5432

# Redis (only from application servers)
ufw allow from 10.0.1.0/24 to any port 6379

# Enable firewall
ufw enable
```

### 9.3 Security Monitoring

**Fail2Ban Configuration:**
```ini
# /etc/fail2ban/jail.local
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log

[bahinlink-api]
enabled = true
filter = bahinlink-api
logpath = /var/log/bahinlink/api.log
maxretry = 10
bantime = 1800
```

## 10. Maintenance Procedures

### 10.1 Regular Maintenance Tasks

**Daily Tasks:**
- Monitor system health and performance metrics
- Review error logs and alerts
- Verify backup completion
- Check disk space and resource usage

**Weekly Tasks:**
- Update security patches
- Review and rotate log files
- Performance optimization review
- Security scan execution

**Monthly Tasks:**
- Database maintenance (VACUUM, ANALYZE)
- SSL certificate renewal check
- Disaster recovery testing
- Capacity planning review

### 10.2 Update Procedures

**Application Updates:**
```bash
# Zero-downtime deployment procedure
1. Deploy new version to staging environment
2. Run automated tests and validation
3. Create database backup
4. Deploy to production (blue-green deployment)
5. Run health checks and smoke tests
6. Monitor for issues and rollback if necessary
```

**Database Updates:**
```bash
# Database migration procedure
1. Create full database backup
2. Test migration on staging environment
3. Schedule maintenance window (if required)
4. Execute migration with rollback plan
5. Verify data integrity and application functionality
6. Monitor performance post-migration
```

---

**Document Approval:**
- DevOps Lead: [Signature Required]
- Security Officer: [Signature Required]
- Technical Lead: [Signature Required]

**Next Steps:**
1. Set up production infrastructure
2. Configure monitoring and alerting
3. Implement backup and recovery procedures
4. Conduct security hardening
5. Prepare deployment pipeline
