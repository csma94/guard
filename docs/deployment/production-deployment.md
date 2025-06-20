# BahinLink Production Deployment Guide

## Overview

This guide covers the complete production deployment of the BahinLink Security Management System, including infrastructure setup, configuration, monitoring, and maintenance procedures.

## Prerequisites

### System Requirements
- **Kubernetes Cluster**: v1.25+ with at least 3 nodes
- **Node Specifications**: 4 CPU cores, 8GB RAM minimum per node
- **Storage**: 500GB+ SSD storage with backup capabilities
- **Network**: Load balancer with SSL termination
- **Database**: PostgreSQL 15+ with replication
- **Cache**: Redis 7+ cluster

### Required Tools
- `kubectl` v1.25+
- `helm` v3.10+
- `docker` v20.10+
- `aws-cli` v2.0+ (for AWS deployments)
- `terraform` v1.0+ (for infrastructure as code)

### Access Requirements
- Kubernetes cluster admin access
- Container registry access
- DNS management access
- SSL certificate management
- Cloud provider credentials

## Infrastructure Setup

### 1. Kubernetes Cluster Setup

#### AWS EKS Deployment
```bash
# Create EKS cluster
eksctl create cluster \
  --name bahinlink-cluster \
  --region us-east-1 \
  --nodegroup-name bahinlink-nodes \
  --node-type m5.large \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 10 \
  --managed
```

#### Google GKE Deployment
```bash
# Create GKE cluster
gcloud container clusters create bahinlink-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type n1-standard-4 \
  --enable-autoscaling \
  --min-nodes 3 \
  --max-nodes 10
```

### 2. Storage Configuration

#### Persistent Volume Setup
```yaml
# storage-class.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
allowVolumeExpansion: true
```

#### Backup Storage
```yaml
# backup-storage.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: backup-storage
provisioner: kubernetes.io/aws-ebs
parameters:
  type: sc1
  encrypted: "true"
```

### 3. Network Configuration

#### Load Balancer Setup
```bash
# Install NGINX Ingress Controller
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/aws-load-balancer-type"="nlb"
```

#### SSL Certificate Management
```bash
# Install cert-manager
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.13.0 \
  --set installCRDs=true
```

## Application Deployment

### 1. Environment Configuration

#### Create Secrets
```bash
# Create namespace
kubectl create namespace bahinlink

# Create secrets from environment file
kubectl create secret generic bahinlink-secrets \
  --from-env-file=.env.production \
  --namespace=bahinlink

# Create registry secret
kubectl create secret docker-registry bahinlink-registry-secret \
  --docker-server=your-registry.com \
  --docker-username=your-username \
  --docker-password=your-password \
  --namespace=bahinlink
```

#### Database Secrets
```bash
# Create database password secret
kubectl create secret generic postgres-secret \
  --from-literal=POSTGRES_PASSWORD=your-secure-password \
  --namespace=bahinlink
```

### 2. Database Deployment

#### PostgreSQL with High Availability
```bash
# Deploy PostgreSQL
kubectl apply -f k8s/database.yaml

# Wait for database to be ready
kubectl wait --for=condition=Ready pod -l app=postgres -n bahinlink --timeout=300s

# Run initial migrations
kubectl apply -f k8s/migration-job.yaml
```

#### Database Backup Configuration
```bash
# Create backup CronJob
kubectl apply -f k8s/backup-cronjob.yaml

# Verify backup job
kubectl get cronjobs -n bahinlink
```

### 3. Application Services Deployment

#### Backend Services
```bash
# Deploy backend
kubectl apply -f k8s/backend-deployment.yaml

# Wait for backend to be ready
kubectl wait --for=condition=Ready pod -l app=bahinlink-backend -n bahinlink --timeout=300s

# Check backend health
kubectl exec -it deployment/bahinlink-backend -n bahinlink -- curl localhost:3000/health
```

#### Frontend Services
```bash
# Deploy admin portal
kubectl apply -f k8s/frontend.yaml

# Wait for frontend services
kubectl wait --for=condition=Ready pod -l app=bahinlink-admin-portal -n bahinlink --timeout=300s
kubectl wait --for=condition=Ready pod -l app=bahinlink-client-portal -n bahinlink --timeout=300s
```

### 4. Ingress and Load Balancer

#### Configure Ingress
```bash
# Apply ingress configuration
kubectl apply -f k8s/ingress.yaml

# Get load balancer IP
kubectl get service nginx-ingress-controller -n ingress-nginx
```

#### DNS Configuration
```bash
# Update DNS records to point to load balancer IP
# A record: bahinlink.com -> <load-balancer-ip>
# A record: admin.bahinlink.com -> <load-balancer-ip>
# A record: client.bahinlink.com -> <load-balancer-ip>
# A record: api.bahinlink.com -> <load-balancer-ip>
```

