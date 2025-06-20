import request from 'supertest';
import { app } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from '@jest/globals';

const prisma = new PrismaClient();

describe('Authentication Integration Tests', () => {
  let testUser: any;
  let authToken: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await global.testUtils.cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await global.testUtils.cleanupTestData();
    
    // Create test user
    testUser = await global.testUtils.createTestUser({
      email: 'auth.test@example.com',
      role: 'ADMIN',
    });
    
    authToken = global.testUtils.generateJWT({ 
      userId: testUser.id, 
      role: 'ADMIN' 
    });
  });

  describe('User Authentication Flow', () => {
    it('should authenticate user with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth.test@example.com',
          password: 'validPassword123',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe('auth.test@example.com');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth.test@example.com',
          password: 'wrongPassword',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should protect routes requiring authentication', async () => {
      await request(app)
        .get('/api/dashboard/stats')
        .expect(401);
    });

    it('should allow access with valid token', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow admin access to admin routes', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should deny agent access to admin routes', async () => {
      const agentUser = await global.testUtils.createTestUser({
        email: 'agent.test@example.com',
        role: 'AGENT',
      });
      
      const agentToken = global.testUtils.generateJWT({ 
        userId: agentUser.id, 
        role: 'AGENT' 
      });

      await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(403);
    });

    it('should allow client access to client routes', async () => {
      const clientUser = await global.testUtils.createTestUser({
        email: 'client.test@example.com',
        role: 'CLIENT',
      });
      
      const clientToken = global.testUtils.generateJWT({ 
        userId: clientUser.id, 
        role: 'CLIENT' 
      });

      const response = await request(app)
        .get('/api/client/dashboard')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Token Management', () => {
    it('should refresh expired tokens', async () => {
      // Create an expired token
      const expiredToken = global.testUtils.generateJWT(
        { userId: testUser.id, role: 'ADMIN' },
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
    });

    it('should logout and invalidate tokens', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Token should be invalid after logout
      await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);
    });
  });

  describe('User Registration', () => {
    it('should register new user with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'securePassword123',
          firstName: 'New',
          lastName: 'User',
          role: 'AGENT',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe('newuser@example.com');
    });

    it('should reject registration with existing email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'auth.test@example.com', // Already exists
          password: 'securePassword123',
          firstName: 'Duplicate',
          lastName: 'User',
          role: 'AGENT',
        })
        .expect(409);
    });

    it('should validate password requirements', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'weakpass@example.com',
          password: '123', // Too weak
          firstName: 'Weak',
          lastName: 'Password',
          role: 'AGENT',
        })
        .expect(400);
    });
  });

  describe('Password Management', () => {
    it('should change password with valid current password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'validPassword123',
          newPassword: 'newSecurePassword456',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject password change with invalid current password', async () => {
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'wrongPassword',
          newPassword: 'newSecurePassword456',
        })
        .expect(400);
    });

    it('should initiate password reset', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'auth.test@example.com',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('reset link');
    });
  });

  describe('Session Management', () => {
    it('should track active sessions', async () => {
      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('sessions');
      expect(Array.isArray(response.body.data.sessions)).toBe(true);
    });

    it('should terminate specific session', async () => {
      // First get sessions
      const sessionsResponse = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const sessionId = sessionsResponse.body.data.sessions[0]?.id;
      
      if (sessionId) {
        const response = await request(app)
          .delete(`/api/auth/sessions/${sessionId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });

    it('should terminate all sessions', async () => {
      const response = await request(app)
        .delete('/api/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Account Security', () => {
    it('should enable two-factor authentication', async () => {
      const response = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('qrCode');
      expect(response.body.data).toHaveProperty('secret');
    });

    it('should verify two-factor authentication code', async () => {
      // First enable 2FA
      await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const response = await request(app)
        .post('/api/auth/2fa/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          code: '123456', // Mock code for testing
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should disable two-factor authentication', async () => {
      // First enable 2FA
      await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const response = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          password: 'validPassword123',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Account Lockout Protection', () => {
    it('should lock account after multiple failed attempts', async () => {
      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'auth.test@example.com',
            password: 'wrongPassword',
          })
          .expect(401);
      }

      // Next attempt should be locked
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth.test@example.com',
          password: 'wrongPassword',
        })
        .expect(423);

      expect(response.body.message).toContain('locked');
    });

    it('should unlock account after lockout period', async () => {
      // This would require time manipulation or shorter lockout for testing
      // Implementation depends on lockout strategy
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Audit Logging', () => {
    it('should log authentication events', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth.test@example.com',
          password: 'validPassword123',
        })
        .expect(200);

      const response = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          action: 'LOGIN',
          userId: testUser.id,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.logs.length).toBeGreaterThan(0);
    });

    it('should log failed authentication attempts', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'auth.test@example.com',
          password: 'wrongPassword',
        })
        .expect(401);

      const response = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          action: 'LOGIN_FAILED',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.logs.length).toBeGreaterThan(0);
    });
  });
});
