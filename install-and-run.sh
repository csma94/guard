#!/bin/bash

# BahinLink Installation and Startup Script
# This script installs all dependencies and starts the complete BahinLink application

set -e

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version)
        log_success "Node.js is installed: $NODE_VERSION"
    else
        log_error "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi
    
    # Check npm
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        log_success "npm is installed: $NPM_VERSION"
    else
        log_error "npm is not installed. Please install npm"
        exit 1
    fi
    
    # Check if Docker is available (optional)
    if command_exists docker; then
        log_success "Docker is available"
        DOCKER_AVAILABLE=true
    else
        log_warning "Docker is not available. Database services will need to be set up manually"
        DOCKER_AVAILABLE=false
    fi
    
    # Check if Docker Compose is available (optional)
    if command_exists docker-compose; then
        log_success "Docker Compose is available"
        DOCKER_COMPOSE_AVAILABLE=true
    else
        log_warning "Docker Compose is not available"
        DOCKER_COMPOSE_AVAILABLE=false
    fi
}

# Function to setup environment files
setup_environment() {
    log_info "Setting up environment files..."
    
    # Copy .env.example to .env if it doesn't exist
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            log_success "Created .env file from .env.example"
            log_warning "Please update .env file with your actual configuration values"
        else
            log_warning ".env.example not found. Creating basic .env file"
            cat > .env << EOF
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://postgres:password@localhost:5432/bahinlink"
REDIS_URL="redis://localhost:6379"
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
ENCRYPTION_KEY=your-32-byte-encryption-key-here
CORS_ORIGIN=http://localhost:3001
EOF
        fi
    else
        log_success ".env file already exists"
    fi
    
    # Setup environment for admin portal
    if [ ! -f admin-portal/.env ]; then
        cat > admin-portal/.env << EOF
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_WS_URL=ws://localhost:3000
REACT_APP_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
EOF
        log_success "Created admin-portal/.env file"
    fi
    
    # Setup environment for client portal
    if [ ! -f client-portal/.env ]; then
        cat > client-portal/.env << EOF
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_WS_URL=ws://localhost:3000
REACT_APP_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
EOF
        log_success "Created client-portal/.env file"
    fi
}

# Function to install backend dependencies
install_backend_dependencies() {
    log_info "Installing backend dependencies..."
    
    # Install main backend dependencies
    npm install
    log_success "Backend dependencies installed"
}

# Function to install frontend dependencies
install_frontend_dependencies() {
    log_info "Installing frontend dependencies..."
    
    # Install admin portal dependencies
    cd admin-portal
    npm install
    log_success "Admin portal dependencies installed"
    cd ..
    
    # Install client portal dependencies
    cd client-portal
    npm install
    log_success "Client portal dependencies installed"
    cd ..
}

# Function to install mobile dependencies
install_mobile_dependencies() {
    log_info "Installing mobile app dependencies..."
    
    # Check if Expo CLI is installed
    if ! command_exists expo; then
        log_info "Installing Expo CLI globally..."
        npm install -g @expo/cli
    fi
    
    cd mobile
    npm install
    log_success "Mobile app dependencies installed"
    cd ..
}

# Function to setup database with Docker
setup_database_docker() {
    if [ "$DOCKER_AVAILABLE" = true ] && [ "$DOCKER_COMPOSE_AVAILABLE" = true ]; then
        log_info "Setting up database services with Docker..."
        
        # Start database services
        docker-compose up -d postgres redis
        
        # Wait for services to be ready
        log_info "Waiting for database services to be ready..."
        sleep 10
        
        # Run database migrations
        log_info "Running database migrations..."
        npm run db:migrate
        
        # Seed database with initial data
        log_info "Seeding database with initial data..."
        npm run db:seed
        
        log_success "Database setup completed"
    else
        log_warning "Docker not available. Please set up PostgreSQL and Redis manually"
        log_info "PostgreSQL: Create database 'bahinlink' on localhost:5432"
        log_info "Redis: Start Redis server on localhost:6379"
        log_info "Then run: npm run db:migrate && npm run db:seed"
    fi
}

# Function to setup database manually
setup_database_manual() {
    log_info "Manual database setup instructions:"
    echo ""
    echo "1. Install PostgreSQL and create a database named 'bahinlink'"
    echo "2. Install Redis and start the Redis server"
    echo "3. Update the DATABASE_URL and REDIS_URL in your .env file"
    echo "4. Run the following commands:"
    echo "   npm run db:migrate"
    echo "   npm run db:seed"
    echo ""
    read -p "Press Enter when you have completed the database setup..."
}

