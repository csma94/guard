#!/bin/bash

# BahinLink GitHub Setup Script
# This script helps you set up the project on GitHub

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Check if git is installed
check_git() {
    if ! command -v git &> /dev/null; then
        error "Git is not installed. Please install Git first."
        exit 1
    fi
    success "Git is installed"
}

# Check if GitHub CLI is installed
check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        warning "GitHub CLI is not installed. You'll need to create the repository manually."
        return 1
    fi
    success "GitHub CLI is installed"
    return 0
}

# Initialize git repository
init_git() {
    log "Initializing Git repository..."
    
    if [ -d ".git" ]; then
        warning "Git repository already exists"
    else
        git init
        success "Git repository initialized"
    fi
}

# Create initial commit
create_initial_commit() {
    log "Creating initial commit..."
    
    # Add all files except those in .gitignore
    git add .
    
    # Check if there are any changes to commit
    if git diff --staged --quiet; then
        warning "No changes to commit"
        return
    fi
    
    # Create initial commit
    git commit -m "Initial commit: BahinLink Security Management System

- Complete full-stack security workforce management platform
- Backend API with Node.js, TypeScript, and Prisma
- Admin portal with React and Material-UI
- Client portal for service monitoring
- Mobile app with React Native
- Production-ready deployment with Docker and Kubernetes
- Comprehensive testing and monitoring
- Enterprise-grade security and authentication"
    
    success "Initial commit created"
}

# Create GitHub repository
create_github_repo() {
    local repo_name="$1"
    local description="$2"
    local visibility="$3"
    
    log "Creating GitHub repository: $repo_name"
    
    if check_gh_cli; then
        # Create repository using GitHub CLI
        if [ "$visibility" = "private" ]; then
            gh repo create "$repo_name" --description "$description" --private
        else
            gh repo create "$repo_name" --description "$description" --public
        fi
        
        success "GitHub repository created: $repo_name"
    else
        warning "Please create the repository manually at https://github.com/new"
        echo "Repository name: $repo_name"
        echo "Description: $description"
        echo "Visibility: $visibility"
        echo ""
        echo "After creating the repository, run:"
        echo "git remote add origin https://github.com/YOUR_USERNAME/$repo_name.git"
        echo "git branch -M main"
        echo "git push -u origin main"
        return 1
    fi
}

# Add remote origin
add_remote() {
    local repo_url="$1"
    
    log "Adding remote origin..."
    
    # Check if origin already exists
    if git remote get-url origin &> /dev/null; then
        warning "Remote origin already exists"
        git remote set-url origin "$repo_url"
        log "Updated remote origin URL"
    else
        git remote add origin "$repo_url"
        success "Remote origin added"
    fi
}

# Push to GitHub
push_to_github() {
    log "Pushing to GitHub..."
    
    # Set main branch
    git branch -M main
    
    # Push to GitHub
    git push -u origin main
    
    success "Code pushed to GitHub successfully!"
}

