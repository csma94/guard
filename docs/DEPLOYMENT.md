# BahinLink Deployment Guide

## Overview

This guide covers the deployment of the BahinLink Security Workforce Management System across different environments.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Web Server    │    │    Database     │
│    (Nginx)      │────│   (Node.js)     │────│  (PostgreSQL)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │     Redis       │              │
         └──────────────│   (Sessions)    │──────────────┘
                        └─────────────────┘
```

## Prerequisites

### System Requirements

**Minimum Requirements:**
- CPU: 2 cores
- RAM: 4GB
- Storage: 50GB SSD
- OS: Ubuntu 20.04 LTS or CentOS 8

**Recommended for Production:**
- CPU: 4+ cores
- RAM: 8GB+
- Storage: 100GB+ SSD
- OS: Ubuntu 22.04 LTS

### Software Dependencies

- Node.js 18.x or higher
- PostgreSQL 14.x or higher
- Redis 6.x or higher
- Nginx 1.20.x or higher
- PM2 (Process Manager)
- Docker (optional)

## Environment Setup

### 1. Database Setup

#### PostgreSQL Installation
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# CentOS/RHEL
sudo dnf install postgresql postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

#### Database Configuration
```bash
# Create database and user
sudo -u postgres psql
CREATE DATABASE bahinlink;
CREATE USER bahinlink_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE bahinlink TO bahinlink_user;
\q
```

#### PostgreSQL Configuration (`/etc/postgresql/14/main/postgresql.conf`)
```
# Connection settings
listen_addresses = 'localhost'
port = 5432
max_connections = 100

# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB

# WAL settings
wal_level = replica
max_wal_size = 1GB
min_wal_size = 80MB

# Logging
log_statement = 'all'
log_duration = on
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
```

### 2. Redis Setup

#### Redis Installation
```bash
# Ubuntu/Debian
sudo apt install redis-server

# CentOS/RHEL
sudo dnf install redis
sudo systemctl enable redis
sudo systemctl start redis
```

#### Redis Configuration (`/etc/redis/redis.conf`)
```
# Network
bind 127.0.0.1
port 6379
protected-mode yes

# Memory
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000

# Security
requirepass your_redis_password
```

### 3. Application Setup

#### Clone Repository
```bash
git clone https://github.com/your-org/bahinlink.git
cd bahinlink
```

#### Install Dependencies
```bash
# Backend
npm install

# Client Portal
cd client-portal
npm install
cd ..

# Mobile App
cd mobile
npm install
cd ..
```

#### Environment Configuration

Create `.env` file:
```env
# Environment
NODE_ENV=production
PORT=3001

# Database
DATABASE_URL="postgresql://bahinlink_user:secure_password@localhost:5432/bahinlink"

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD="your_redis_password"

# Clerk Authentication
CLERK_SECRET_KEY="sk_live_your-production-clerk-secret-key"
CLERK_WEBHOOK_SECRET="whsec_your-production-clerk-webhook-secret"
CLERK_PUBLISHABLE_KEY="pk_live_your-production-clerk-publishable-key"

# Email
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# File Storage
UPLOAD_PATH="/var/uploads"
MAX_FILE_SIZE="10MB"

# External APIs
GOOGLE_MAPS_API_KEY="your-google-maps-api-key"
TWILIO_ACCOUNT_SID="your-twilio-sid"
TWILIO_AUTH_TOKEN="your-twilio-token"

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
SENTRY_DSN="your-sentry-dsn"
LOG_LEVEL="info"
```

#### Database Migration
```bash
npx prisma migrate deploy
npx prisma generate
```

#### Build Applications
```bash
# Build client portal
cd client-portal
npm run build
cd ..

# Build mobile app (for web deployment)
cd mobile
npm run build:web
cd ..
```

## Deployment Methods

### Method 1: Traditional Deployment

#### 1. Install PM2
```bash
npm install -g pm2
```

#### 2. PM2 Configuration (`ecosystem.config.js`)
```javascript
module.exports = {
  apps: [
    {
      name: 'bahinlink-api',
      script: './src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      max_memory_restart: '1G'
    }
  ]
};
```

#### 3. Start Application
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Method 2: Docker Deployment

#### 1. Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Set permissions
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3001

CMD ["npm", "start"]
```