## Monitoring Setup

### 1. Prometheus and Grafana

#### Deploy Monitoring Stack
```bash
# Deploy monitoring
kubectl apply -f k8s/monitoring.yaml

# Wait for monitoring services
kubectl wait --for=condition=Ready pod -l app=prometheus -n bahinlink --timeout=300s
kubectl wait --for=condition=Ready pod -l app=grafana -n bahinlink --timeout=300s
```

#### Access Grafana
```bash
# Port forward to access Grafana
kubectl port-forward svc/grafana-service 3000:3000 -n bahinlink

# Default credentials: admin / <grafana-password-from-secrets>
```

### 2. Logging Configuration

#### ELK Stack Deployment
```bash
# Add Elastic Helm repository
helm repo add elastic https://helm.elastic.co

# Install Elasticsearch
helm install elasticsearch elastic/elasticsearch \
  --namespace logging \
  --create-namespace \
  --set replicas=3

# Install Kibana
helm install kibana elastic/kibana \
  --namespace logging

# Install Filebeat
helm install filebeat elastic/filebeat \
  --namespace logging
```

### 3. Alerting Setup

#### Configure Alertmanager
```yaml
# alertmanager-config.yaml
global:
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'alerts@bahinlink.com'

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'

receivers:
- name: 'web.hook'
  email_configs:
  - to: 'admin@bahinlink.com'
    subject: 'BahinLink Alert: {{ .GroupLabels.alertname }}'
    body: |
      {{ range .Alerts }}
      Alert: {{ .Annotations.summary }}
      Description: {{ .Annotations.description }}
      {{ end }}
```

## Security Configuration

### 1. Network Policies

#### Apply Network Policies
```bash
# Apply network security policies
kubectl apply -f k8s/network-policies.yaml

# Verify policies
kubectl get networkpolicies -n bahinlink
```

### 2. RBAC Configuration

#### Service Account Setup
```yaml
# rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: bahinlink-service-account
  namespace: bahinlink
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: bahinlink
  name: bahinlink-role
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: bahinlink-role-binding
  namespace: bahinlink
subjects:
- kind: ServiceAccount
  name: bahinlink-service-account
  namespace: bahinlink
roleRef:
  kind: Role
  name: bahinlink-role
  apiGroup: rbac.authorization.k8s.io
```

### 3. Pod Security Standards

#### Security Context Configuration
```yaml
# security-context.yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
containers:
- name: app
  securityContext:
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop:
      - ALL
```

## Performance Optimization

### 1. Resource Management

#### Resource Requests and Limits
```yaml
# resource-limits.yaml
resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 1Gi
```

#### Horizontal Pod Autoscaling
```bash
# Apply HPA configuration
kubectl apply -f k8s/hpa.yaml

# Monitor autoscaling
kubectl get hpa -n bahinlink
```

### 2. Database Optimization

#### PostgreSQL Configuration
```sql
-- postgresql.conf optimizations
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
```

#### Connection Pooling
```yaml
# pgbouncer.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pgbouncer
  namespace: bahinlink
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pgbouncer
  template:
    metadata:
      labels:
        app: pgbouncer
    spec:
      containers:
      - name: pgbouncer
        image: pgbouncer/pgbouncer:latest
        env:
        - name: DATABASES_HOST
          value: postgres-service
        - name: DATABASES_PORT
          value: "5432"
        - name: POOL_MODE
          value: transaction
        - name: MAX_CLIENT_CONN
          value: "100"
```

## Backup and Disaster Recovery

### 1. Database Backup Strategy

#### Automated Backups
```bash
# Create backup script
cat > backup-script.sh << 'EOF'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="bahinlink_backup_${TIMESTAMP}.sql"

# Create database dump
pg_dump -h postgres-service -U postgres -d bahinlink > /backups/${BACKUP_FILE}

# Compress backup
gzip /backups/${BACKUP_FILE}

# Upload to S3
aws s3 cp /backups/${BACKUP_FILE}.gz s3://bahinlink-backups/database/

# Cleanup old local backups
find /backups -name "*.gz" -mtime +7 -delete
EOF
```

#### Point-in-Time Recovery
```bash
# Enable WAL archiving
echo "wal_level = replica" >> postgresql.conf
echo "archive_mode = on" >> postgresql.conf
echo "archive_command = 'aws s3 cp %p s3://bahinlink-backups/wal/%f'" >> postgresql.conf
```

### 2. Application Data Backup

#### Persistent Volume Snapshots
```bash
# Create volume snapshot
kubectl apply -f - << 'EOF'
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: bahinlink-data-snapshot
  namespace: bahinlink
spec:
  volumeSnapshotClassName: csi-aws-vsc
  source:
    persistentVolumeClaimName: bahinlink-uploads-pvc
EOF
```

