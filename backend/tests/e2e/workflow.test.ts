import request from 'supertest';
import { app } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from '@jest/globals';

const prisma = new PrismaClient();

describe('End-to-End Workflow Tests', () => {
  let adminToken: string;
  let agentToken: string;
  let clientToken: string;
  let testClient: any;
  let testSite: any;
  let testAgent: any;
  let testShift: any;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await global.testUtils.cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await global.testUtils.cleanupTestData();
    
    // Create test users and get tokens
    const adminUser = await global.testUtils.createTestUser({
      email: 'admin@test.com',
      role: 'ADMIN',
    });
    
    const agentUser = await global.testUtils.createTestUser({
      email: 'agent@test.com',
      role: 'AGENT',
    });
    
    const clientUser = await global.testUtils.createTestUser({
      email: 'client@test.com',
      role: 'CLIENT',
    });

    adminToken = global.testUtils.generateJWT({ userId: adminUser.id, role: 'ADMIN' });
    agentToken = global.testUtils.generateJWT({ userId: agentUser.id, role: 'AGENT' });
    clientToken = global.testUtils.generateJWT({ userId: clientUser.id, role: 'CLIENT' });

    // Create test data
    testClient = await global.testUtils.createTestClient();
    testSite = await global.testUtils.createTestSite(testClient.id);
    testAgent = await global.testUtils.createTestAgent(agentUser.id);
  });

  describe('Complete Security Management Workflow', () => {
    it('should handle complete client onboarding workflow', async () => {
      // Step 1: Admin creates client
      const clientResponse = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          companyName: 'Test Security Client',
          contactEmail: 'contact@testclient.com',
          contactPhone: '+1234567890',
          billingAddress: {
            street: '123 Client Street',
            city: 'Client City',
            state: 'CC',
            zipCode: '12345',
            country: 'US',
          },
        })
        .expect(201);

      expect(clientResponse.body.success).toBe(true);
      const clientId = clientResponse.body.data.id;

      // Step 2: Admin creates site for client
      const siteResponse = await request(app)
        .post('/api/sites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Security Site',
          clientId,
          address: {
            street: '456 Site Street',
            city: 'Site City',
            state: 'SC',
            zipCode: '67890',
            country: 'US',
          },
          siteType: 'commercial',
          securityLevel: 'HIGH',
        })
        .expect(201);

      expect(siteResponse.body.success).toBe(true);
      const siteId = siteResponse.body.data.id;

      // Step 3: Admin assigns agent to site
      const assignmentResponse = await request(app)
        .post(`/api/sites/${siteId}/agents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          agentId: testAgent.id,
        })
        .expect(201);

      expect(assignmentResponse.body.success).toBe(true);

      // Step 4: Admin creates shift schedule
      const shiftResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          agentId: testAgent.id,
          siteId,
          startTime: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
          endTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours later
          shiftType: 'REGULAR',
        })
        .expect(201);

      expect(shiftResponse.body.success).toBe(true);
      testShift = shiftResponse.body.data;

      // Step 5: Verify client can view their sites
      const clientSitesResponse = await request(app)
        .get('/api/client/sites')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(clientSitesResponse.body.success).toBe(true);
      expect(clientSitesResponse.body.data).toHaveLength(1);
      expect(clientSitesResponse.body.data[0].id).toBe(siteId);
    });

    it('should handle complete shift management workflow', async () => {
      // Setup: Create shift
      testShift = await global.testUtils.createTestShift(testAgent.id, testSite.id, {
        startTime: new Date(),
        endTime: new Date(Date.now() + 8 * 60 * 60 * 1000),
        status: 'SCHEDULED',
      });

      // Step 1: Agent starts shift
      const startShiftResponse = await request(app)
        .post(`/api/shifts/${testShift.id}/start`)
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);

      expect(startShiftResponse.body.success).toBe(true);
      expect(startShiftResponse.body.data.status).toBe('IN_PROGRESS');

      // Step 2: Agent submits location update
      const locationResponse = await request(app)
        .post('/api/agents/location')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
        })
        .expect(200);

      expect(locationResponse.body.success).toBe(true);

      // Step 3: Agent creates patrol report
      const patrolResponse = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          type: 'PATROL',
          title: 'Routine Patrol Report',
          description: 'Completed routine patrol of premises',
          siteId: testSite.id,
          location: 'Main entrance',
        })
        .expect(201);

      expect(patrolResponse.body.success).toBe(true);

      // Step 4: Agent reports incident
      const incidentResponse = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          type: 'SUSPICIOUS_ACTIVITY',
          severity: 'MEDIUM',
          title: 'Suspicious Person',
          description: 'Individual loitering near entrance',
          location: 'Front entrance',
          siteId: testSite.id,
        })
        .expect(201);

      expect(incidentResponse.body.success).toBe(true);

      // Step 5: Agent ends shift
      const endShiftResponse = await request(app)
        .post(`/api/shifts/${testShift.id}/end`)
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);

      expect(endShiftResponse.body.success).toBe(true);
      expect(endShiftResponse.body.data.status).toBe('COMPLETED');

      // Step 6: Admin reviews shift data
      const shiftDetailsResponse = await request(app)
        .get(`/api/shifts/${testShift.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(shiftDetailsResponse.body.success).toBe(true);
      expect(shiftDetailsResponse.body.data.status).toBe('COMPLETED');
    });

    it('should handle incident escalation workflow', async () => {
      // Step 1: Agent reports critical incident
      const incidentResponse = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          type: 'SECURITY_BREACH',
          severity: 'CRITICAL',
          title: 'Unauthorized Access',
          description: 'Multiple individuals attempting to breach perimeter',
          location: 'North gate',
          siteId: testSite.id,
        })
        .expect(201);

      expect(incidentResponse.body.success).toBe(true);
      const incidentId = incidentResponse.body.data.id;

      // Step 2: System should auto-escalate critical incidents
      // Wait a moment for async processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Admin acknowledges incident
      const acknowledgeResponse = await request(app)
        .patch(`/api/incidents/${incidentId}/acknowledge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(acknowledgeResponse.body.success).toBe(true);

      // Step 4: Admin assigns incident to agent
      const assignResponse = await request(app)
        .patch(`/api/incidents/${incidentId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignedTo: testAgent.id,
        })
        .expect(200);

      expect(assignResponse.body.success).toBe(true);

      // Step 5: Agent updates incident status
      const updateResponse = await request(app)
        .patch(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          status: 'IN_PROGRESS',
          notes: 'Responding to incident, securing perimeter',
        })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);

      // Step 6: Agent resolves incident
      const resolveResponse = await request(app)
        .patch(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          status: 'RESOLVED',
          resolution: 'Perimeter secured, individuals removed from premises',
        })
        .expect(200);

      expect(resolveResponse.body.success).toBe(true);

      // Step 7: Client views incident report
      const clientIncidentResponse = await request(app)
        .get(`/api/client/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(clientIncidentResponse.body.success).toBe(true);
      expect(clientIncidentResponse.body.data.status).toBe('RESOLVED');
    });

    it('should handle analytics and reporting workflow', async () => {
      // Setup: Create historical data
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Create multiple shifts
      for (let i = 0; i < 5; i++) {
        await global.testUtils.createTestShift(testAgent.id, testSite.id, {
          startTime: new Date(lastWeek.getTime() + i * 24 * 60 * 60 * 1000),
          endTime: new Date(lastWeek.getTime() + i * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
          status: 'COMPLETED',
        });
      }

      // Create multiple reports
      for (let i = 0; i < 3; i++) {
        await global.testUtils.createTestReport(testAgent.id, testSite.id, {
          type: 'PATROL',
          title: `Patrol Report ${i + 1}`,
          createdAt: new Date(yesterday.getTime() + i * 60 * 60 * 1000),
        });
      }

      // Create incidents
      for (let i = 0; i < 2; i++) {
        await global.testUtils.createTestIncident(testSite.id, testAgent.userId, {
          type: 'MINOR_INCIDENT',
          severity: 'LOW',
          createdAt: new Date(yesterday.getTime() + i * 60 * 60 * 1000),
        });
      }

      // Step 1: Admin requests dashboard analytics
      const dashboardResponse = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: lastWeek.toISOString(),
          endDate: new Date().toISOString(),
        })
        .expect(200);

      expect(dashboardResponse.body.success).toBe(true);
      expect(dashboardResponse.body.data).toHaveProperty('totalShifts');
      expect(dashboardResponse.body.data).toHaveProperty('totalReports');
      expect(dashboardResponse.body.data).toHaveProperty('totalIncidents');

      // Step 2: Client requests site analytics
      const siteAnalyticsResponse = await request(app)
        .get(`/api/client/sites/${testSite.id}/analytics`)
        .set('Authorization', `Bearer ${clientToken}`)
        .query({
          startDate: lastWeek.toISOString(),
          endDate: new Date().toISOString(),
        })
        .expect(200);

      expect(siteAnalyticsResponse.body.success).toBe(true);
      expect(siteAnalyticsResponse.body.data).toHaveProperty('coverage');
      expect(siteAnalyticsResponse.body.data).toHaveProperty('incidents');

      // Step 3: Admin generates comprehensive report
      const reportResponse = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'COMPREHENSIVE',
          dateRange: {
            start: lastWeek.toISOString(),
            end: new Date().toISOString(),
          },
          includeMetrics: ['shifts', 'incidents', 'reports', 'performance'],
          format: 'JSON',
        })
        .expect(200);

      expect(reportResponse.body.success).toBe(true);
      expect(reportResponse.body.data).toHaveProperty('reportId');

      // Step 4: Download generated report
      const downloadResponse = await request(app)
        .get(`/api/reports/${reportResponse.body.data.reportId}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(downloadResponse.body).toBeDefined();
    });

    it('should handle notification workflow', async () => {
      // Step 1: System sends notification
      const notificationResponse = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'SYSTEM',
          priority: 'MEDIUM',
          title: 'Test Notification',
          message: 'This is a test notification',
          recipientId: testAgent.userId,
          channels: ['IN_APP'],
        })
        .expect(201);

      expect(notificationResponse.body.success).toBe(true);
      const notificationId = notificationResponse.body.data.id;

      // Step 2: Agent receives notifications
      const getNotificationsResponse = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);

      expect(getNotificationsResponse.body.success).toBe(true);
      expect(getNotificationsResponse.body.data.notifications).toHaveLength(1);
      expect(getNotificationsResponse.body.data.notifications[0].id).toBe(notificationId);

      // Step 3: Agent marks notification as read
      const markReadResponse = await request(app)
        .patch(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);

      expect(markReadResponse.body.success).toBe(true);

      // Step 4: Verify notification is marked as read
      const verifyReadResponse = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);

      expect(verifyReadResponse.body.success).toBe(true);
      const notification = verifyReadResponse.body.data.notifications.find((n: any) => n.id === notificationId);
      expect(notification.isRead).toBe(true);
    });

    it('should handle user management workflow', async () => {
      // Step 1: Admin creates new agent user
      const createUserResponse = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newagent@test.com',
          firstName: 'New',
          lastName: 'Agent',
          role: 'AGENT',
          phone: '+1987654321',
        })
        .expect(201);

      expect(createUserResponse.body.success).toBe(true);
      const newUserId = createUserResponse.body.data.id;

      // Step 2: Admin creates agent profile
      const createAgentResponse = await request(app)
        .post('/api/agents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: newUserId,
          employeeId: 'EMP002',
          hireDate: new Date().toISOString(),
          certifications: ['Basic Security', 'First Aid'],
        })
        .expect(201);

      expect(createAgentResponse.body.success).toBe(true);
      const newAgentId = createAgentResponse.body.data.id;

      // Step 3: Admin assigns agent to site
      const assignToSiteResponse = await request(app)
        .post(`/api/sites/${testSite.id}/agents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          agentId: newAgentId,
        })
        .expect(201);

      expect(assignToSiteResponse.body.success).toBe(true);

      // Step 4: Admin updates agent status
      const updateStatusResponse = await request(app)
        .patch(`/api/agents/${newAgentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'ACTIVE',
        })
        .expect(200);

      expect(updateStatusResponse.body.success).toBe(true);

      // Step 5: Admin views agent list
      const agentListResponse = await request(app)
        .get('/api/agents')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(agentListResponse.body.success).toBe(true);
      expect(agentListResponse.body.data.agents.length).toBeGreaterThanOrEqual(2);

      // Step 6: Admin deactivates agent
      const deactivateResponse = await request(app)
        .patch(`/api/agents/${newAgentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'INACTIVE',
        })
        .expect(200);

      expect(deactivateResponse.body.success).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle unauthorized access attempts', async () => {
      // Attempt to access admin endpoint without token
      await request(app)
        .get('/api/admin/dashboard')
        .expect(401);

      // Attempt to access admin endpoint with agent token
      await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(403);

      // Attempt to access agent endpoint with client token
      await request(app)
        .post('/api/shifts/start')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });

    it('should handle invalid data submissions', async () => {
      // Invalid email format
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'invalid-email',
          firstName: 'Test',
          lastName: 'User',
          role: 'AGENT',
        })
        .expect(400);

      // Missing required fields
      await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          type: 'SECURITY_BREACH',
          // Missing required fields
        })
        .expect(400);

      // Invalid enum values
      await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          type: 'INVALID_TYPE',
          severity: 'INVALID_SEVERITY',
          title: 'Test Incident',
          description: 'Test description',
          location: 'Test location',
          siteId: testSite.id,
        })
        .expect(400);
    });

    it('should handle resource not found scenarios', async () => {
      const nonExistentId = 'non-existent-id';

      // Non-existent shift
      await request(app)
        .get(`/api/shifts/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      // Non-existent incident
      await request(app)
        .get(`/api/incidents/${nonExistentId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(404);

      // Non-existent site
      await request(app)
        .get(`/api/sites/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should handle concurrent operations', async () => {
      // Create a shift
      const shift = await global.testUtils.createTestShift(testAgent.id, testSite.id);

      // Attempt to start the same shift concurrently
      const startPromises = [
        request(app)
          .post(`/api/shifts/${shift.id}/start`)
          .set('Authorization', `Bearer ${agentToken}`),
        request(app)
          .post(`/api/shifts/${shift.id}/start`)
          .set('Authorization', `Bearer ${agentToken}`),
      ];

      const results = await Promise.allSettled(startPromises);
      
      // One should succeed, one should fail
      const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).status === 200).length;
      expect(successCount).toBe(1);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent requests', async () => {
      const concurrentRequests = 10;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(app)
            .get('/api/dashboard/stats')
            .set('Authorization', `Bearer ${adminToken}`)
        );
      }

      const results = await Promise.all(promises);
      
      // All requests should succeed
      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
      });
    });

    it('should handle large data sets efficiently', async () => {
      // Create a large number of records
      const recordCount = 100;
      const createPromises = [];

      for (let i = 0; i < recordCount; i++) {
        createPromises.push(
          global.testUtils.createTestReport(testAgent.id, testSite.id, {
            title: `Report ${i}`,
            description: `Test report number ${i}`,
          })
        );
      }

      await Promise.all(createPromises);

      // Test pagination performance
      const startTime = Date.now();
      const response = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          page: 1,
          limit: 50,
        })
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body.success).toBe(true);
      expect(response.body.data.reports).toHaveLength(50);
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });
  });
});