# Create GitHub Actions workflow
create_github_actions() {
    log "Creating GitHub Actions workflows..."
    
    mkdir -p .github/workflows
    
    # CI/CD workflow
    cat > .github/workflows/ci-cd.yml << 'EOF'
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: bahinlink_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: |
        npm ci
        cd backend && npm ci
        cd ../admin-portal && npm ci
        cd ../client-portal && npm ci
    
    - name: Run linting
      run: |
        cd backend && npm run lint
        cd ../admin-portal && npm run lint
        cd ../client-portal && npm run lint
    
    - name: Run tests
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/bahinlink_test
        REDIS_URL: redis://localhost:6379
        JWT_SECRET: test_jwt_secret_key_for_testing_only
      run: |
        cd backend && npm test
        cd ../admin-portal && npm test
        cd ../client-portal && npm test
    
    - name: Build applications
      run: |
        cd backend && npm run build
        cd ../admin-portal && npm run build
        cd ../client-portal && npm run build

  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Run security audit
      run: |
        npm audit --audit-level high
        cd backend && npm audit --audit-level high
        cd ../admin-portal && npm audit --audit-level high
        cd ../client-portal && npm audit --audit-level high

  deploy:
    needs: [test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to production
      env:
        KUBE_CONFIG: ${{ secrets.KUBE_CONFIG }}
      run: |
        echo "Deployment would happen here"
        # Add your deployment commands
EOF
    
    # Security scanning workflow
    cat > .github/workflows/security.yml << 'EOF'
name: Security Scan

on:
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday at 2 AM
  workflow_dispatch:

jobs:
  security-scan:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        scan-ref: '.'
        format: 'sarif'
        output: 'trivy-results.sarif'
    
    - name: Upload Trivy scan results to GitHub Security tab
      uses: github/codeql-action/upload-sarif@v2
      with:
        sarif_file: 'trivy-results.sarif'
EOF
    
    success "GitHub Actions workflows created"
}

# Create issue templates
create_issue_templates() {
    log "Creating issue templates..."
    
    mkdir -p .github/ISSUE_TEMPLATE
    
    # Bug report template
    cat > .github/ISSUE_TEMPLATE/bug_report.md << 'EOF'
---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment (please complete the following information):**
 - OS: [e.g. iOS]
 - Browser [e.g. chrome, safari]
 - Version [e.g. 22]
 - Component [e.g. Admin Portal, Mobile App, Backend API]

**Additional context**
Add any other context about the problem here.
EOF
    
    # Feature request template
    cat > .github/ISSUE_TEMPLATE/feature_request.md << 'EOF'
---
name: Feature request
about: Suggest an idea for this project
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

**Is your feature request related to a problem? Please describe.**
A clear and concise description of what the problem is. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots about the feature request here.
EOF
    
    success "Issue templates created"
}

# Create pull request template
create_pr_template() {
    log "Creating pull request template..."
    
    mkdir -p .github
    
    cat > .github/pull_request_template.md << 'EOF'
## Description
Brief description of the changes in this PR.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Security testing completed (if applicable)

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

## Screenshots (if applicable)
Add screenshots to help explain your changes.

## Additional Notes
Any additional information that reviewers should know.
EOF
    
    success "Pull request template created"
}

# Main setup function
main() {
    echo "🚀 BahinLink GitHub Setup"
    echo "========================="
    echo ""
    
    # Get repository details
    read -p "Enter repository name (default: bahinlink): " repo_name
    repo_name=${repo_name:-bahinlink}
    
    read -p "Enter repository description: " repo_description
    repo_description=${repo_description:-"Enterprise-grade security workforce management platform"}
    
    read -p "Make repository private? (y/N): " make_private
    if [[ $make_private =~ ^[Yy]$ ]]; then
        visibility="private"
    else
        visibility="public"
    fi
    
    echo ""
    log "Setting up GitHub repository: $repo_name"
    log "Description: $repo_description"
    log "Visibility: $visibility"
    echo ""
    
    # Check prerequisites
    check_git
    
    # Initialize git
    init_git
    
    # Create GitHub workflows and templates
    create_github_actions
    create_issue_templates
    create_pr_template
    
    # Create initial commit
    create_initial_commit
    
    # Create GitHub repository
    if create_github_repo "$repo_name" "$repo_description" "$visibility"; then
        # Add remote and push
        repo_url="https://github.com/$(gh api user --jq .login)/$repo_name.git"
        add_remote "$repo_url"
        push_to_github
        
        echo ""
        success "🎉 Repository setup complete!"
        echo ""
        echo "Repository URL: https://github.com/$(gh api user --jq .login)/$repo_name"
        echo ""
        echo "Next steps:"
        echo "1. Configure repository secrets for CI/CD"
        echo "2. Set up branch protection rules"
        echo "3. Configure deployment environments"
        echo "4. Invite collaborators"
        echo ""
    else
        echo ""
        warning "Manual setup required. Please create the repository on GitHub and run:"
        echo "git remote add origin https://github.com/YOUR_USERNAME/$repo_name.git"
        echo "git branch -M main"
        echo "git push -u origin main"
    fi
}

# Run main function
main "$@"
