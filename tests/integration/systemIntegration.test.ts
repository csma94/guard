import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { WebSocket } from 'ws';
import { app } from '../../backend/src/app';
import { 
  createTestDatabase, 
  cleanupTestDatabase,
  createTestUser,
  createTestClient,
  createTestSite,
  createTestAgent,
  TestTokenManager 
} from '../../shared/testing/testUtils';

describe('System Integration Tests', () => {
  let testDatabase: any;
  let adminUser: any;
  let agentUser: any;
  let clientUser: any;
  let adminToken: string;
  let agentToken: string;
  let clientToken: string;
  let testClient: any;
  let testSite: any;
  let testAgent: any;

  beforeAll(async () => {
    // Setup test database
    testDatabase = await createTestDatabase();
    
    // Create test users
    adminUser = await createTestUser({ role: 'admin' });
    agentUser = await createTestUser({ role: 'agent' });
    clientUser = await createTestUser({ role: 'client' });
    
    // Generate tokens
    adminToken = TestTokenManager.generateAccessToken(adminUser);
    agentToken = TestTokenManager.generateAccessToken(agentUser);
    clientToken = TestTokenManager.generateAccessToken(clientUser);
    
    // Create test entities
    testClient = await createTestClient();
    testSite = await createTestSite({ clientId: testClient.id });
    testAgent = await createTestAgent({ userId: agentUser.id });
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  beforeEach(async () => {
    // Reset test data state before each test
    await testDatabase.reset();
  });

  describe('End-to-End Workflow Integration', () => {
    test('Complete shift lifecycle with real-time updates', async () => {
      // Step 1: Admin creates a shift
      const shiftData = {
        agentId: testAgent.id,
        siteId: testSite.id,
        startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(),
        shiftType: 'regular',
        status: 'scheduled'
      };

      const createShiftResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData)
        .expect(201);

      const shiftId = createShiftResponse.body.data.id;
      expect(shiftId).toBeDefined();

      // Step 2: Verify shift appears in agent's schedule
      const agentShiftsResponse = await request(app)
        .get('/api/shifts/my-shifts')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);

      expect(agentShiftsResponse.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: shiftId })
        ])
      );

      // Step 3: Agent checks in to shift
      const checkInResponse = await request(app)
        .post(`/api/shifts/${shiftId}/check-in`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: testSite.coordinates.latitude,
            longitude: testSite.coordinates.longitude
          }
        })
        .expect(200);

      expect(checkInResponse.body.data.status).toBe('in_progress');
      expect(checkInResponse.body.data.actualStartTime).toBeDefined();

      // Step 4: Verify real-time location update
      const locationUpdateResponse = await request(app)
        .post(`/api/shifts/${shiftId}/update-location`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: testSite.coordinates.latitude + 0.001,
            longitude: testSite.coordinates.longitude + 0.001
          }
        })
        .expect(200);

      expect(locationUpdateResponse.body.success).toBe(true);

      // Step 5: Agent creates incident report
      const incidentData = {
        shiftId,
        siteId: testSite.id,
        type: 'incident',
        title: 'Security Breach',
        content: 'Unauthorized access detected',
        priority: 'high',
        location: {
          latitude: testSite.coordinates.latitude,
          longitude: testSite.coordinates.longitude
        }
      };

      const incidentResponse = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(incidentData)
        .expect(201);

      const incidentId = incidentResponse.body.data.id;

      // Step 6: Verify incident appears in admin dashboard
      const adminIncidentsResponse = await request(app)
        .get('/api/reports')
        .query({ type: 'incident', priority: 'high' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(adminIncidentsResponse.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: incidentId })
        ])
      );

      // Step 7: Agent checks out of shift
      const checkOutResponse = await request(app)
        .post(`/api/shifts/${shiftId}/check-out`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: testSite.coordinates.latitude,
            longitude: testSite.coordinates.longitude
          }
        })
        .expect(200);

      expect(checkOutResponse.body.data.status).toBe('completed');
      expect(checkOutResponse.body.data.actualEndTime).toBeDefined();

      // Step 8: Verify shift completion in analytics
      const analyticsResponse = await request(app)
        .get('/api/analytics/shifts')
        .query({
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(analyticsResponse.body.data.totalShifts).toBeGreaterThan(0);
    });

    test('Emergency alert workflow with multi-user notifications', async () => {
      // Step 1: Agent triggers emergency alert
      const emergencyData = {
        type: 'medical',
        location: {
          latitude: testSite.coordinates.latitude,
          longitude: testSite.coordinates.longitude
        },
        description: 'Medical emergency - person unconscious',
        severity: 'critical'
      };

      const emergencyResponse = await request(app)
        .post('/api/emergency/alert')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(emergencyData)
        .expect(201);

      const alertId = emergencyResponse.body.data.id;

      // Step 2: Verify alert appears in admin notifications
      const notificationsResponse = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(notificationsResponse.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'emergency_alert',
            relatedId: alertId
          })
        ])
      );

      // Step 3: Admin responds to emergency
      const responseData = {
        response: 'Emergency services contacted, ETA 5 minutes',
        responderName: adminUser.username
      };

      const respondResponse = await request(app)
        .post(`/api/emergency/alerts/${alertId}/respond`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(responseData)
        .expect(200);

      expect(respondResponse.body.data.status).toBe('responded');

      // Step 4: Verify response notification sent to agent
      const agentNotificationsResponse = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);

      expect(agentNotificationsResponse.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'emergency_response',
            relatedId: alertId
          })
        ])
      );

      // Step 5: Resolve emergency
      const resolutionData = {
        resolution: 'Medical team arrived, situation handled',
        outcome: 'resolved'
      };

      const resolveResponse = await request(app)
        .post(`/api/emergency/alerts/${alertId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(resolutionData)
        .expect(200);

      expect(resolveResponse.body.data.status).toBe('resolved');
    });
  });

  describe('Real-time Communication Integration', () => {
    test('WebSocket connection and message broadcasting', async () => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket test timeout'));
        }, 10000);

        // Create WebSocket connections for different users
        const adminWs = new WebSocket('ws://localhost:3001', {
          headers: { authorization: `Bearer ${adminToken}` }
        });

        const agentWs = new WebSocket('ws://localhost:3001', {
          headers: { authorization: `Bearer ${agentToken}` }
        });

        let adminConnected = false;
        let agentConnected = false;
        let messageReceived = false;

        const checkCompletion = () => {
          if (adminConnected && agentConnected && messageReceived) {
            clearTimeout(timeout);
            adminWs.close();
            agentWs.close();
            resolve(undefined);
          }
        };

        adminWs.on('open', () => {
          adminConnected = true;
          checkCompletion();
        });

        agentWs.on('open', () => {
          agentConnected = true;
          
          // Send a message from agent
          agentWs.send(JSON.stringify({
            type: 'location_update',
            payload: {
              latitude: testSite.coordinates.latitude,
              longitude: testSite.coordinates.longitude,
              timestamp: new Date().toISOString()
            }
          }));
        });

        adminWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'location_update') {
            messageReceived = true;
            expect(message.payload.latitude).toBeDefined();
            expect(message.payload.longitude).toBeDefined();
            checkCompletion();
          }
        });

        adminWs.on('error', reject);
        agentWs.on('error', reject);
      });
    });
  });

  describe('Data Consistency Integration', () => {
    test('Cross-service data synchronization', async () => {
      // Step 1: Create shift through API
      const shiftData = {
        agentId: testAgent.id,
        siteId: testSite.id,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        shiftType: 'regular'
      };

      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData)
        .expect(201);

      const shiftId = createResponse.body.data.id;

      // Step 2: Verify shift appears in analytics
      const analyticsResponse = await request(app)
        .get('/api/analytics/shifts')
        .query({ shiftId })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(analyticsResponse.body.data.shifts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: shiftId })
        ])
      );

      // Step 3: Update shift and verify consistency
      const updateData = { status: 'in_progress' };
      
      await request(app)
        .put(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      // Step 4: Verify update reflected across services
      const updatedShiftResponse = await request(app)
        .get(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(updatedShiftResponse.body.data.status).toBe('in_progress');

      const updatedAnalyticsResponse = await request(app)
        .get('/api/analytics/shifts')
        .query({ shiftId })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const analyticsShift = updatedAnalyticsResponse.body.data.shifts.find(
        (s: any) => s.id === shiftId
      );
      expect(analyticsShift.status).toBe('in_progress');
    });
  });

  describe('Performance Integration', () => {
    test('System performance under load', async () => {
      const concurrentRequests = 50;
      const requests = [];

      // Create multiple concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          request(app)
            .get('/api/shifts')
            .set('Authorization', `Bearer ${adminToken}`)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();

      // Verify all requests succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify reasonable response time
      const totalTime = endTime - startTime;
      const averageTime = totalTime / concurrentRequests;
      expect(averageTime).toBeLessThan(1000); // Less than 1 second average
    });
  });

  describe('Security Integration', () => {
    test('Authentication and authorization flow', async () => {
      // Test unauthorized access
      await request(app)
        .get('/api/shifts')
        .expect(401);

      // Test invalid token
      await request(app)
        .get('/api/shifts')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      // Test insufficient permissions
      await request(app)
        .delete(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(403);

      // Test valid access
      await request(app)
        .get('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    test('Data access control by role', async () => {
      // Admin can access all data
      const adminShiftsResponse = await request(app)
        .get('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Agent can only access their own shifts
      const agentShiftsResponse = await request(app)
        .get('/api/shifts')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);

      // Client can only access their assigned data
      const clientSitesResponse = await request(app)
        .get('/api/sites')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      // Verify data filtering
      expect(adminShiftsResponse.body.data.length).toBeGreaterThanOrEqual(
        agentShiftsResponse.body.data.length
      );
    });
  });

  describe('Error Handling Integration', () => {
    test('Graceful error handling across services', async () => {
      // Test database connection error handling
      const invalidShiftData = {
        agentId: 'invalid-id',
        siteId: 'invalid-id',
        startTime: 'invalid-date',
        endTime: 'invalid-date'
      };

      const errorResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidShiftData)
        .expect(400);

      expect(errorResponse.body.success).toBe(false);
      expect(errorResponse.body.error).toBeDefined();
      expect(errorResponse.body.error.code).toBeDefined();
      expect(errorResponse.body.error.message).toBeDefined();
    });
  });

  describe('Backup and Recovery Integration', () => {
    test('Data backup and restoration', async () => {
      // Create test data
      const shiftData = {
        agentId: testAgent.id,
        siteId: testSite.id,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
      };

      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData)
        .expect(201);

      const shiftId = createResponse.body.data.id;

      // Trigger backup
      const backupResponse = await request(app)
        .post('/api/admin/backup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(backupResponse.body.data.backupId).toBeDefined();

      // Verify data integrity after backup
      const verifyResponse = await request(app)
        .get(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(verifyResponse.body.data.id).toBe(shiftId);
    });
  });
});

describe('System Health Checks', () => {
  test('All services health check', async () => {
    const healthResponse = await request(app)
      .get('/health')
      .expect(200);

    expect(healthResponse.body.status).toBe('healthy');
    expect(healthResponse.body.services).toBeDefined();
    expect(healthResponse.body.services.database).toBe('healthy');
    expect(healthResponse.body.services.redis).toBe('healthy');
    expect(healthResponse.body.services.websocket).toBe('healthy');
  });

  test('Database connectivity', async () => {
    const dbHealthResponse = await request(app)
      .get('/health/database')
      .expect(200);

    expect(dbHealthResponse.body.status).toBe('healthy');
    expect(dbHealthResponse.body.responseTime).toBeLessThan(1000);
  });

  test('Redis connectivity', async () => {
    const redisHealthResponse = await request(app)
      .get('/health/redis')
      .expect(200);

    expect(redisHealthResponse.body.status).toBe('healthy');
    expect(redisHealthResponse.body.responseTime).toBeLessThan(500);
  });
});
