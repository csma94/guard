#!/bin/bash

# BahinLink Kubernetes Deployment Script
# Production-ready deployment to Kubernetes cluster

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
NAMESPACE="bahinlink"
ENVIRONMENT=${1:-production}
CLUSTER_NAME=${CLUSTER_NAME:-bahinlink-cluster}
REGION=${AWS_REGION:-us-east-1}

# Logging functions
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

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        error "kubectl is not installed"
        exit 1
    fi
    
    # Check if helm is installed
    if ! command -v helm &> /dev/null; then
        error "helm is not installed"
        exit 1
    fi
    
    # Check if aws CLI is installed
    if ! command -v aws &> /dev/null; then
        error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check kubectl connection
    if ! kubectl cluster-info &> /dev/null; then
        error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    success "Prerequisites check passed"
}

# Setup cluster connection
setup_cluster() {
    log "Setting up cluster connection..."
    
    # Update kubeconfig
    aws eks update-kubeconfig --region $REGION --name $CLUSTER_NAME
    
    # Verify connection
    kubectl cluster-info
    
    success "Cluster connection established"
}

# Create namespace and RBAC
setup_namespace() {
    log "Setting up namespace and RBAC..."
    
    # Apply namespace configuration
    kubectl apply -f k8s/namespace.yaml
    
    # Wait for namespace to be ready
    kubectl wait --for=condition=Ready namespace/$NAMESPACE --timeout=60s
    
    success "Namespace and RBAC configured"
}

# Deploy secrets and configmaps
deploy_secrets() {
    log "Deploying secrets and configmaps..."
    
    # Check if secrets file exists
    if [ ! -f "k8s/secrets.yaml" ]; then
        error "Secrets file not found. Please create k8s/secrets.yaml with actual values"
        exit 1
    fi
    
    # Apply secrets
    kubectl apply -f k8s/secrets.yaml
    
    success "Secrets and configmaps deployed"
}

