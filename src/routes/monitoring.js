const express = require('express');
const { body, query, validationResult } = require('express-validator');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../config/logger');
const RealTimeMonitoringService = require('../services/realTimeMonitoring');

const router = express.Router();

// Global monitoring service instance
let monitoringService = null;

/**
 * Initialize monitoring service
 */
const initializeMonitoringService = (prisma, io) => {
  if (!monitoringService) {
    monitoringService = new RealTimeMonitoringService(prisma, io);
  }
  return monitoringService;
};

/**
 * @swagger
 * /monitoring/start:
 *   post:
 *     summary: Start real-time monitoring
 *     description: Start real-time monitoring for an agent's shift
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agentId
 *               - shiftId
 *             properties:
 *               agentId:
 *                 type: string
 *                 format: uuid
 *               shiftId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Monitoring started successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post('/start',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('agentId').isUUID().withMessage('Valid agent ID is required'),
    body('shiftId').isUUID().withMessage('Valid shift ID is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { agentId, shiftId } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const monitoring = initializeMonitoringService(prisma, io);
    const result = await monitoring.startMonitoring(agentId, shiftId);

    logger.audit('monitoring_started', {
      startedBy: req.user.id,
      agentId,
      shiftId,
    });

    res.json({
      message: 'Real-time monitoring started successfully',
      monitoring: {
        agentId: result.agentId,
        shiftId: result.shiftId,
        startTime: result.startTime,
        status: result.status,
      },
    });
  })
);

/**
 * @swagger
 * /monitoring/stop:
 *   post:
 *     summary: Stop real-time monitoring
 *     description: Stop real-time monitoring for an agent
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agentId
 *             properties:
 *               agentId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Monitoring stopped successfully
 */
router.post('/stop',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('agentId').isUUID().withMessage('Valid agent ID is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { agentId } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const monitoring = initializeMonitoringService(prisma, io);
    const summary = await monitoring.stopMonitoring(agentId);

    logger.audit('monitoring_stopped', {
      stoppedBy: req.user.id,
      agentId,
      summary,
    });

    res.json({
      message: 'Real-time monitoring stopped successfully',
      summary,
    });
  })
);

/**
 * @swagger
 * /monitoring/status:
 *   get:
 *     summary: Get monitoring status
 *     description: Get current real-time monitoring status for all agents
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current monitoring status
 */
router.get('/status',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const monitoring = initializeMonitoringService(prisma, io);
    const status = monitoring.getMonitoringStatus();

    res.json({
      monitoring: status,
      timestamp: new Date(),
    });
  })
);

/**
 * @swagger
 * /monitoring/alerts:
 *   get:
 *     summary: Get real-time alerts
 *     description: Get recent real-time monitoring alerts
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: agentId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by agent ID
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by alert severity
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by alert type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *     responses:
 *       200:
 *         description: List of real-time alerts
 */
router.get('/alerts',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('agentId').optional().isUUID(),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    query('type').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { agentId, severity, type, limit = 50 } = req.query;
    const prisma = req.app.locals.prisma;

    // Query notifications for real-time alerts
    const where = {
      type: 'WARNING',
      data: {
        path: ['alertType'],
        not: null,
      },
    };

    if (agentId) {
      where.data.path = ['agentId'];
      where.data.equals = agentId;
    }

    if (severity) {
      where.data.path = ['severity'];
      where.data.equals = severity;
    }

    if (type) {
      where.data.path = ['alertType'];
      where.data.equals = type;
    }

    const alerts = await prisma.notification.findMany({
      where,
      include: {
        recipient: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Enrich alert data
    const enrichedAlerts = await Promise.all(
      alerts.map(async (alert) => {
        const alertData = alert.data;
        
        // Get agent info if available
        let agent = null;
        if (alertData.agentId) {
          agent = await prisma.agent.findUnique({
            where: { id: alertData.agentId },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  profile: true,
                },
              },
            },
          });
        }

        return {
          id: alert.id,
          type: alertData.alertType,
          severity: alertData.severity,
          message: alert.message,
          timestamp: alert.createdAt,
          agent,
          data: alertData,
          status: alert.status,
          readAt: alert.readAt,
        };
      })
    );

    res.json({
      alerts: enrichedAlerts,
      totalCount: enrichedAlerts.length,
      filters: {
        agentId,
        severity,
        type,
      },
    });
  })
);

/**
 * @swagger
 * /monitoring/dashboard:
 *   get:
 *     summary: Get monitoring dashboard data
 *     description: Get comprehensive monitoring dashboard data
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monitoring dashboard data
 */
router.get('/dashboard',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const monitoring = initializeMonitoringService(prisma, io);
    const status = monitoring.getMonitoringStatus();

    // Get additional dashboard metrics
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [activeShifts, recentAlerts, locationUpdates] = await Promise.all([
      // Active shifts
      prisma.shift.count({
        where: {
          status: 'IN_PROGRESS',
          startTime: { lte: now },
          endTime: { gte: now },
          deletedAt: null,
        },
      }),

      // Recent alerts (last 24 hours)
      prisma.notification.count({
        where: {
          type: 'WARNING',
          createdAt: { gte: last24Hours },
          data: {
            path: ['alertType'],
            not: null,
          },
        },
      }),

      // Location updates (last hour)
      prisma.locationTracking.count({
        where: {
          timestamp: {
            gte: new Date(now.getTime() - 60 * 60 * 1000),
          },
        },
      }),
    ]);

    // Calculate alert statistics
    const alertStats = {};
    Object.values(status.agents).forEach(agent => {
      if (agent.alertCount > 0) {
        alertStats[agent.agentId] = agent.alertCount;
      }
    });

    const dashboardData = {
      overview: {
        activeAgents: status.activeAgents,
        activeShifts,
        recentAlerts,
        locationUpdates,
      },
      monitoring: status,
      alertStatistics: {
        totalActiveAlerts: Object.values(alertStats).reduce((sum, count) => sum + count, 0),
        agentAlertCounts: alertStats,
      },
      systemHealth: {
        monitoringServiceStatus: 'operational',
        lastUpdate: new Date(),
      },
    };

    res.json(dashboardData);
  })
);

