import request from 'supertest';
import { app } from '../../src/app';
import {
  createTestSuite,
  TestUserFactory,
  TestTokenManager,
  TestAssertions,
  TestDataGenerator,
} from '../../../shared/testing/testUtils';

createTestSuite('Shift Workflow Integration', (testContext) => {
  let adminUser: any;
  let agentUser: any;
  let clientUser: any;
  let adminToken: string;
  let agentToken: string;
  let clientToken: string;
  let testSite: any;
  let testClient: any;

  beforeEach(async () => {
    // Create test users
    adminUser = await TestUserFactory.createAdminUser();
    agentUser = await TestUserFactory.createAgentUser('agent-1');
    clientUser = await TestUserFactory.createClientUser('client-1');

    // Generate tokens
    adminToken = TestTokenManager.generateAccessToken(adminUser);
    agentToken = TestTokenManager.generateAccessToken(agentUser);
    clientToken = TestTokenManager.generateAccessToken(clientUser);

    // Create test client
    testClient = TestDataGenerator.generateClientData({ id: 'client-1' });
    await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(testClient);

    // Create test site
    testSite = TestDataGenerator.generateSiteData({ 
      id: 'site-1',
      clientId: 'client-1',
    });
    await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(testSite);
  });

  describe('Complete Shift Lifecycle', () => {
    it('should handle complete shift workflow from creation to completion', async () => {
      // Step 1: Admin creates a shift
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
        siteId: testSite.id,
        startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        endTime: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(), // 9 hours from now
        status: 'scheduled',
      });

      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      TestAssertions.expectSuccess(createResponse);
      const shiftId = createResponse.body.data.id;

      // Step 2: Agent views their assigned shift
      const getShiftResponse = await request(app)
        .get(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      TestAssertions.expectSuccess(getShiftResponse);
      expect(getShiftResponse.body.data.status).toBe('scheduled');

      // Step 3: Agent checks in to the shift
      const checkInResponse = await request(app)
        .post(`/api/shifts/${shiftId}/check-in`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: testSite.coordinates.latitude,
            longitude: testSite.coordinates.longitude,
          },
        });

      TestAssertions.expectSuccess(checkInResponse);
      expect(checkInResponse.body.data.status).toBe('in_progress');
      expect(checkInResponse.body.data.actualStartTime).toBeDefined();

      // Step 4: Agent creates a patrol report during the shift
      const reportData = TestDataGenerator.generateReportData({
        shiftId,
        agentId: agentUser.agentId,
        siteId: testSite.id,
        type: 'patrol',
        title: 'Hourly Patrol Report',
        content: 'All areas checked, no incidents reported.',
      });

      const createReportResponse = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(reportData);

      TestAssertions.expectSuccess(createReportResponse);
      const reportId = createReportResponse.body.data.id;

      // Step 5: Agent updates location during shift
      const updateLocationResponse = await request(app)
        .post(`/api/shifts/${shiftId}/update-location`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: testSite.coordinates.latitude + 0.001,
            longitude: testSite.coordinates.longitude + 0.001,
          },
        });

      TestAssertions.expectSuccess(updateLocationResponse);

      // Step 6: Agent checks out of the shift
      const checkOutResponse = await request(app)
        .post(`/api/shifts/${shiftId}/check-out`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: testSite.coordinates.latitude,
            longitude: testSite.coordinates.longitude,
          },
        });

      TestAssertions.expectSuccess(checkOutResponse);
      expect(checkOutResponse.body.data.status).toBe('completed');
      expect(checkOutResponse.body.data.actualEndTime).toBeDefined();

      // Step 7: Admin reviews the completed shift
      const reviewShiftResponse = await request(app)
        .get(`/api/shifts/${shiftId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(reviewShiftResponse);
      const completedShift = reviewShiftResponse.body.data;
      expect(completedShift.status).toBe('completed');
      expect(completedShift.actualStartTime).toBeDefined();
      expect(completedShift.actualEndTime).toBeDefined();

      // Step 8: Client views the shift report
      const clientReportResponse = await request(app)
        .get(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${clientToken}`);

      TestAssertions.expectSuccess(clientReportResponse);
      expect(clientReportResponse.body.data.title).toBe('Hourly Patrol Report');

      // Step 9: Verify shift appears in analytics
      const analyticsResponse = await request(app)
        .get('/api/analytics/shifts')
        .query({
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          siteId: testSite.id,
        })
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(analyticsResponse);
      expect(analyticsResponse.body.data.totalShifts).toBeGreaterThan(0);
    });

    it('should handle shift with incident reporting', async () => {
      // Create and start shift
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
        siteId: testSite.id,
        status: 'scheduled',
      });

      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      // Check in
      await request(app)
        .post(`/api/shifts/${shiftId}/check-in`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: testSite.coordinates.latitude,
            longitude: testSite.coordinates.longitude,
          },
        });

      // Create incident report
      const incidentData = TestDataGenerator.generateReportData({
        shiftId,
        agentId: agentUser.agentId,
        siteId: testSite.id,
        type: 'incident',
        title: 'Security Breach Detected',
        content: 'Unauthorized person detected in restricted area.',
        priority: 'high',
        requiresFollowUp: true,
      });

      const incidentResponse = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(incidentData);

      TestAssertions.expectSuccess(incidentResponse);

      // Verify incident triggers notification
      const notificationsResponse = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(notificationsResponse);
      expect(notificationsResponse.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'incident_reported',
            priority: 'high',
          })
        ])
      );

      // Admin acknowledges incident
      const incidentId = incidentResponse.body.data.id;
      const acknowledgeResponse = await request(app)
        .post(`/api/reports/${incidentId}/acknowledge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          notes: 'Security team dispatched to investigate.',
        });

      TestAssertions.expectSuccess(acknowledgeResponse);
    });

    it('should handle emergency situation during shift', async () => {
      // Create and start shift
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
        siteId: testSite.id,
        status: 'scheduled',
      });

      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      await request(app)
        .post(`/api/shifts/${shiftId}/check-in`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          location: {
            latitude: testSite.coordinates.latitude,
            longitude: testSite.coordinates.longitude,
          },
        });

      // Agent triggers emergency alert
      const emergencyResponse = await request(app)
        .post('/api/emergency/alert')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          type: 'medical',
          location: {
            latitude: testSite.coordinates.latitude,
            longitude: testSite.coordinates.longitude,
          },
          description: 'Medical emergency - person unconscious',
          shiftId,
        });

      TestAssertions.expectSuccess(emergencyResponse);

      // Verify emergency alert is created
      const alertId = emergencyResponse.body.data.id;
      const getAlertResponse = await request(app)
        .get(`/api/emergency/alerts/${alertId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      TestAssertions.expectSuccess(getAlertResponse);
      expect(getAlertResponse.body.data.status).toBe('active');
      expect(getAlertResponse.body.data.type).toBe('medical');

      // Admin responds to emergency
      const respondResponse = await request(app)
        .post(`/api/emergency/alerts/${alertId}/respond`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          response: 'Emergency services contacted, ETA 5 minutes',
          responderName: 'Admin User',
        });

      TestAssertions.expectSuccess(respondResponse);

      // Resolve emergency
      const resolveResponse = await request(app)
        .post(`/api/emergency/alerts/${alertId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Medical team arrived, situation handled',
          outcome: 'resolved',
        });

      TestAssertions.expectSuccess(resolveResponse);
    });

    it('should handle shift scheduling conflicts', async () => {
      // Create first shift
      const firstShiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
        siteId: testSite.id,
        startTime: new Date('2024-01-01T09:00:00Z').toISOString(),
        endTime: new Date('2024-01-01T17:00:00Z').toISOString(),
      });

      const firstShiftResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(firstShiftData);

      TestAssertions.expectSuccess(firstShiftResponse);

      // Try to create overlapping shift
      const overlappingShiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
        siteId: testSite.id,
        startTime: new Date('2024-01-01T15:00:00Z').toISOString(),
        endTime: new Date('2024-01-01T23:00:00Z').toISOString(),
      });

      const conflictResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(overlappingShiftData);

      expect(conflictResponse.status).toBe(409);
      expect(conflictResponse.body.error).toMatch(/conflict/i);

      // Verify conflict details
      expect(conflictResponse.body.conflicts).toBeDefined();
      expect(conflictResponse.body.conflicts[0]).toMatchObject({
        type: 'agent_overlap',
        conflictingShiftId: firstShiftResponse.body.data.id,
      });
    });

    it('should handle bulk shift operations', async () => {
      // Create multiple shifts
      const shiftsData = Array.from({ length: 5 }, (_, index) => 
        TestDataGenerator.generateShiftData({
          agentId: `agent-${index + 1}`,
          siteId: testSite.id,
          startTime: new Date(`2024-01-0${index + 1}T09:00:00Z`).toISOString(),
          endTime: new Date(`2024-01-0${index + 1}T17:00:00Z`).toISOString(),
        })
      );

      const bulkCreateResponse = await request(app)
        .post('/api/shifts/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ shifts: shiftsData });

      TestAssertions.expectSuccess(bulkCreateResponse);
      expect(bulkCreateResponse.body.data.created).toBe(5);
      expect(bulkCreateResponse.body.data.failed).toBe(0);

      // Bulk update shifts
      const shiftIds = bulkCreateResponse.body.data.shifts.map((s: any) => s.id);
      const bulkUpdateResponse = await request(app)
        .put('/api/shifts/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shiftIds,
          updates: { status: 'cancelled' },
        });

      TestAssertions.expectSuccess(bulkUpdateResponse);
      expect(bulkUpdateResponse.body.data.updated).toBe(5);

      // Verify all shifts are cancelled
      for (const shiftId of shiftIds) {
        const getResponse = await request(app)
          .get(`/api/shifts/${shiftId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(getResponse.body.data.status).toBe('cancelled');
      }
    });
  });

  describe('Real-time Updates', () => {
    it('should broadcast shift updates via WebSocket', async () => {
      // This would test WebSocket functionality
      // Implementation depends on your WebSocket setup
      
      const shiftData = TestDataGenerator.generateShiftData({
        agentId: agentUser.agentId,
        siteId: testSite.id,
      });

      const createResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(shiftData);

      const shiftId = createResponse.body.data.id;

      // Mock WebSocket connection and verify updates are sent
      // This would require setting up WebSocket test infrastructure
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large number of concurrent shift operations', async () => {
      const concurrentOperations = Array.from({ length: 50 }, (_, index) => 
        request(app)
          .post('/api/shifts')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(TestDataGenerator.generateShiftData({
            agentId: `agent-${index}`,
            siteId: testSite.id,
            startTime: new Date(`2024-01-01T${9 + (index % 8)}:00:00Z`).toISOString(),
            endTime: new Date(`2024-01-01T${17 + (index % 8)}:00:00Z`).toISOString(),
          }))
      );

      const results = await Promise.allSettled(concurrentOperations);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      // Should handle most operations successfully
      expect(successful).toBeGreaterThan(40);
    });

    it('should maintain performance with large datasets', async () => {
      // Create many shifts for performance testing
      const shiftsData = Array.from({ length: 1000 }, (_, index) => 
        TestDataGenerator.generateShiftData({
          agentId: `agent-${index % 10}`,
          siteId: testSite.id,
          startTime: new Date(`2024-01-${String(index % 30 + 1).padStart(2, '0')}T09:00:00Z`).toISOString(),
          endTime: new Date(`2024-01-${String(index % 30 + 1).padStart(2, '0')}T17:00:00Z`).toISOString(),
        })
      );

      // Batch create shifts
      const batchSize = 100;
      for (let i = 0; i < shiftsData.length; i += batchSize) {
        const batch = shiftsData.slice(i, i + batchSize);
        await request(app)
          .post('/api/shifts/bulk')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ shifts: batch });
      }

      // Test query performance
      const startTime = Date.now();
      const queryResponse = await request(app)
        .get('/api/shifts')
        .query({ 
          page: 1, 
          limit: 50,
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-01-31T23:59:59Z',
        })
        .set('Authorization', `Bearer ${adminToken}`);

      const queryTime = Date.now() - startTime;

      TestAssertions.expectSuccess(queryResponse);
      TestAssertions.expectPaginatedResponse(queryResponse);
      
      // Query should complete within reasonable time
      expect(queryTime).toBeLessThan(1000); // 1 second
    });
  });
});