# Deploy database and cache
deploy_database() {
    log "Deploying database and cache..."
    
    # Apply database configuration
    kubectl apply -f k8s/database.yaml
    
    # Wait for PostgreSQL to be ready
    log "Waiting for PostgreSQL to be ready..."
    kubectl wait --for=condition=Ready pod -l app=postgres -n $NAMESPACE --timeout=300s
    
    # Wait for Redis to be ready
    log "Waiting for Redis to be ready..."
    kubectl wait --for=condition=Ready pod -l app=redis -n $NAMESPACE --timeout=300s
    
    success "Database and cache deployed"
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    
    # Create migration job
    cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: bahinlink-migration-$(date +%s)
  namespace: $NAMESPACE
spec:
  template:
    spec:
      containers:
      - name: migration
        image: bahinlink/backend:latest
        command: ["npm", "run", "migrate:deploy"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: bahinlink-secrets
              key: database-url
      restartPolicy: Never
  backoffLimit: 3
EOF
    
    # Wait for migration to complete
    kubectl wait --for=condition=complete job -l job-name=bahinlink-migration -n $NAMESPACE --timeout=300s
    
    success "Database migrations completed"
}

# Deploy backend services
deploy_backend() {
    log "Deploying backend services..."
    
    # Apply backend configuration
    kubectl apply -f k8s/backend-deployment.yaml
    
    # Wait for backend to be ready
    log "Waiting for backend to be ready..."
    kubectl wait --for=condition=Ready pod -l app=bahinlink-backend -n $NAMESPACE --timeout=300s
    
    success "Backend services deployed"
}

# Deploy frontend services
deploy_frontend() {
    log "Deploying frontend services..."
    
    # Apply frontend configuration
    kubectl apply -f k8s/frontend.yaml
    
    # Wait for frontend services to be ready
    log "Waiting for admin portal to be ready..."
    kubectl wait --for=condition=Ready pod -l app=bahinlink-admin-portal -n $NAMESPACE --timeout=300s
    
    log "Waiting for client portal to be ready..."
    kubectl wait --for=condition=Ready pod -l app=bahinlink-client-portal -n $NAMESPACE --timeout=300s
    
    success "Frontend services deployed"
}

# Deploy ingress and load balancer
deploy_ingress() {
    log "Deploying ingress and load balancer..."
    
    # Install nginx ingress controller if not exists
    if ! kubectl get namespace ingress-nginx &> /dev/null; then
        log "Installing nginx ingress controller..."
        helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
        helm repo update
        helm install ingress-nginx ingress-nginx/ingress-nginx \
            --create-namespace \
            --namespace ingress-nginx \
            --set controller.service.type=LoadBalancer
    fi
    
    # Install cert-manager if not exists
    if ! kubectl get namespace cert-manager &> /dev/null; then
        log "Installing cert-manager..."
        helm repo add jetstack https://charts.jetstack.io
        helm repo update
        helm install cert-manager jetstack/cert-manager \
            --namespace cert-manager \
            --create-namespace \
            --version v1.13.0 \
            --set installCRDs=true
    fi
    
    # Apply ingress configuration
    kubectl apply -f k8s/ingress.yaml
    
    success "Ingress and load balancer deployed"
}

# Deploy monitoring
deploy_monitoring() {
    log "Deploying monitoring stack..."
    
    # Apply monitoring configuration
    kubectl apply -f k8s/monitoring.yaml
    
    # Wait for monitoring services to be ready
    log "Waiting for Prometheus to be ready..."
    kubectl wait --for=condition=Ready pod -l app=prometheus -n $NAMESPACE --timeout=300s
    
    log "Waiting for Grafana to be ready..."
    kubectl wait --for=condition=Ready pod -l app=grafana -n $NAMESPACE --timeout=300s
    
    success "Monitoring stack deployed"
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    # Check all pods are running
    kubectl get pods -n $NAMESPACE
    
    # Check services
    kubectl get services -n $NAMESPACE
    
    # Check ingress
    kubectl get ingress -n $NAMESPACE
    
    # Run health checks
    log "Running health checks..."
    
    # Get load balancer IP
    LB_IP=$(kubectl get service nginx-ingress-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    if [ -z "$LB_IP" ]; then
        LB_IP=$(kubectl get service nginx-ingress-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    fi
    
    if [ -n "$LB_IP" ]; then
        log "Load balancer endpoint: $LB_IP"
        
        # Test health endpoint
        if curl -f "http://$LB_IP/api/health" &> /dev/null; then
            success "Health check passed"
        else
            warning "Health check failed - services may still be starting"
        fi
    else
        warning "Load balancer IP not yet available"
    fi
    
    success "Deployment verification completed"
}

# Cleanup failed deployments
cleanup_failed() {
    warning "Cleaning up failed deployment..."
    
    # Delete failed jobs
    kubectl delete jobs --field-selector status.successful=0 -n $NAMESPACE || true
    
    # Restart failed pods
    kubectl delete pods --field-selector status.phase=Failed -n $NAMESPACE || true
    
    warning "Cleanup completed"
}

# Rollback deployment
rollback_deployment() {
    warning "Rolling back deployment..."
    
    # Rollback deployments
    kubectl rollout undo deployment/bahinlink-backend -n $NAMESPACE || true
    kubectl rollout undo deployment/bahinlink-admin-portal -n $NAMESPACE || true
    kubectl rollout undo deployment/bahinlink-client-portal -n $NAMESPACE || true
    
    warning "Rollback completed"
}

# Display deployment info
display_info() {
    log "Deployment Information:"
    echo ""
    echo "Namespace: $NAMESPACE"
    echo "Environment: $ENVIRONMENT"
    echo "Cluster: $CLUSTER_NAME"
    echo "Region: $REGION"
    echo ""
    
    # Get service URLs
    LB_IP=$(kubectl get service nginx-ingress-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
    if [ -z "$LB_IP" ]; then
        LB_IP=$(kubectl get service nginx-ingress-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "pending")
    fi
    
    echo "Service URLs:"
    echo "  Load Balancer: $LB_IP"
    echo "  Admin Portal: https://admin.bahinlink.com"
    echo "  Client Portal: https://client.bahinlink.com"
    echo "  API: https://api.bahinlink.com"
    echo ""
    
    # Get monitoring URLs
    echo "Monitoring:"
    echo "  Grafana: kubectl port-forward svc/grafana-service 3000:3000 -n $NAMESPACE"
    echo "  Prometheus: kubectl port-forward svc/prometheus-service 9090:9090 -n $NAMESPACE"
    echo ""
    
    echo "Useful Commands:"
    echo "  View pods: kubectl get pods -n $NAMESPACE"
    echo "  View logs: kubectl logs -f deployment/bahinlink-backend -n $NAMESPACE"
    echo "  Scale backend: kubectl scale deployment bahinlink-backend --replicas=5 -n $NAMESPACE"
    echo "  Update image: kubectl set image deployment/bahinlink-backend backend=bahinlink/backend:new-tag -n $NAMESPACE"
}

# Main deployment function
main() {
    log "Starting BahinLink Kubernetes deployment (Environment: $ENVIRONMENT)"
    
    # Check prerequisites
    check_prerequisites
    
    # Setup cluster connection
    setup_cluster
    
    # Setup namespace
    setup_namespace
    
    # Deploy secrets
    deploy_secrets
    
    # Deploy database
    deploy_database
    
    # Run migrations
    run_migrations
    
    # Deploy backend
    deploy_backend
    
    # Deploy frontend
    deploy_frontend
    
    # Deploy ingress
    deploy_ingress
    
    # Deploy monitoring
    deploy_monitoring
    
    # Verify deployment
    verify_deployment
    
    # Display info
    display_info
    
    success "Kubernetes deployment completed successfully!"
}

# Trap errors and perform cleanup
trap 'error "Deployment failed"; cleanup_failed; exit 1' ERR

# Handle command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback_deployment
        ;;
    "cleanup")
        cleanup_failed
        ;;
    "verify")
        verify_deployment
        ;;
    "info")
        display_info
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|cleanup|verify|info}"
        exit 1
        ;;
esac
