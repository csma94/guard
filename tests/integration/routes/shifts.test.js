const request = require('supertest');
const app = require('../../../src/app');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

describe('Shifts API Integration Tests', () => {
  let authToken;
  let supervisorToken;
  let testUser;
  let testAgent;
  let testSite;
  let testShift;

  beforeAll(async () => {
    // Create test user and agent
    testUser = await prisma.user.create({
      data: {
        username: 'testshiftuser',
        email: 'testshift@example.com',
        password: '$2b$12$LQv3c1yqBwEHxE03uQDdu.vlRMuH5WMcA0J2u0/3YaaB8oTCOD1Em', // password123
        role: 'AGENT',
        isActive: true,
        profile: {
          firstName: 'Test',
          lastName: 'Agent',
          phone: '+1234567890',
        },
      },
    });

    testAgent = await prisma.agent.create({
      data: {
        userId: testUser.id,
        employeeId: 'EMP001',
        status: 'ACTIVE',
        skills: ['Security', 'Customer Service'],
        certifications: ['Basic Security'],
        hourlyRate: 25.00,
      },
    });

    // Create test supervisor
    const supervisorUser = await prisma.user.create({
      data: {
        username: 'testsupervisor',
        email: 'supervisor@example.com',
        password: '$2b$12$LQv3c1yqBwEHxE03uQDdu.vlRMuH5WMcA0J2u0/3YaaB8oTCOD1Em',
        role: 'SUPERVISOR',
        isActive: true,
        profile: {
          firstName: 'Test',
          lastName: 'Supervisor',
        },
      },
    });

    // Create test client and site
    const testClient = await prisma.client.create({
      data: {
        companyName: 'Test Security Client',
        contactPerson: {
          name: 'John Doe',
          email: 'john@testclient.com',
          phone: '+1234567890',
        },
        billingAddress: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
        },
        status: 'ACTIVE',
      },
    });

    testSite = await prisma.site.create({
      data: {
        clientId: testClient.id,
        name: 'Test Security Site',
        address: {
          street: '456 Site St',
          city: 'Site City',
          state: 'SC',
          zipCode: '67890',
        },
        coordinates: 'POINT(-122.4194 37.7749)',
        geofenceRadius: 100,
        status: 'ACTIVE',
      },
    });

    // Login to get tokens
    const agentLogin = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testshiftuser',
        password: 'password123',
      });
    authToken = agentLogin.body.token;

    const supervisorLogin = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testsupervisor',
        password: 'password123',
      });
    supervisorToken = supervisorLogin.body.token;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.shift.deleteMany({
      where: { agentId: testAgent.id },
    });
    await prisma.agent.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.site.deleteMany({
      where: { id: testSite.id },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [testUser.id] },
      },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/shifts', () => {
    it('should create a new shift with supervisor role', async () => {
      const shiftData = {
        siteId: testSite.id,
        agentId: testAgent.id,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString(),
        shiftType: 'REGULAR',
        requirements: {
          skills: ['Security'],
          certifications: [],
        },
        notes: 'Test shift creation',
      };

      const response = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(shiftData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.siteId).toBe(testSite.id);
      expect(response.body.agentId).toBe(testAgent.id);
      expect(response.body.status).toBe('SCHEDULED');

      testShift = response.body;
    });

    it('should reject shift creation without authorization', async () => {
      const shiftData = {
        siteId: testSite.id,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString(),
      };

      await request(app)
        .post('/api/shifts')
        .send(shiftData)
        .expect(401);
    });

    it('should reject shift creation with agent role', async () => {
      const shiftData = {
        siteId: testSite.id,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString(),
      };

      await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(shiftData)
        .expect(403);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({})
        .expect(400);

      expect(response.body.message).toContain('validation');
    });
  });

  describe('GET /api/shifts', () => {
    it('should get shifts for supervisor', async () => {
      const response = await request(app)
        .get('/api/shifts')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('shifts');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.shifts)).toBe(true);
    });

    it('should get agent own shifts', async () => {
      const response = await request(app)
        .get('/api/shifts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('shifts');
      expect(Array.isArray(response.body.shifts)).toBe(true);
    });

    it('should filter shifts by date range', async () => {
      const startDate = new Date().toISOString();
      const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const response = await request(app)
        .get('/api/shifts')
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.shifts).toBeDefined();
    });

    it('should filter shifts by site', async () => {
      const response = await request(app)
        .get('/api/shifts')
        .query({ siteId: testSite.id })
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.shifts).toBeDefined();
    });
  });

  describe('GET /api/shifts/:id', () => {
    it('should get shift by ID for supervisor', async () => {
      const response = await request(app)
        .get(`/api/shifts/${testShift.id}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(response.body.id).toBe(testShift.id);
      expect(response.body).toHaveProperty('site');
      expect(response.body).toHaveProperty('agent');
    });

    it('should get own shift for agent', async () => {
      const response = await request(app)
        .get(`/api/shifts/${testShift.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(testShift.id);
    });

    it('should return 404 for non-existent shift', async () => {
      await request(app)
        .get('/api/shifts/non-existent-id')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/shifts/:id', () => {
    it('should update shift with supervisor role', async () => {
      const updateData = {
        notes: 'Updated shift notes',
        requirements: {
          skills: ['Security', 'Customer Service'],
          certifications: ['Basic Security'],
        },
      };

      const response = await request(app)
        .put(`/api/shifts/${testShift.id}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.notes).toBe('Updated shift notes');
      expect(response.body.requirements.skills).toContain('Customer Service');
    });

    it('should reject update with agent role', async () => {
      const updateData = {
        notes: 'Agent trying to update',
      };

      await request(app)
        .put(`/api/shifts/${testShift.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(403);
    });

    it('should validate update data', async () => {
      const invalidData = {
        startTime: 'invalid-date',
      };

      await request(app)
        .put(`/api/shifts/${testShift.id}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send(invalidData)
        .expect(400);
    });
  });

  describe('POST /api/shifts/:id/assign', () => {
    it('should assign agent to shift', async () => {
      // Create unassigned shift
      const unassignedShift = await prisma.shift.create({
        data: {
          siteId: testSite.id,
          startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 56 * 60 * 60 * 1000),
          status: 'SCHEDULED',
          createdBy: testUser.id,
        },
      });

      const response = await request(app)
        .post(`/api/shifts/${unassignedShift.id}/assign`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ agentId: testAgent.id })
        .expect(200);

      expect(response.body.agentId).toBe(testAgent.id);
      expect(response.body.status).toBe('CONFIRMED');

      // Clean up
      await prisma.shift.delete({ where: { id: unassignedShift.id } });
    });

    it('should reject assignment with agent role', async () => {
      await request(app)
        .post(`/api/shifts/${testShift.id}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentId: testAgent.id })
        .expect(403);
    });
  });

  describe('POST /api/shifts/:id/start', () => {
    beforeEach(async () => {
      // Update shift to be ready to start
      await prisma.shift.update({
        where: { id: testShift.id },
        data: {
          startTime: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
          status: 'CONFIRMED',
        },
      });
    });

    it('should start shift for assigned agent', async () => {
      const response = await request(app)
        .post(`/api/shifts/${testShift.id}/start`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          location: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
        })
        .expect(200);

      expect(response.body.status).toBe('IN_PROGRESS');
    });

    it('should reject start for non-assigned agent', async () => {
      // Create another agent
      const anotherUser = await prisma.user.create({
        data: {
          username: 'anothertestuser',
          email: 'another@example.com',
          password: '$2b$12$LQv3c1yqBwEHxE03uQDdu.vlRMuH5WMcA0J2u0/3YaaB8oTCOD1Em',
          role: 'AGENT',
          isActive: true,
        },
      });

      const anotherAgent = await prisma.agent.create({
        data: {
          userId: anotherUser.id,
          employeeId: 'EMP002',
          status: 'ACTIVE',
        },
      });

      const anotherLogin = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'anothertestuser',
          password: 'password123',
        });

      await request(app)
        .post(`/api/shifts/${testShift.id}/start`)
        .set('Authorization', `Bearer ${anotherLogin.body.token}`)
        .send({
          location: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
        })
        .expect(403);

      // Clean up
      await prisma.agent.delete({ where: { id: anotherAgent.id } });
      await prisma.user.delete({ where: { id: anotherUser.id } });
    });
  });

  describe('POST /api/shifts/:id/complete', () => {
    beforeEach(async () => {
      // Update shift to be in progress
      await prisma.shift.update({
        where: { id: testShift.id },
        data: {
          status: 'IN_PROGRESS',
        },
      });
    });

    it('should complete shift for assigned agent', async () => {
      const response = await request(app)
        .post(`/api/shifts/${testShift.id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          location: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
          notes: 'Shift completed successfully',
        })
        .expect(200);

      expect(response.body.status).toBe('COMPLETED');
    });

    it('should reject completion by supervisor without proper authorization', async () => {
      await request(app)
        .post(`/api/shifts/${testShift.id}/complete`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          location: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
        })
        .expect(403);
    });
  });

  describe('DELETE /api/shifts/:id', () => {
    it('should delete shift with supervisor role', async () => {
      // Create a shift to delete
      const shiftToDelete = await prisma.shift.create({
        data: {
          siteId: testSite.id,
          startTime: new Date(Date.now() + 72 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 80 * 60 * 60 * 1000),
          status: 'SCHEDULED',
          createdBy: testUser.id,
        },
      });

      await request(app)
        .delete(`/api/shifts/${shiftToDelete.id}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(204);

      // Verify deletion
      const deletedShift = await prisma.shift.findUnique({
        where: { id: shiftToDelete.id },
      });
      expect(deletedShift).toBeNull();
    });

    it('should reject deletion with agent role', async () => {
      await request(app)
        .delete(`/api/shifts/${testShift.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });
  });
});