### 3. Disaster Recovery Plan

#### Multi-Region Setup
```bash
# Create secondary cluster in different region
eksctl create cluster \
  --name bahinlink-dr-cluster \
  --region us-west-2 \
  --nodegroup-name bahinlink-dr-nodes \
  --node-type m5.large \
  --nodes 3
```

#### Database Replication
```sql
-- Setup streaming replication
-- On primary database
CREATE USER replicator REPLICATION LOGIN CONNECTION LIMIT 1 ENCRYPTED PASSWORD 'replicator_password';

-- On replica
pg_basebackup -h primary-db-host -D /var/lib/postgresql/data -U replicator -v -P -W
```

## Deployment Automation

### 1. CI/CD Pipeline

#### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Build and push Docker images
      run: |
        docker build -t bahinlink/backend:${{ github.sha }} ./backend
        docker build -t bahinlink/admin-portal:${{ github.sha }} ./admin-portal
        docker build -t bahinlink/client-portal:${{ github.sha }} ./client-portal
        
        docker push bahinlink/backend:${{ github.sha }}
        docker push bahinlink/admin-portal:${{ github.sha }}
        docker push bahinlink/client-portal:${{ github.sha }}
    
    - name: Deploy to Kubernetes
      run: |
        aws eks update-kubeconfig --region us-east-1 --name bahinlink-cluster
        kubectl set image deployment/bahinlink-backend backend=bahinlink/backend:${{ github.sha }} -n bahinlink
        kubectl set image deployment/bahinlink-admin-portal admin-portal=bahinlink/admin-portal:${{ github.sha }} -n bahinlink
        kubectl set image deployment/bahinlink-client-portal client-portal=bahinlink/client-portal:${{ github.sha }} -n bahinlink
        kubectl rollout status deployment/bahinlink-backend -n bahinlink
```

### 2. Infrastructure as Code

#### Terraform Configuration
```hcl
# main.tf
provider "aws" {
  region = "us-east-1"
}

module "eks" {
  source = "terraform-aws-modules/eks/aws"
  
  cluster_name    = "bahinlink-cluster"
  cluster_version = "1.25"
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  
  node_groups = {
    bahinlink_nodes = {
      desired_capacity = 3
      max_capacity     = 10
      min_capacity     = 3
      
      instance_types = ["m5.large"]
      
      k8s_labels = {
        Environment = "production"
        Application = "bahinlink"
      }
    }
  }
}
```

## Health Checks and Monitoring

### 1. Application Health Checks

#### Kubernetes Probes
```yaml
# health-checks.yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### 2. Custom Metrics

#### Application Metrics
```javascript
// metrics.js
const prometheus = require('prom-client');

const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

const activeUsers = new prometheus.Gauge({
  name: 'bahinlink_active_users_total',
  help: 'Number of active users'
});

const activeShifts = new prometheus.Gauge({
  name: 'bahinlink_active_shifts_total',
  help: 'Number of active shifts'
});
```

### 3. Alert Rules

#### Prometheus Alert Rules
```yaml
# alert-rules.yaml
groups:
- name: bahinlink.rules
  rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: High error rate detected
      description: Error rate is {{ $value }} errors per second
  
  - alert: DatabaseConnectionHigh
    expr: pg_stat_database_numbackends > 80
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: High database connections
      description: Database has {{ $value }} active connections
```

## Maintenance Procedures

### 1. Regular Maintenance Tasks

#### Weekly Tasks
```bash
#!/bin/bash
# weekly-maintenance.sh

# Update system packages
kubectl apply -f k8s/system-updates.yaml

# Rotate logs
kubectl exec -it deployment/bahinlink-backend -n bahinlink -- logrotate /etc/logrotate.conf

# Check disk usage
kubectl exec -it deployment/postgres -n bahinlink -- df -h

# Verify backups
aws s3 ls s3://bahinlink-backups/database/ --recursive | tail -7
```

#### Monthly Tasks
```bash
#!/bin/bash
# monthly-maintenance.sh

# Database maintenance
kubectl exec -it deployment/postgres -n bahinlink -- psql -U postgres -d bahinlink -c "VACUUM ANALYZE;"

# Certificate renewal check
kubectl get certificates -n bahinlink

# Security updates
kubectl get pods -n bahinlink -o jsonpath='{.items[*].spec.containers[*].image}' | tr ' ' '\n' | sort -u
```

### 2. Scaling Procedures

#### Manual Scaling
```bash
# Scale backend
kubectl scale deployment bahinlink-backend --replicas=5 -n bahinlink

# Scale database (if using StatefulSet)
kubectl scale statefulset postgres --replicas=3 -n bahinlink
```

