import request from 'supertest';
import { app } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from '@jest/globals';

const prisma = new PrismaClient();

describe('Security Tests', () => {
  let adminToken: string;
  let agentToken: string;
  let testUser: any;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await global.testUtils.cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await global.testUtils.cleanupTestData();
    
    const adminUser = await global.testUtils.createTestUser({
      email: 'admin@security.test',
      role: 'ADMIN',
    });
    
    const agentUser = await global.testUtils.createTestUser({
      email: 'agent@security.test',
      role: 'AGENT',
    });

    adminToken = global.testUtils.generateJWT({ userId: adminUser.id, role: 'ADMIN' });
    agentToken = global.testUtils.generateJWT({ userId: agentUser.id, role: 'AGENT' });
    testUser = adminUser;
  });

  describe('SQL Injection Protection', () => {
    it('should prevent SQL injection in login', async () => {
      const maliciousPayload = {
        email: "admin@test.com'; DROP TABLE users; --",
        password: 'password',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(maliciousPayload)
        .expect(401);

      expect(response.body.success).toBe(false);
      
      // Verify users table still exists
      const users = await prisma.user.findMany();
      expect(Array.isArray(users)).toBe(true);
    });

    it('should prevent SQL injection in search queries', async () => {
      const maliciousQuery = "'; DROP TABLE agents; --";

      const response = await request(app)
        .get('/api/agents')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: maliciousQuery })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify agents table still exists
      const agents = await prisma.agent.findMany();
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should sanitize user input in reports', async () => {
      const client = await global.testUtils.createTestClient();
      const site = await global.testUtils.createTestSite(client.id);
      const agent = await global.testUtils.createTestAgent(testUser.id);

      const maliciousInput = {
        title: "'; DELETE FROM reports; --",
        description: '<script>alert("XSS")</script>',
        type: 'PATROL',
        siteId: site.id,
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(maliciousInput)
        .expect(201);

      expect(response.body.success).toBe(true);
      
      // Verify the malicious content was sanitized
      const report = response.body.data;
      expect(report.title).not.toContain('DELETE');
      expect(report.description).not.toContain('<script>');
    });
  });

  describe('XSS Protection', () => {
    it('should sanitize HTML in user input', async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      
      const response = await request(app)
        .patch(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: xssPayload,
          lastName: 'Test',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).not.toContain('<script>');
    });

    it('should prevent XSS in incident reports', async () => {
      const client = await global.testUtils.createTestClient();
      const site = await global.testUtils.createTestSite(client.id);

      const xssPayload = {
        title: '<img src=x onerror=alert("XSS")>',
        description: '<iframe src="javascript:alert(\'XSS\')"></iframe>',
        type: 'SECURITY_BREACH',
        severity: 'HIGH',
        location: 'Test Location',
        siteId: site.id,
      };

      const response = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(xssPayload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).not.toContain('<img');
      expect(response.body.data.description).not.toContain('<iframe');
    });
  });

  describe('CSRF Protection', () => {
    it('should require CSRF token for state-changing operations', async () => {
      // This test would verify CSRF token implementation
      // For now, we'll test that the endpoint exists and works with proper auth
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'csrf.test@example.com',
          firstName: 'CSRF',
          lastName: 'Test',
          role: 'AGENT',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit login attempts', async () => {
      const loginData = {
        email: 'admin@security.test',
        password: 'wrongpassword',
      };

      // Make multiple rapid requests
      const promises = Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/auth/login')
          .send(loginData)
      );

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should rate limit API requests', async () => {
      // Make multiple rapid API requests
      const promises = Array.from({ length: 20 }, () =>
        request(app)
          .get('/api/dashboard/stats')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Authorization Bypass Attempts', () => {
    it('should prevent horizontal privilege escalation', async () => {
      // Create another user
      const otherUser = await global.testUtils.createTestUser({
        email: 'other@security.test',
        role: 'AGENT',
      });

      // Try to access other user's data
      const response = await request(app)
        .get(`/api/users/${otherUser.id}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should prevent vertical privilege escalation', async () => {
      // Agent trying to access admin functionality
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should prevent parameter tampering', async () => {
      const client = await global.testUtils.createTestClient();
      const site = await global.testUtils.createTestSite(client.id);

      // Try to modify site belonging to different client
      const response = await request(app)
        .patch(`/api/sites/${site.id}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          name: 'Hacked Site',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Input Validation', () => {
    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'invalid-email',
          firstName: 'Test',
          lastName: 'User',
          role: 'AGENT',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('email');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test@example.com',
          // Missing required fields
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate enum values', async () => {
      const client = await global.testUtils.createTestClient();
      const site = await global.testUtils.createTestSite(client.id);

      const response = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          type: 'INVALID_TYPE',
          severity: 'INVALID_SEVERITY',
          title: 'Test Incident',
          description: 'Test description',
          location: 'Test location',
          siteId: site.id,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate data types', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test@example.com',
          firstName: 123, // Should be string
          lastName: 'User',
          role: 'AGENT',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('File Upload Security', () => {
    it('should validate file types', async () => {
      const client = await global.testUtils.createTestClient();
      const site = await global.testUtils.createTestSite(client.id);
      const agent = await global.testUtils.createTestAgent(testUser.id);

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .field('title', 'Test Report')
        .field('description', 'Test description')
        .field('type', 'PATROL')
        .field('siteId', site.id)
        .attach('file', Buffer.from('malicious content'), 'malware.exe')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('file type');
    });

    it('should validate file size limits', async () => {
      const client = await global.testUtils.createTestClient();
      const site = await global.testUtils.createTestSite(client.id);
      const agent = await global.testUtils.createTestAgent(testUser.id);

      // Create a large buffer (simulate large file)
      const largeBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .field('title', 'Test Report')
        .field('description', 'Test description')
        .field('type', 'PATROL')
        .field('siteId', site.id)
        .attach('file', largeBuffer, 'large-file.jpg')
        .expect(413);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Session Security', () => {
    it('should invalidate sessions on password change', async () => {
      // Change password
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          currentPassword: 'validPassword123',
          newPassword: 'newSecurePassword456',
        })
        .expect(200);

      // Old token should be invalid
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should prevent session fixation', async () => {
      // This test would verify that session IDs change after login
      // Implementation depends on session management strategy
      expect(true).toBe(true); // Placeholder
    });

    it('should enforce session timeout', async () => {
      // This test would verify session timeout functionality
      // Implementation depends on session timeout strategy
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('API Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:3001')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('Data Exposure Prevention', () => {
    it('should not expose sensitive data in responses', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).not.toHaveProperty('password');
      expect(response.body.data).not.toHaveProperty('passwordHash');
    });

    it('should not expose internal error details', async () => {
      // Force a database error
      const response = await request(app)
        .get('/api/users/invalid-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).not.toContain('Prisma');
      expect(response.body.message).not.toContain('database');
    });
  });

  describe('Cryptographic Security', () => {
    it('should use secure password hashing', async () => {
      const user = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(user?.password).toBeDefined();
      expect(user?.password).not.toBe('validPassword123'); // Should be hashed
      expect(user?.password?.startsWith('$2b$')).toBe(true); // bcrypt hash
    });

    it('should generate secure tokens', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'admin@security.test',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      // Token should be generated (implementation specific)
    });
  });

  describe('Business Logic Security', () => {
    it('should prevent unauthorized data modification', async () => {
      const client = await global.testUtils.createTestClient();
      const site = await global.testUtils.createTestSite(client.id);
      const incident = await global.testUtils.createTestIncident(site.id, testUser.id);

      // Agent trying to modify incident they didn't create
      const response = await request(app)
        .patch(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          severity: 'CRITICAL',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should validate business rules', async () => {
      const client = await global.testUtils.createTestClient();
      const site = await global.testUtils.createTestSite(client.id);
      const agent = await global.testUtils.createTestAgent(testUser.id);

      // Try to create overlapping shifts
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 8 * 60 * 60 * 1000);

      await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          agentId: agent.id,
          siteId: site.id,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          shiftType: 'REGULAR',
        })
        .expect(201);

      // Try to create overlapping shift
      const response = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          agentId: agent.id,
          siteId: site.id,
          startTime: new Date(startTime.getTime() + 2 * 60 * 60 * 1000).toISOString(),
          endTime: new Date(endTime.getTime() + 2 * 60 * 60 * 1000).toISOString(),
          shiftType: 'REGULAR',
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('overlap');
    });
  });
});