#### 2. Docker Compose (`docker-compose.yml`)
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://bahinlink_user:password@db:5432/bahinlink
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    volumes:
      - uploads:/var/uploads
    restart: unless-stopped

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=bahinlink
      - POSTGRES_USER=bahinlink_user
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:6-alpine
    command: redis-server --requirepass password
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  uploads:
```

#### 3. Deploy with Docker
```bash
docker-compose up -d
```

## Nginx Configuration

### Basic Configuration (`/etc/nginx/sites-available/bahinlink`)
```nginx
upstream bahinlink_backend {
    server 127.0.0.1:3001;
    # Add more servers for load balancing
    # server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/ssl/certs/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

    # Client Portal
    location / {
        root /var/www/bahinlink/client-portal/build;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API Routes
    location /api/ {
        proxy_pass http://bahinlink_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://bahinlink_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # File Uploads
    location /uploads/ {
        alias /var/uploads/;
        expires 1y;
        add_header Cache-Control "public";
    }

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    location /api/ {
        limit_req zone=api burst=20 nodelay;
    }
}
```

## SSL Certificate Setup

### Using Let's Encrypt
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Monitoring and Logging

### 1. Application Monitoring

#### PM2 Monitoring
```bash
# Monitor processes
pm2 monit

# View logs
pm2 logs

# Restart application
pm2 restart bahinlink-api
```

#### Health Check Endpoint
```javascript
// Add to your Express app
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version
  });
});
```

### 2. Log Management

#### Logrotate Configuration (`/etc/logrotate.d/bahinlink`)
```
/var/log/bahinlink/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 3. System Monitoring

#### Install Monitoring Tools
```bash
# Install htop, iotop, and netstat
sudo apt install htop iotop net-tools

# Install Node.js monitoring
npm install -g clinic
```

## Backup Strategy

### 1. Database Backup
```bash
#!/bin/bash
# backup-db.sh

BACKUP_DIR="/var/backups/bahinlink"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="bahinlink"
DB_USER="bahinlink_user"

mkdir -p $BACKUP_DIR

# Create backup
pg_dump -U $DB_USER -h localhost $DB_NAME | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +30 -delete

echo "Database backup completed: db_backup_$DATE.sql.gz"
```

### 2. File Backup
```bash
#!/bin/bash
# backup-files.sh

BACKUP_DIR="/var/backups/bahinlink"
DATE=$(date +%Y%m%d_%H%M%S)
UPLOAD_DIR="/var/uploads"

# Backup uploaded files
tar -czf $BACKUP_DIR/files_backup_$DATE.tar.gz -C $UPLOAD_DIR .

# Keep only last 30 days
find $BACKUP_DIR -name "files_backup_*.tar.gz" -mtime +30 -delete

echo "Files backup completed: files_backup_$DATE.tar.gz"
```

### 3. Automated Backup Schedule
```bash
# Add to crontab
sudo crontab -e

# Daily database backup at 2 AM
0 2 * * * /opt/bahinlink/scripts/backup-db.sh

# Weekly file backup on Sundays at 3 AM
0 3 * * 0 /opt/bahinlink/scripts/backup-files.sh
```

## Security Hardening

### 1. Firewall Configuration
```bash
# UFW (Ubuntu)
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 2. System Updates
```bash
# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 3. Application Security
- Use environment variables for secrets
- Enable HTTPS only
- Implement rate limiting
- Regular dependency updates
- Security headers in Nginx
- Input validation and sanitization

## Performance Optimization

### 1. Database Optimization
```sql
-- Create indexes for frequently queried columns
CREATE INDEX idx_shifts_agent_date ON shifts(agent_id, start_time);
CREATE INDEX idx_reports_site_date ON reports(site_id, created_at);
CREATE INDEX idx_location_tracking_agent_time ON location_tracking(agent_id, timestamp);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM shifts WHERE agent_id = 'uuid' AND start_time >= '2024-01-01';
```

### 2. Application Optimization
- Enable gzip compression
- Use Redis for session storage
- Implement caching strategies
- Optimize database queries
- Use connection pooling

### 3. Nginx Optimization
```nginx
# Add to nginx.conf
worker_processes auto;
worker_connections 1024;

# Enable gzip
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

# Enable caching
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=10g inactive=60m use_temp_path=off;
```

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   ```bash
   # Check PostgreSQL status
   sudo systemctl status postgresql
   
   # Check connections
   sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
   ```

2. **High Memory Usage**
   ```bash
   # Check memory usage
   free -h
   
   # Check Node.js processes
   ps aux | grep node
   
   # Restart PM2 processes
   pm2 restart all
   ```

3. **SSL Certificate Issues**
   ```bash
   # Check certificate expiry
   openssl x509 -in /etc/ssl/certs/your-domain.crt -text -noout | grep "Not After"
   
   # Renew Let's Encrypt certificate
   sudo certbot renew
   ```

### Log Analysis
```bash
# Application logs
tail -f /var/log/bahinlink/app.log

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# System logs
journalctl -u bahinlink -f
```

## Scaling Considerations

### Horizontal Scaling
- Load balancer configuration
- Database read replicas
- Redis clustering
- CDN for static assets
- Microservices architecture

### Vertical Scaling
- Increase server resources
- Optimize database configuration
- Tune application parameters
- Monitor resource usage

## Support and Maintenance

### Regular Maintenance Tasks
- Weekly security updates
- Monthly dependency updates
- Quarterly performance reviews
- Annual security audits

### Monitoring Checklist
- [ ] Application uptime
- [ ] Database performance
- [ ] SSL certificate expiry
- [ ] Disk space usage
- [ ] Memory and CPU usage
- [ ] Backup verification
- [ ] Security logs review

For additional support, contact the development team or refer to the troubleshooting documentation.