# Function to start all services
start_services() {
    log_info "Starting BahinLink services..."
    
    # Create logs directory
    mkdir -p logs
    
    # Function to start a service in background
    start_service() {
        local service_name=$1
        local command=$2
        local log_file=$3
        
        log_info "Starting $service_name..."
        nohup $command > "$log_file" 2>&1 &
        echo $! > "logs/${service_name}.pid"
        log_success "$service_name started (PID: $(cat logs/${service_name}.pid))"
    }
    
    # Start backend API
    start_service "Backend API" "npm start" "logs/backend.log"
    
    # Wait a moment for backend to start
    sleep 3
    
    # Start admin portal
    cd admin-portal
    start_service "Admin Portal" "npm start" "../logs/admin-portal.log"
    cd ..
    
    # Start client portal
    cd client-portal
    start_service "Client Portal" "npm start" "../logs/client-portal.log"
    cd ..
    
    log_success "All services started successfully!"
    echo ""
    echo "🚀 BahinLink is now running:"
    echo "   📊 Admin Portal: http://localhost:3001"
    echo "   👥 Client Portal: http://localhost:3002"
    echo "   🔧 Backend API: http://localhost:3000"
    echo "   📱 Mobile App: cd mobile && npm start"
    echo ""
    echo "📋 Service logs are available in the logs/ directory"
    echo "🛑 To stop all services, run: ./stop-services.sh"
}

# Function to create stop script
create_stop_script() {
    cat > stop-services.sh << 'EOF'
#!/bin/bash

# Stop BahinLink Services Script

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_info "Stopping BahinLink services..."

# Stop services by PID
for service in backend admin-portal client-portal; do
    if [ -f "logs/${service}.pid" ]; then
        PID=$(cat "logs/${service}.pid")
        if kill -0 $PID 2>/dev/null; then
            kill $PID
            log_success "Stopped $service (PID: $PID)"
        else
            log_info "$service was not running"
        fi
        rm -f "logs/${service}.pid"
    fi
done

# Kill any remaining Node.js processes on our ports
pkill -f "react-scripts start" 2>/dev/null || true
pkill -f "node.*server.js" 2>/dev/null || true

log_success "All services stopped"
EOF

    chmod +x stop-services.sh
    log_success "Created stop-services.sh script"
}

# Function to run development mode
run_development() {
    log_info "Starting BahinLink in development mode..."
    
    # Start services with live reload
    echo "Starting services with live reload..."
    
    # Use tmux or screen if available for better session management
    if command_exists tmux; then
        log_info "Using tmux for session management"
        
        # Create new tmux session
        tmux new-session -d -s bahinlink
        
        # Split into panes and start services
        tmux send-keys -t bahinlink "npm run dev" Enter
        tmux split-window -t bahinlink
        tmux send-keys -t bahinlink "cd admin-portal && npm start" Enter
        tmux split-window -t bahinlink
        tmux send-keys -t bahinlink "cd client-portal && npm start" Enter
        
        log_success "Services started in tmux session 'bahinlink'"
        log_info "To attach to the session: tmux attach -t bahinlink"
        log_info "To detach from session: Ctrl+B then D"
        log_info "To stop all services: tmux kill-session -t bahinlink"
        
    else
        # Fallback to background processes
        start_services
    fi
}

# Main installation function
main() {
    echo "🚀 BahinLink Installation and Setup"
    echo "===================================="
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Setup environment
    setup_environment
    
    # Install dependencies
    log_info "Installing all dependencies..."
    install_backend_dependencies
    install_frontend_dependencies
    
    # Ask about mobile app
    read -p "Do you want to install mobile app dependencies? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_mobile_dependencies
    fi
    
    # Setup database
    if [ "$DOCKER_AVAILABLE" = true ] && [ "$DOCKER_COMPOSE_AVAILABLE" = true ]; then
        read -p "Do you want to use Docker for database services? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            setup_database_docker
        else
            setup_database_manual
        fi
    else
        setup_database_manual
    fi
    
    # Create stop script
    create_stop_script
    
    # Ask about starting services
    echo ""
    read -p "Do you want to start all services now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Use development mode with live reload? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            run_development
        else
            start_services
        fi
    else
        log_info "To start services later, run: ./install-and-run.sh start"
    fi
    
    echo ""
    log_success "🎉 BahinLink installation completed!"
    echo ""
    echo "📖 Next steps:"
    echo "   1. Update .env files with your actual configuration"
    echo "   2. Configure external services (AWS, Firebase, etc.)"
    echo "   3. Access the applications at the URLs shown above"
    echo "   4. Check the documentation in docs/ directory"
    echo ""
}

# Handle command line arguments
case "${1:-}" in
    "start")
        start_services
        ;;
    "dev")
        run_development
        ;;
    "stop")
        if [ -f stop-services.sh ]; then
            ./stop-services.sh
        else
            log_error "stop-services.sh not found. Run the full installation first."
        fi
        ;;
    *)
        main
        ;;
esac
