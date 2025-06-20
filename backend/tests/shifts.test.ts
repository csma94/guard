import request from 'supertest';
import { app } from '../src/app';
import {
  createTestSuite,
  TestUserFactory,
  TestTokenManager,
  TestAssertions,
  TestDataGenerator,
} from '../../shared/testing/testUtils';

createTestSuite('Shifts API', (testContext) => {
  let adminUser: any;
  let agentUser: any;
  let clientUser: any;
  let adminToken: string;
  let agentToken: string;
  let clientToken: string;

  beforeEach(async () => {
    // Create test users
    adminUser = await TestUserFactory.createAdminUser();
    agentUser = await TestUserFactory.createAgentUser('agent-1');
    clientUser = await TestUserFactory.createClientUser('client-1');

    // Generate tokens
    adminToken = TestTokenManager.generateAccessToken(adminUser);
    agentToken = TestTokenManager.generateAccessToken(agentUser);
    clientToken = TestTokenManager.generateAccessToken(clientUser);
  });

  describe('GET /api/shifts', () => {
    it('should return shifts for admin user', async () => {
      const response = await request(app)
        .get('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(response);
      TestAssertions.expectPaginatedResponse(response);
    });

    it('should return only agent shifts for agent user', async () => {
      const response = await request(app)
        .get('/api/shifts')
        .set('Authorization', `Bearer ${agentToken}`);

      TestAssertions.expectSuccess(response);
      // Verify that only shifts for this agent are returned
      if (response.body.data.length > 0) {
        response.body.data.forEach((shift: any) => {
          expect(shift.agentId).toBe(agentUser.agentId);
        });
      }
    });

    it('should support filtering by date range', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-01-31').toISOString();

      const response = await request(app)
        .get('/api/shifts')
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(response);
    });

    it('should support filtering by site', async () => {
      const response = await request(app)
        .get('/api/shifts')
        .query({ siteId: 'site-1' })
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(response);
    });

    it('should support filtering by status', async () => {
      const response = await request(app)
        .get('/api/shifts')
        .query({ status: 'scheduled' })
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(response);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/shifts');

      TestAssertions.expectUnauthorized(response);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/shifts')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(response);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });
  });

  describe('GET /api/shifts/:id', () => {
    it('should return shift details for admin', async () => {
      const shiftData = TestDataGenerator.generateShiftData();
      
      // Create shift first
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .get(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(response);
      expect(response.body.data.id).toBe(shiftId);
    });

    it('should allow agent to view their own shift', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
      });
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .get(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      TestAssertions.expectSuccess(response);
    });

    it('should prevent agent from viewing other agent shifts', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: 'other-agent',
      });
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .get(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      TestAssertions.expectForbidden(response);
    });

    it('should return 404 for non-existent shift', async () => {
      const response = await request(app)
        .get('/api/shifts/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectNotFound(response);
    });
  });

  describe('POST /api/shifts', () => {
    it('should create shift with valid data', async () => {
      const shiftData = TestDataGenerator.generateShiftData();

      const response = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      TestAssertions.expectSuccess(response);
      expect(response.body.data).toMatchObject({
        agentId: shiftData.agentId,
        siteId: shiftData.siteId,
        status: shiftData.status,
      });
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      TestAssertions.expectValidationError(response, 'agentId');
    });

    it('should validate date ranges', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: new Date('2024-01-01T08:00:00Z'), // End before start
      });

      const response = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      TestAssertions.expectValidationError(response, 'endTime');
    });

    it('should prevent overlapping shifts for same agent', async () => {
      const baseShiftData = TestDataGenerator.generateShiftData({
        agentId: 'agent-1',
        startTime: new Date('2024-01-01T09:00:00Z'),
        endTime: new Date('2024-01-01T17:00:00Z'),
      });

      // Create first shift
      await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(baseShiftData);

      // Try to create overlapping shift
      const overlappingShiftData = TestDataGenerator.generateShiftData({
        agentId: 'agent-1',
        startTime: new Date('2024-01-01T15:00:00Z'),
        endTime: new Date('2024-01-01T23:00:00Z'),
      });

      const response = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(overlappingShiftData);

      expect(response.status).toBe(409); // Conflict
    });

    it('should require admin or supervisor permissions', async () => {
      const shiftData = TestDataGenerator.generateShiftData();

      const response = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(shiftData);

      TestAssertions.expectForbidden(response);
    });
  });

  describe('PUT /api/shifts/:id', () => {
    it('should update shift with valid data', async () => {
      const shiftData = TestDataGenerator.generateShiftData();
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;
      const updateData = { status: 'in_progress' };

      const response = await request(app)
        .put(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      TestAssertions.expectSuccess(response);
      expect(response.body.data.status).toBe('in_progress');
    });

    it('should allow agent to update their own shift status', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
      });
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .put(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ status: 'in_progress' });

      TestAssertions.expectSuccess(response);
    });

    it('should prevent agent from updating other fields', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
      });
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .put(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ 
          status: 'in_progress',
          agentId: 'different-agent', // Should be ignored
        });

      TestAssertions.expectSuccess(response);
      expect(response.body.data.agentId).toBe(agentUser.agentId);
    });

    it('should validate status transitions', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        status: 'completed',
      });
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .put(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'scheduled' }); // Invalid transition

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/shifts/:id', () => {
    it('should delete shift as admin', async () => {
      const shiftData = TestDataGenerator.generateShiftData();
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .delete(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(response);
    });

    it('should prevent deletion of active shifts', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        status: 'in_progress',
      });
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .delete(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
    });

    it('should require admin permissions', async () => {
      const shiftData = TestDataGenerator.generateShiftData();
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .delete(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      TestAssertions.expectForbidden(response);
    });
  });

  describe('POST /api/shifts/:id/check-in', () => {
    it('should allow agent to check in to their shift', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
        status: 'scheduled',
      });
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .post(`/api/shifts/${shiftId}/check-in`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: 40.7128,
            longitude: -74.0060,
          },
        });

      TestAssertions.expectSuccess(response);
      expect(response.body.data.status).toBe('in_progress');
    });

    it('should validate location if geofencing is enabled', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
        status: 'scheduled',
        requiresGeofence: true,
      });
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .post(`/api/shifts/${shiftId}/check-in`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: 0, // Far from site
            longitude: 0,
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/location/i);
    });
  });

  describe('POST /api/shifts/:id/check-out', () => {
    it('should allow agent to check out of their shift', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
        status: 'in_progress',
      });
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .post(`/api/shifts/${shiftId}/check-out`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: 40.7128,
            longitude: -74.0060,
          },
        });

      TestAssertions.expectSuccess(response);
      expect(response.body.data.status).toBe('completed');
    });

    it('should require shift to be in progress', async () => {
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
        status: 'scheduled',
      });
      
      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      const response = await request(app)
        .post(`/api/shifts/${shiftId}/check-out`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: 40.7128,
            longitude: -74.0060,
          },
        });

      expect(response.status).toBe(400);
    });
  });
});
