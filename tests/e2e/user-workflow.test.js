const request = require('supertest');
const app = require('../../src/server');
const { prisma } = require('../setup');

describe('End-to-End User Workflow Tests', () => {
  let adminToken;
  let supervisorToken;
  let agentToken;
  let clientToken;
  let testShiftId;
  let testReportId;

  beforeAll(async () => {
    // Login as different user types to get tokens
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testadmin',
        password: 'testpassword123',
      });
    adminToken = adminLogin.body.token;

    const supervisorLogin = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testsupervisor',
        password: 'testpassword123',
      });
    supervisorToken = supervisorLogin.body.token;

    const agentLogin = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testagent1',
        password: 'testpassword123',
      });
    agentToken = agentLogin.body.token;

    const clientLogin = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testclient',
        password: 'testpassword123',
      });
    clientToken = clientLogin.body.token;
  });

  describe('Complete Shift Workflow', () => {
    it('should complete a full shift lifecycle', async () => {
      // 1. Admin creates a shift
      const shiftResponse = await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          siteId: 'test-site-1',
          agentId: 'test-agent-1',
          startTime: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
          endTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours from now
          shiftType: 'REGULAR',
          requirements: {
            skills: ['Security Patrol'],
            certifications: ['Security Guard License'],
          },
          notes: 'Test shift for E2E testing',
        })
        .expect(201);

      testShiftId = shiftResponse.body.shift.id;
      expect(shiftResponse.body.shift.status).toBe('SCHEDULED');

      // 2. Supervisor confirms the shift
      await request(app)
        .patch(`/api/shifts/${testShiftId}/status`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          status: 'CONFIRMED',
          metadata: {
            confirmedBy: 'test-supervisor-1',
            confirmationNotes: 'Shift confirmed by supervisor',
          },
        })
        .expect(200);

      // 3. Agent clocks in
      const clockInResponse = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          shiftId: testShiftId,
          location: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
        })
        .expect(201);

      const attendanceId = clockInResponse.body.attendance.id;

      // 4. Agent submits location updates
      await request(app)
        .post('/api/locations')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 5,
          timestamp: new Date().toISOString(),
          shiftId: testShiftId,
        })
        .expect(201);

      // 5. Agent submits a patrol report
      const reportResponse = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          shiftId: testShiftId,
          siteId: 'test-site-1',
          reportType: 'PATROL',
          title: 'Routine Patrol Report',
          content: {
            patrolStartTime: new Date().toISOString(),
            patrolEndTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            areasPatrolled: ['Main Entrance', 'Parking Lot', 'Building Perimeter'],
            observations: 'All areas secure, no incidents observed',
            securityChecks: {
              doorsSecured: true,
              windowsSecured: true,
              alarmSystemActive: true,
              lightingAdequate: true,
            },
          },
          observations: 'Routine patrol completed without incidents',
          weatherConditions: 'Clear',
          equipmentStatus: 'All equipment functioning properly',
          priority: 'NORMAL',
        })
        .expect(201);

      testReportId = reportResponse.body.report.id;

      // 6. Supervisor reviews and approves the report
      await request(app)
        .post(`/api/reports/${testReportId}/review`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          action: 'APPROVE',
          reviewerNotes: 'Report approved - good detail and thoroughness',
          clientApprovalRequired: false,
        })
        .expect(200);

      // 7. Agent clocks out
      await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          attendanceId: attendanceId,
          location: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
        })
        .expect(200);

      // 8. Verify shift is completed
      const shiftStatus = await request(app)
        .get(`/api/shifts/${testShiftId}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(shiftStatus.body.shift.status).toBe('COMPLETED');
    });

    it('should handle incident reporting workflow', async () => {
      // Agent reports an incident
      const incidentResponse = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          shiftId: testShiftId,
          siteId: 'test-site-1',
          reportType: 'INCIDENT',
          title: 'Suspicious Activity Observed',
          content: {
            incidentTime: new Date().toISOString(),
            incidentType: 'Suspicious Activity',
            location: 'North Parking Lot',
            description: 'Individual observed attempting to access restricted area',
            actionsTaken: 'Approached individual, verified they were lost visitor, escorted to main entrance',
            witnessInfo: 'Security camera footage available',
            policeContacted: false,
            injuriesReported: false,
          },
          observations: 'Incident resolved without escalation',
          priority: 'HIGH',
        })
        .expect(201);

      const incidentReportId = incidentResponse.body.report.id;

      // Supervisor reviews incident report
      await request(app)
        .post(`/api/reports/${incidentReportId}/review`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          action: 'APPROVE',
          reviewerNotes: 'Incident handled appropriately, good documentation',
          clientApprovalRequired: true,
        })
        .expect(200);

      // Client reviews and signs off on incident report
      await request(app)
        .post(`/api/reports/${incidentReportId}/signature`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          clientSignature: 'John Doe - Facility Manager',
          clientFeedback: 'Satisfied with response and documentation',
          clientApproval: true,
        })
        .expect(200);

      // Verify report is fully approved
      const reportStatus = await request(app)
        .get(`/api/reports/${incidentReportId}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      expect(reportStatus.body.report.status).toBe('APPROVED');
      expect(reportStatus.body.report.clientSignature).toBeTruthy();
    });
  });

  describe('Analytics and Reporting Workflow', () => {
    it('should generate operational analytics', async () => {
      const analyticsResponse = await request(app)
        .get('/api/analytics/operational')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          includeForecasting: true,
          includeBenchmarking: true,
        })
        .expect(200);

      expect(analyticsResponse.body).toHaveProperty('coreMetrics');
      expect(analyticsResponse.body).toHaveProperty('performanceAnalytics');
      expect(analyticsResponse.body).toHaveProperty('costAnalytics');
      expect(analyticsResponse.body).toHaveProperty('qualityMetrics');
      expect(analyticsResponse.body).toHaveProperty('forecasting');
      expect(analyticsResponse.body).toHaveProperty('benchmarking');
      expect(analyticsResponse.body).toHaveProperty('recommendations');
    });

    it('should generate client dashboard data', async () => {
      const dashboardResponse = await request(app)
        .get('/api/clients/dashboard')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(dashboardResponse.body).toHaveProperty('metrics');
      expect(dashboardResponse.body).toHaveProperty('siteStatuses');
      expect(dashboardResponse.body).toHaveProperty('alerts');
      expect(dashboardResponse.body).toHaveProperty('recentActivity');
      expect(dashboardResponse.body).toHaveProperty('performanceData');
    });
  });

  describe('Mobile API Workflow', () => {
    it('should handle mobile sync workflow', async () => {
      // Get mobile dashboard
      const mobileResponse = await request(app)
        .get('/api/mobile/dashboard')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);

      expect(mobileResponse.body).toHaveProperty('currentShift');
      expect(mobileResponse.body).toHaveProperty('upcomingShifts');
      expect(mobileResponse.body).toHaveProperty('recentReports');

      // Sync offline data
      const syncResponse = await request(app)
        .post('/api/mobile/sync')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          locationUpdates: [
            {
              latitude: 37.7749,
              longitude: -122.4194,
              accuracy: 5,
              timestamp: new Date().toISOString(),
              shiftId: testShiftId,
              batteryLevel: 85,
            },
          ],
          reports: [],
          attendance: [],
          lastSyncTime: new Date(Date.now() - 60000).toISOString(),
        })
        .expect(200);

      expect(syncResponse.body).toHaveProperty('results');
      expect(syncResponse.body.results.locationUpdates.success).toBe(1);
    });
  });

  describe('Scheduling Workflow', () => {
    it('should handle auto-scheduling workflow', async () => {
      // Generate optimal schedule
      const scheduleResponse = await request(app)
        .post('/api/scheduling/generate')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          constraints: {
            maxHoursPerAgent: 40,
            minRestBetweenShifts: 8,
            preferredShiftLength: 8,
          },
          preferences: {
            agentPreferences: true,
            skillMatching: true,
            costOptimization: true,
          },
          optimization: 'COVERAGE',
        })
        .expect(200);

      expect(scheduleResponse.body).toHaveProperty('schedule');
      expect(scheduleResponse.body).toHaveProperty('metrics');
      expect(scheduleResponse.body).toHaveProperty('conflicts');

      // Auto-assign agents to shifts
      const assignResponse = await request(app)
        .post('/api/scheduling/auto-assign')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          criteria: {
            skillMatching: true,
            availabilityCheck: true,
            workloadBalancing: true,
          },
        })
        .expect(200);

      expect(assignResponse.body).toHaveProperty('assignments');
      expect(assignResponse.body).toHaveProperty('unassigned');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid shift operations', async () => {
      // Try to clock in without valid shift
      await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          shiftId: 'invalid-shift-id',
          location: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
        })
        .expect(404);

      // Try to submit report for non-existent shift
      await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          shiftId: 'invalid-shift-id',
          siteId: 'test-site-1',
          reportType: 'PATROL',
          title: 'Invalid Report',
          content: {},
        })
        .expect(404);
    });

    it('should handle permission violations', async () => {
      // Agent trying to access admin endpoint
      await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(403);

      // Client trying to manage shifts
      await request(app)
        .post('/api/shifts')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          siteId: 'test-site-1',
          agentId: 'test-agent-1',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
        })
        .expect(403);
    });
  });
});