/**
 * @swagger
 * /monitoring/agents/locations:
 *   get:
 *     summary: Get active agent locations
 *     description: Get real-time locations of all active agents
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active agent locations
 */
router.get('/agents/locations',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    // Get agents currently on shift with their latest location
    const activeAgents = await prisma.agent.findMany({
      where: {
        status: 'ACTIVE',
        shifts: {
          some: {
            status: 'IN_PROGRESS',
            startTime: { lte: new Date() },
            endTime: { gte: new Date() },
            deletedAt: null,
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
        shifts: {
          where: {
            status: 'IN_PROGRESS',
            startTime: { lte: new Date() },
            endTime: { gte: new Date() },
            deletedAt: null,
          },
          include: {
            site: {
              select: {
                id: true,
                name: true,
                coordinates: true,
              },
            },
          },
          take: 1,
        },
        locationTracking: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    const agentLocations = activeAgents.map(agent => {
      const currentShift = agent.shifts[0];
      const lastLocation = agent.locationTracking[0];

      let latitude = null;
      let longitude = null;

      if (lastLocation && lastLocation.coordinates) {
        const coordMatch = lastLocation.coordinates.match(/POINT\(([^)]+)\)/);
        if (coordMatch) {
          const [lng, lat] = coordMatch[1].split(' ').map(Number);
          latitude = lat;
          longitude = lng;
        }
      }

      return {
        agentId: agent.id,
        agentName: `${agent.user.profile?.firstName || ''} ${agent.user.profile?.lastName || ''}`.trim() || agent.user.username,
        latitude,
        longitude,
        accuracy: lastLocation?.accuracy,
        timestamp: lastLocation?.timestamp,
        batteryLevel: lastLocation?.batteryLevel,
        shiftId: currentShift?.id,
        siteName: currentShift?.site?.name,
        status: lastLocation ? 'active' : 'inactive',
        geofenceStatus: 'unknown',
        lastUpdate: lastLocation?.timestamp || new Date(),
      };
    }).filter(agent => agent.latitude && agent.longitude);

    res.json({
      message: 'Active agent locations retrieved',
      agents: agentLocations,
      count: agentLocations.length,
    });
  })
);

/**
 * @swagger
 * /monitoring/alerts/{alertId}/acknowledge:
 *   post:
 *     summary: Acknowledge an alert
 *     description: Mark an alert as acknowledged
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert acknowledged
 */
router.post('/alerts/:alertId/acknowledge',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const { alertId } = req.params;
    const prisma = req.app.locals.prisma;

    const alert = await prisma.notification.update({
      where: { id: alertId },
      data: {
        status: 'READ',
        readBy: req.user.id,
        readAt: new Date(),
      },
    });

    res.json({
      message: 'Alert acknowledged successfully',
      alert: {
        id: alert.id,
        acknowledgedBy: req.user.id,
        acknowledgedAt: alert.readAt,
      },
    });
  })
);

/**
 * @swagger
 * /monitoring/metrics:
 *   get:
 *     summary: Get monitoring metrics
 *     description: Get comprehensive monitoring metrics
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monitoring metrics
 */
router.get('/metrics',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalAgents,
      activeAgents,
      agentsOnShift,
      alertCount,
      geofenceViolations,
      locationUpdates,
    ] = await Promise.all([
      // Total agents
      prisma.agent.count({
        where: { status: 'ACTIVE' },
      }),

      // Active agents (with recent location updates)
      prisma.agent.count({
        where: {
          status: 'ACTIVE',
          locationTracking: {
            some: {
              timestamp: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
            },
          },
        },
      }),

      // Agents currently on shift
      prisma.agent.count({
        where: {
          status: 'ACTIVE',
          shifts: {
            some: {
              status: 'IN_PROGRESS',
              startTime: { lte: now },
              endTime: { gte: now },
              deletedAt: null,
            },
          },
        },
      }),

      // Alert count (last 24 hours)
      prisma.notification.count({
        where: {
          type: 'WARNING',
          createdAt: { gte: last24Hours },
          data: {
            path: ['alertType'],
            not: null,
          },
        },
      }),

      // Geofence violations (last 24 hours)
      prisma.notification.count({
        where: {
          type: 'WARNING',
          createdAt: { gte: last24Hours },
          data: {
            path: ['alertType'],
            equals: 'geofence_violation',
          },
        },
      }),

      // Location updates (last hour)
      prisma.locationTracking.count({
        where: {
          timestamp: {
            gte: new Date(now.getTime() - 60 * 60 * 1000),
          },
        },
      }),
    ]);

    res.json({
      message: 'Monitoring metrics retrieved',
      metrics: {
        totalAgents,
        activeAgents,
        agentsOnShift,
        alertCount,
        geofenceViolations,
        locationUpdates,
        systemUptime: process.uptime(),
        averageResponseTime: 0,
      },
      timestamp: now,
    });
  })
);

module.exports = { router, initializeMonitoringService };
