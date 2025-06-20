const express = require('express');
const { body, query, validationResult } = require('express-validator');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /mobile/dashboard:
 *   get:
 *     summary: Get mobile dashboard data
 *     description: Get optimized dashboard data for mobile app
 *     tags: [Mobile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mobile dashboard data
 */
router.get('/dashboard',
  authenticate,
  authorize('AGENT'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const agentId = req.user.agent.id;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get current shift
    const currentShift = await prisma.shift.findFirst({
      where: {
        agentId,
        startTime: { lte: now },
        endTime: { gte: now },
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        deletedAt: null,
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address: true,
            coordinates: true,
            client: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
        attendance: {
          where: {
            clockOutTime: null,
          },
          orderBy: { clockInTime: 'desc' },
          take: 1,
        },
      },
    });

    // Get upcoming shifts (next 7 days)
    const upcomingShifts = await prisma.shift.findMany({
      where: {
        agentId,
        startTime: { gte: now, lte: nextWeek },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        deletedAt: null,
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address: true,
            client: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: 'asc' },
      take: 5,
    });

    // Get recent reports
    const recentReports = await prisma.report.findMany({
      where: {
        agentId,
        createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        reportType: true,
        status: true,
        createdAt: true,
        priority: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Get performance metrics
    const performanceMetrics = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        performanceMetrics: true,
      },
    });

    // Get pending notifications
    const notifications = await prisma.notification.findMany({
      where: {
        recipientId: req.user.id,
        status: 'PENDING',
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        createdAt: true,
        priority: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({
      currentShift,
      upcomingShifts,
      recentReports,
      performanceMetrics: performanceMetrics?.performanceMetrics || {},
      notifications,
      serverTime: now.toISOString(),
    });
  })
);

/**
 * @swagger
 * /mobile/shifts/current:
 *   get:
 *     summary: Get current active shift
 *     description: Get the currently active shift for mobile app
 *     tags: [Mobile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current shift data
 *       404:
 *         description: No active shift found
 */
router.get('/shifts/current',
  authenticate,
  authorize('AGENT'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const agentId = req.user.agent.id;
    const now = new Date();

    const currentShift = await prisma.shift.findFirst({
      where: {
        agentId,
        startTime: { lte: now },
        endTime: { gte: now },
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        deletedAt: null,
      },
      include: {
        site: {
          include: {
            client: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
        attendance: {
          where: {
            clockOutTime: null,
          },
          orderBy: { clockInTime: 'desc' },
          take: 1,
        },
      },
    });

    if (!currentShift) {
      return res.status(404).json({
        message: 'No active shift found',
        shift: null,
      });
    }

    res.json({
      shift: currentShift,
    });
  })
);

/**
 * @swagger
 * /mobile/shifts/my-shifts:
 *   get:
 *     summary: Get agent's shifts
 *     description: Get shifts for the authenticated agent with mobile optimization
 *     tags: [Mobile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of agent's shifts
 */
router.get('/shifts/my-shifts',
  authenticate,
  authorize('AGENT'),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('status').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const {
      startDate,
      endDate,
      status,
      limit = 50,
    } = req.query;

    const prisma = req.app.locals.prisma;
    const agentId = req.user.agent.id;

    const where = {
      agentId,
      deletedAt: null,
      ...(startDate && { startTime: { gte: new Date(startDate) } }),
      ...(endDate && { endTime: { lte: new Date(endDate) } }),
      ...(status && { status }),
    };

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address: true,
            coordinates: true,
            client: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
        attendance: {
          select: {
            id: true,
            clockInTime: true,
            clockOutTime: true,
            clockInLocation: true,
            clockOutLocation: true,
            status: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
      take: limit,
    });

    res.json({
      shifts,
      totalCount: shifts.length,
    });
  })
);

/**
 * @swagger
 * /mobile/reports/templates:
 *   get:
 *     summary: Get mobile-optimized report templates
 *     description: Get report templates optimized for mobile form rendering
 *     tags: [Mobile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mobile-optimized report templates
 */
router.get('/reports/templates',
  authenticate,
  authorize('AGENT'),
  [
    query('reportType').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const { reportType } = req.query;

    // Mobile-optimized templates with simplified field types
    const mobileTemplates = {
      PATROL: {
        id: 'patrol-mobile',
        name: 'Patrol Report',
        description: 'Mobile patrol report template',
        sections: [
          {
            id: 'basic_info',
            title: 'Basic Information',
            fields: [
              {
                id: 'patrol_start_time',
                type: 'datetime',
                label: 'Patrol Start Time',
                required: true,
                defaultValue: 'now',
              },
              {
                id: 'patrol_end_time',
                type: 'datetime',
                label: 'Patrol End Time',
                required: true,
              },
              {
                id: 'weather_conditions',
                type: 'select',
                label: 'Weather',
                options: ['Clear', 'Cloudy', 'Rainy', 'Foggy', 'Windy'],
                required: false,
              },
            ],
          },
          {
            id: 'observations',
            title: 'Observations',
            fields: [
              {
                id: 'general_observations',
                type: 'textarea',
                label: 'General Observations',
                required: true,
                placeholder: 'Describe what you observed during patrol...',
              },
              {
                id: 'security_checks',
                type: 'checklist',
                label: 'Security Checks',
                items: [
                  'All doors secured',
                  'Windows checked',
                  'Alarm system active',
                  'Lighting adequate',
                  'No unauthorized access',
                ],
                required: true,
              },
            ],
          },
          {
            id: 'incidents',
            title: 'Incidents',
            fields: [
              {
                id: 'incidents_occurred',
                type: 'boolean',
                label: 'Any incidents occurred?',
                required: true,
              },
              {
                id: 'incident_details',
                type: 'textarea',
                label: 'Incident Details',
                required: false,
                conditional: { field: 'incidents_occurred', value: true },
                placeholder: 'Describe any incidents...',
              },
              {
                id: 'photos',
                type: 'camera',
                label: 'Photos',
                required: false,
                multiple: true,
                maxFiles: 5,
              },
            ],
          },
        ],
      },
      INCIDENT: {
        id: 'incident-mobile',
        name: 'Incident Report',
        description: 'Mobile incident report template',
        sections: [
          {
            id: 'incident_info',
            title: 'Incident Information',
            fields: [
              {
                id: 'incident_time',
                type: 'datetime',
                label: 'When did this occur?',
                required: true,
                defaultValue: 'now',
              },
              {
                id: 'incident_type',
                type: 'select',
                label: 'Incident Type',
                options: [
                  'Theft/Burglary',
                  'Vandalism',
                  'Trespassing',
                  'Medical Emergency',
                  'Fire/Safety',
                  'Suspicious Activity',
                  'Other',
                ],
                required: true,
              },
              {
                id: 'severity',
                type: 'select',
                label: 'Severity',
                options: ['Low', 'Medium', 'High', 'Critical'],
                required: true,
              },
            ],
          },
          {
            id: 'description',
            title: 'Description',
            fields: [
              {
                id: 'what_happened',
                type: 'textarea',
                label: 'What happened?',
                required: true,
                placeholder: 'Provide detailed description...',
              },
              {
                id: 'actions_taken',
                type: 'textarea',
                label: 'Actions taken',
                required: true,
                placeholder: 'What did you do immediately?',
              },
              {
                id: 'authorities_contacted',
                type: 'boolean',
                label: 'Authorities contacted?',
                required: true,
              },
            ],
          },
          {
            id: 'evidence',
            title: 'Evidence',
            fields: [
              {
                id: 'photos',
                type: 'camera',
                label: 'Photos',
                required: true,
                multiple: true,
                maxFiles: 10,
              },
              {
                id: 'witnesses',
                type: 'textarea',
                label: 'Witness information',
                required: false,
                placeholder: 'Names and contact details...',
              },
            ],
          },
        ],
      },
    };

    const templates = reportType && mobileTemplates[reportType] 
      ? { [reportType]: mobileTemplates[reportType] }
      : mobileTemplates;

    res.json({
      templates,
      optimizedFor: 'mobile',
    });
  })
);

/**
 * @swagger
 * /mobile/sync:
 *   post:
 *     summary: Sync offline data
 *     description: Sync offline data when connection is restored
 *     tags: [Mobile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               locationUpdates:
 *                 type: array
 *               reports:
 *                 type: array
 *               attendance:
 *                 type: array
 *               lastSyncTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Sync completed successfully
 */
router.post('/sync',
  authenticate,
  authorize('AGENT'),
  [
    body('locationUpdates').optional().isArray(),
    body('reports').optional().isArray(),
    body('attendance').optional().isArray(),
    body('lastSyncTime').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const {
      locationUpdates = [],
      reports = [],
      attendance = [],
      lastSyncTime,
    } = req.body;

    const prisma = req.app.locals.prisma;
    const agentId = req.user.agent.id;
    const syncResults = {
      locationUpdates: { success: 0, failed: 0 },
      reports: { success: 0, failed: 0 },
      attendance: { success: 0, failed: 0 },
      errors: [],
    };

    // Sync location updates
    for (const location of locationUpdates) {
      try {
        await prisma.locationTracking.create({
          data: {
            agentId,
            shiftId: location.shiftId,
            coordinates: `POINT(${location.longitude} ${location.latitude})`,
            accuracy: location.accuracy,
            altitude: location.altitude,
            speed: location.speed,
            heading: location.heading,
            timestamp: new Date(location.timestamp),
            batteryLevel: location.batteryLevel,
            isMockLocation: location.isMockLocation || false,
          },
        });
        syncResults.locationUpdates.success++;
      } catch (error) {
        syncResults.locationUpdates.failed++;
        syncResults.errors.push({
          type: 'location',
          data: location,
          error: error.message,
        });
      }
    }

    // Sync reports
    for (const report of reports) {
      try {
        await prisma.report.create({
          data: {
            agentId,
            shiftId: report.shiftId,
            siteId: report.siteId,
            reportType: report.reportType,
            title: report.title,
            content: report.content,
            observations: report.observations,
            incidents: report.incidents || [],
            weatherConditions: report.weatherConditions,
            equipmentStatus: report.equipmentStatus,
            priority: report.priority || 'NORMAL',
            status: 'SUBMITTED',
            submittedAt: new Date(),
          },
        });
        syncResults.reports.success++;
      } catch (error) {
        syncResults.reports.failed++;
        syncResults.errors.push({
          type: 'report',
          data: report,
          error: error.message,
        });
      }
    }

    // Sync attendance records
    for (const attendanceRecord of attendance) {
      try {
        if (attendanceRecord.type === 'clock_in') {
          await prisma.attendance.create({
            data: {
              shiftId: attendanceRecord.shiftId,
              agentId,
              clockInTime: new Date(attendanceRecord.timestamp),
              clockInLocation: attendanceRecord.location,
              status: 'CLOCKED_IN',
            },
          });
        } else if (attendanceRecord.type === 'clock_out') {
          await prisma.attendance.update({
            where: { id: attendanceRecord.attendanceId },
            data: {
              clockOutTime: new Date(attendanceRecord.timestamp),
              clockOutLocation: attendanceRecord.location,
              status: 'CLOCKED_OUT',
            },
          });
        }
        syncResults.attendance.success++;
      } catch (error) {
        syncResults.attendance.failed++;
        syncResults.errors.push({
          type: 'attendance',
          data: attendanceRecord,
          error: error.message,
        });
      }
    }

    logger.audit('mobile_sync_completed', {
      agentId,
      syncResults,
      lastSyncTime,
    });

    res.json({
      message: 'Sync completed',
      results: syncResults,
      syncTime: new Date().toISOString(),
    });
  })
);

module.exports = router;
