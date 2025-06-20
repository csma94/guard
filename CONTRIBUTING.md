# Contributing to BahinLink

Thank you for your interest in contributing to BahinLink! This document provides guidelines and information for contributors.

## 🤝 Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 15+
- Redis 7+
- Docker and Docker Compose
- Git

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/bahinlink.git
   cd bahinlink
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd backend && npm install
   cd ../admin-portal && npm install
   cd ../client-portal && npm install
   cd ../mobile-app && npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development services**
   ```bash
   docker-compose up -d postgres redis
   cd backend && npm run migrate:dev
   npm run dev
   ```

## 📝 How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/YOUR_USERNAME/bahinlink/issues)
2. If not, create a new issue using the bug report template
3. Provide detailed information including:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details
   - Screenshots if applicable

### Suggesting Features

1. Check existing [Issues](https://github.com/YOUR_USERNAME/bahinlink/issues) and [Discussions](https://github.com/YOUR_USERNAME/bahinlink/discussions)
2. Create a new feature request using the template
3. Describe the problem and proposed solution
4. Include use cases and examples

### Submitting Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the coding standards
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes**
   ```bash
   npm test
   npm run lint
   npm run type-check
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

5. **Push and create a pull request**
   ```bash
   git push origin feature/your-feature-name
   ```

## 🎯 Development Guidelines

### Code Style

- **TypeScript**: Use strict mode with proper typing
- **ESLint**: Follow Airbnb configuration
- **Prettier**: Automatic code formatting
- **Naming**: Use camelCase for variables, PascalCase for components

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:
```
feat: add real-time notifications
fix: resolve authentication token refresh issue
docs: update API documentation
test: add unit tests for user service
```

### Testing Requirements

- **Unit Tests**: 95%+ code coverage required
- **Integration Tests**: Test API endpoints and database operations
- **E2E Tests**: Test critical user workflows
- **Security Tests**: Validate security measures

### Code Review Process

1. All changes require pull request review
2. At least one approval from maintainers
3. All CI checks must pass
4. No merge conflicts
5. Documentation updated if needed

## 🏗️ Project Structure

```
bahinlink/
├── backend/                 # Node.js/TypeScript API
│   ├── src/
│   │   ├── controllers/     # Request handlers
│   │   ├── services/        # Business logic
│   │   ├── models/          # Data models
│   │   ├── middleware/      # Express middleware
│   │   └── utils/           # Utility functions
│   ├── tests/               # Test files
│   └── prisma/              # Database schema
├── admin-portal/            # React admin interface
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API services
│   │   ├── store/           # Redux store
│   │   └── utils/           # Utility functions
│   └── public/              # Static assets
├── client-portal/           # React client interface
├── mobile-app/              # React Native app
├── docs/                    # Documentation
├── scripts/                 # Build and deployment scripts
├── k8s/                     # Kubernetes configurations
└── monitoring/              # Monitoring configurations
```

## 🧪 Testing

### Running Tests

```bash
# All tests
npm test

# Backend tests
cd backend && npm test

# Frontend tests
cd admin-portal && npm test
cd client-portal && npm test

# Mobile tests
cd mobile-app && npm test

# E2E tests
npm run test:e2e

# Performance tests
npm run test:performance
```

### Writing Tests

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test API endpoints and database operations
- **Component Tests**: Test React components with user interactions
- **E2E Tests**: Test complete user workflows

Example unit test:
```typescript
describe('UserService', () => {
  it('should create a new user', async () => {
    const userData = {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User'
    };
    
    const user = await userService.createUser(userData);
    
    expect(user).toBeDefined();
    expect(user.email).toBe(userData.email);
  });
});
```

## 📚 Documentation

### API Documentation

- Use JSDoc for code documentation
- Update OpenAPI/Swagger specs for API changes
- Include examples and use cases

### User Documentation

- Update user guides for new features
- Include screenshots and step-by-step instructions
- Maintain deployment and configuration docs

## 🔒 Security

### Security Guidelines

- Never commit secrets or credentials
- Use environment variables for configuration
- Follow OWASP security practices
- Validate all user inputs
- Use parameterized queries

### Reporting Security Issues

Please report security vulnerabilities privately to security@bahinlink.com rather than creating public issues.

## 🚀 Deployment

### Development Deployment

```bash
docker-compose up -d
```

### Production Deployment

```bash
./scripts/deploy.sh production
```

See [deployment documentation](docs/deployment/) for detailed instructions.

## 📞 Getting Help

- **Documentation**: Check the [docs](docs/) directory
- **Issues**: Search existing [issues](https://github.com/YOUR_USERNAME/bahinlink/issues)
- **Discussions**: Join [discussions](https://github.com/YOUR_USERNAME/bahinlink/discussions)
- **Email**: Contact maintainers at dev@bahinlink.com

## 🏆 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes for significant contributions
- Annual contributor appreciation

## 📄 License

By contributing to BahinLink, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to BahinLink! 🙏
