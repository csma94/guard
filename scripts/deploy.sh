#!/bin/bash

# BahinLink Deployment Script
# This script handles the deployment of the BahinLink application

set -e

# Configuration
ENVIRONMENT=${1:-production}
VERSION=${2:-latest}
NAMESPACE="bahinlink"
DOCKER_REGISTRY="bahinlink"

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
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if kubectl is installed (for Kubernetes deployment)
    if [[ "$ENVIRONMENT" == "kubernetes" ]]; then
        if ! command -v kubectl &> /dev/null; then
            log_error "kubectl is not installed or not in PATH"
            exit 1
        fi
    fi
    
    # Check if docker-compose is installed (for Docker Compose deployment)
    if [[ "$ENVIRONMENT" == "docker-compose" ]]; then
        if ! command -v docker-compose &> /dev/null; then
            log_error "docker-compose is not installed or not in PATH"
            exit 1
        fi
    fi
    
    log_success "Prerequisites check passed"
}

# Build Docker images
build_images() {
    log_info "Building Docker images..."
    
    # Build API image
    log_info "Building API image..."
    docker build -t ${DOCKER_REGISTRY}/api:${VERSION} .
    
    # Build Admin Portal image
    log_info "Building Admin Portal image..."
    docker build -t ${DOCKER_REGISTRY}/admin-portal:${VERSION} ./admin-portal
    
    # Build Client Portal image
    log_info "Building Client Portal image..."
    docker build -t ${DOCKER_REGISTRY}/client-portal:${VERSION} ./client-portal
    
    log_success "Docker images built successfully"
}

# Push images to registry
push_images() {
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_info "Pushing images to registry..."
        
        docker push ${DOCKER_REGISTRY}/api:${VERSION}
        docker push ${DOCKER_REGISTRY}/admin-portal:${VERSION}
        docker push ${DOCKER_REGISTRY}/client-portal:${VERSION}
        
        log_success "Images pushed to registry"
    fi
}

# Deploy with Docker Compose
deploy_docker_compose() {
    log_info "Deploying with Docker Compose..."
    
    # Check if .env file exists
    if [[ ! -f .env ]]; then
        log_warning ".env file not found, creating from template..."
        cp .env.example .env
        log_warning "Please update .env file with your configuration"
    fi
    
    # Stop existing containers
    docker-compose down
    
    # Start services
    docker-compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Run database migrations
    log_info "Running database migrations..."
    docker-compose exec api npx prisma migrate deploy
    
    # Seed database if needed
    if [[ "$ENVIRONMENT" == "development" ]]; then
        log_info "Seeding database..."
        docker-compose exec api npx prisma db seed
    fi
    
    log_success "Docker Compose deployment completed"
}

# Deploy to Kubernetes
deploy_kubernetes() {
    log_info "Deploying to Kubernetes..."
    
    # Create namespace if it doesn't exist
    kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply Kubernetes manifests
    log_info "Applying Kubernetes manifests..."
    kubectl apply -f k8s/
    
    # Wait for deployments to be ready
    log_info "Waiting for deployments to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/postgres -n ${NAMESPACE}
    kubectl wait --for=condition=available --timeout=300s deployment/redis -n ${NAMESPACE}
    kubectl wait --for=condition=available --timeout=300s deployment/api -n ${NAMESPACE}
    
    # Run database migrations
    log_info "Running database migrations..."
    kubectl exec -n ${NAMESPACE} deployment/api -- npx prisma migrate deploy
    
    log_success "Kubernetes deployment completed"
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    local api_url
    if [[ "$ENVIRONMENT" == "kubernetes" ]]; then
        api_url="http://$(kubectl get service api-service -n ${NAMESPACE} -o jsonpath='{.spec.clusterIP}'):3001"
    else
        api_url="http://localhost:3001"
    fi
    
    # Wait for API to be ready
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f "${api_url}/health" &> /dev/null; then
            log_success "API health check passed"
            break
        fi
        
        log_info "Waiting for API to be ready... (attempt ${attempt}/${max_attempts})"
        sleep 10
        ((attempt++))
    done
    
    if [[ $attempt -gt $max_attempts ]]; then
        log_error "API health check failed after ${max_attempts} attempts"
        exit 1
    fi
}

# Backup database
backup_database() {
    log_info "Creating database backup..."
    
    local backup_dir="./backups"
    local backup_file="${backup_dir}/backup_$(date +%Y%m%d_%H%M%S).sql"
    
    mkdir -p ${backup_dir}
    
    if [[ "$ENVIRONMENT" == "kubernetes" ]]; then
        kubectl exec -n ${NAMESPACE} deployment/postgres -- pg_dump -U bahinlink_user bahinlink > ${backup_file}
    else
        docker-compose exec postgres pg_dump -U bahinlink_user bahinlink > ${backup_file}
    fi
    
    log_success "Database backup created: ${backup_file}"
}

# Rollback deployment
rollback() {
    log_warning "Rolling back deployment..."
    
    if [[ "$ENVIRONMENT" == "kubernetes" ]]; then
        kubectl rollout undo deployment/api -n ${NAMESPACE}
        kubectl rollout undo deployment/admin-portal -n ${NAMESPACE}
        kubectl rollout undo deployment/client-portal -n ${NAMESPACE}
    else
        # For Docker Compose, we would need to use previous images
        log_warning "Docker Compose rollback requires manual intervention"
    fi
    
    log_success "Rollback completed"
}

# Main deployment function
main() {
    log_info "Starting BahinLink deployment..."
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Version: ${VERSION}"
    
    case "$ENVIRONMENT" in
        "development"|"staging"|"production")
            check_prerequisites
            build_images
            push_images
            deploy_docker_compose
            health_check
            ;;
        "kubernetes")
            check_prerequisites
            build_images
            push_images
            deploy_kubernetes
            health_check
            ;;
        "backup")
            backup_database
            ;;
        "rollback")
            rollback
            ;;
        *)
            log_error "Invalid environment: ${ENVIRONMENT}"
            echo "Usage: $0 [development|staging|production|kubernetes|backup|rollback] [version]"
            exit 1
            ;;
    esac
    
    log_success "BahinLink deployment completed successfully!"
}

# Run main function
main "$@"
