const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
// Note: bcrypt removed - authentication now handled by Clerk
const app = require('../../src/server');

const prisma = new PrismaClient();

describe('Authentication Integration Tests', () => {
  let testUser;
  let testAgent;
  let authToken;

  beforeAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'test' },
      },
    });

    // Create test user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    testUser = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@example.com',
        password: hashedPassword,
        role: 'AGENT',
        profile: {
          firstName: 'Test',
          lastName: 'User',
          phoneNumber: '+1234567890',
        },
        isActive: true,
        emailVerified: true,
      },
    });

    // Create test agent
    testAgent = await prisma.agent.create({
      data: {
        userId: testUser.id,
        employeeId: 'EMP001',
        employmentStatus: 'ACTIVE',
        employmentType: 'FULL_TIME',
        skills: ['Security', 'Patrol'],
        hourlyRate: 25.00,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.agent.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.user.deleteMany({
      where: { id: testUser.id },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'testpassword123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe('testuser');
      expect(response.body.user.role).toBe('AGENT');

      authToken = response.body.token;
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          // missing password
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Validation failed');
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken;

    beforeAll(async () => {
      // Get refresh token from login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'testpassword123',
        });
      
      refreshToken = loginResponse.body.refreshToken;
    });

    it('should refresh token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken,
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-token',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe(testUser.id);
      expect(response.body.user.username).toBe('testuser');
      expect(response.body.user).toHaveProperty('agent');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('No token provided');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Logged out successfully');
    });

    it('should handle logout without token gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Password Reset Flow', () => {
    it('should initiate password reset', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'test@example.com',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Password reset email sent');
    });

    it('should handle non-existent email gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'nonexistent@example.com',
        })
        .expect(200); // Should not reveal if email exists

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Role-based Access Control', () => {
    let adminToken;
    let supervisorToken;

    beforeAll(async () => {
      // Create admin user
      const adminUser = await prisma.user.create({
        data: {
          username: 'testadmin',
          email: 'admin@example.com',
          password: await bcrypt.hash('adminpass123', 10),
          role: 'ADMIN',
          profile: {
            firstName: 'Admin',
            lastName: 'User',
          },
          isActive: true,
          emailVerified: true,
        },
      });

      // Create supervisor user
      const supervisorUser = await prisma.user.create({
        data: {
          username: 'testsupervisor',
          email: 'supervisor@example.com',
          password: await bcrypt.hash('supervisorpass123', 10),
          role: 'SUPERVISOR',
          profile: {
            firstName: 'Supervisor',
            lastName: 'User',
          },
          isActive: true,
          emailVerified: true,
        },
      });

      // Get tokens
      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testadmin',
          password: 'adminpass123',
        });
      adminToken = adminLogin.body.token;

      const supervisorLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testsupervisor',
          password: 'supervisorpass123',
        });
      supervisorToken = supervisorLogin.body.token;
    });

    it('should allow admin access to admin endpoints', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('users');
    });

    it('should allow supervisor access to supervisor endpoints', async () => {
      const response = await request(app)
        .get('/api/shifts')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('shifts');
    });

    it('should deny agent access to admin endpoints', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Insufficient permissions');
    });
  });

  describe('Token Expiration and Security', () => {
    it('should reject expired token', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId: testUser.id, role: 'AGENT' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Token expired');
    });

    it('should reject malformed token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer malformed.token.here')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });

    it('should handle missing Authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('No token provided');
    });
  });
});