#### Auto-scaling Configuration
```yaml
# cluster-autoscaler.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-autoscaler
  namespace: kube-system
spec:
  template:
    spec:
      containers:
      - image: k8s.gcr.io/autoscaling/cluster-autoscaler:v1.25.0
        name: cluster-autoscaler
        command:
        - ./cluster-autoscaler
        - --v=4
        - --stderrthreshold=info
        - --cloud-provider=aws
        - --skip-nodes-with-local-storage=false
        - --expander=least-waste
        - --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/bahinlink-cluster
```

## Troubleshooting

### 1. Common Issues

#### Pod Startup Issues
```bash
# Check pod status
kubectl get pods -n bahinlink

# View pod logs
kubectl logs deployment/bahinlink-backend -n bahinlink

# Describe pod for events
kubectl describe pod <pod-name> -n bahinlink

# Check resource usage
kubectl top pods -n bahinlink
```

#### Database Connection Issues
```bash
# Test database connectivity
kubectl exec -it deployment/bahinlink-backend -n bahinlink -- nc -zv postgres-service 5432

# Check database logs
kubectl logs deployment/postgres -n bahinlink

# Verify database credentials
kubectl get secret postgres-secret -n bahinlink -o yaml
```

#### Network Issues
```bash
# Check service endpoints
kubectl get endpoints -n bahinlink

# Test service connectivity
kubectl exec -it deployment/bahinlink-backend -n bahinlink -- nslookup postgres-service

# Check ingress status
kubectl get ingress -n bahinlink
kubectl describe ingress bahinlink-ingress -n bahinlink
```

### 2. Performance Issues

#### High CPU Usage
```bash
# Check resource usage
kubectl top pods -n bahinlink

# Scale up if needed
kubectl scale deployment bahinlink-backend --replicas=5 -n bahinlink

# Check HPA status
kubectl get hpa -n bahinlink
```

#### Memory Issues
```bash
# Check memory usage
kubectl exec -it deployment/bahinlink-backend -n bahinlink -- free -h

# Check for memory leaks
kubectl exec -it deployment/bahinlink-backend -n bahinlink -- ps aux --sort=-%mem | head
```

### 3. Recovery Procedures

#### Database Recovery
```bash
# Restore from backup
kubectl exec -it deployment/postgres -n bahinlink -- psql -U postgres -c "DROP DATABASE bahinlink;"
kubectl exec -it deployment/postgres -n bahinlink -- psql -U postgres -c "CREATE DATABASE bahinlink;"
kubectl exec -i deployment/postgres -n bahinlink -- psql -U postgres -d bahinlink < backup.sql
```

#### Application Recovery
```bash
# Restart deployment
kubectl rollout restart deployment/bahinlink-backend -n bahinlink

# Rollback to previous version
kubectl rollout undo deployment/bahinlink-backend -n bahinlink

# Check rollout status
kubectl rollout status deployment/bahinlink-backend -n bahinlink
```

## Security Best Practices

### 1. Container Security

#### Image Scanning
```bash
# Scan images for vulnerabilities
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image bahinlink/backend:latest
```

#### Security Policies
```yaml
# pod-security-policy.yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: bahinlink-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
```

### 2. Network Security

#### Network Policies
```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: bahinlink-network-policy
  namespace: bahinlink
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 443
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
```

### 3. Secrets Management

#### External Secrets Operator
```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets-system \
  --create-namespace
```

#### AWS Secrets Manager Integration
```yaml
# secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: bahinlink
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        secretRef:
          accessKeyID:
            name: aws-credentials
            key: access-key-id
          secretAccessKey:
            name: aws-credentials
            key: secret-access-key
```

## Compliance and Auditing

### 1. Audit Logging

#### Enable Kubernetes Audit Logging
```yaml
# audit-policy.yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
- level: Metadata
  namespaces: ["bahinlink"]
  resources:
  - group: ""
    resources: ["secrets", "configmaps"]
- level: RequestResponse
  namespaces: ["bahinlink"]
  resources:
  - group: "apps"
    resources: ["deployments", "statefulsets"]
```

### 2. Compliance Monitoring

#### CIS Kubernetes Benchmark
```bash
# Run kube-bench for CIS compliance
kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml

# Check results
kubectl logs job/kube-bench
```

### 3. Security Scanning

#### Falco Runtime Security
```bash
# Install Falco
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm install falco falcosecurity/falco \
  --namespace falco-system \
  --create-namespace
```

---

This deployment guide provides comprehensive instructions for setting up a production-ready BahinLink Security Management System. Follow each section carefully and adapt configurations to your specific environment and requirements.
