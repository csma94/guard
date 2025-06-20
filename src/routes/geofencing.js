const express = require('express');
const { body, query, validationResult } = require('express-validator');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../config/logger');
const GeofencingService = require('../services/geofencing');

const router = express.Router();

/**
 * @swagger
 * /geofencing/sites/{siteId}/custom:
 *   post:
 *     summary: Create custom geofence
 *     description: Create a custom polygon geofence for a site
 *     tags: [Geofencing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - coordinates
 *             properties:
 *               coordinates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                 minItems: 3
 *     responses:
 *       201:
 *         description: Custom geofence created successfully
 *       400:
 *         description: Invalid coordinates
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post('/sites/:siteId/custom',
  authenticate,
  authorize('ADMIN'),
  [
    body('coordinates')
      .isArray({ min: 3 })
      .withMessage('At least 3 coordinates required for polygon geofence'),
    body('coordinates.*.latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),
    body('coordinates.*.longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { siteId } = req.params;
    const { coordinates } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    // Verify site exists
    const site = await prisma.site.findUnique({
      where: { id: siteId, deletedAt: null },
    });

    if (!site) {
      throw new ApiError(404, 'Site not found');
    }

    const geofencingService = new GeofencingService(prisma, io);
    const result = await geofencingService.createCustomGeofence(
      siteId,
      coordinates,
      req.user.id
    );

    res.status(201).json({
      message: 'Custom geofence created successfully',
      geofence: result,
    });
  })
);

/**
 * @swagger
 * /geofencing/sites/{siteId}/analytics:
 *   get:
 *     summary: Get geofence analytics
 *     description: Get detailed geofence compliance analytics for a site
 *     tags: [Geofencing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: siteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Geofence analytics data
 */
router.get('/sites/:siteId/analytics',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('startDate').isISO8601().withMessage('Valid start date is required'),
    query('endDate').isISO8601().withMessage('Valid end date is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { siteId } = req.params;
    const { startDate, endDate } = req.query;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const geofencingService = new GeofencingService(prisma, io);
    const analytics = await geofencingService.getGeofenceAnalytics(
      siteId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json(analytics);
  })
);

/**
 * @swagger
 * /geofencing/violations:
 *   get:
 *     summary: Get geofence violations
 *     description: Get recent geofence violations across all sites
 *     tags: [Geofencing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: siteId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by site ID
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
 *         description: Filter by violation severity
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: List of geofence violations
 */
router.get('/violations',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('siteId').optional().isUUID(),
    query('agentId').optional().isUUID(),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { siteId, agentId, severity, limit = 50, offset = 0 } = req.query;
    const prisma = req.app.locals.prisma;

    // Query audit logs for geofence violations
    const where = {
      action: 'geofence_check',
      newValues: {
        path: ['isCompliant'],
        equals: false,
      },
    };

    if (agentId) {
      where.recordId = agentId;
    }

    if (siteId) {
      where.newValues.path = ['siteId'];
      where.newValues.equals = siteId;
    }

    const [violations, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Enrich violation data with agent and site information
    const enrichedViolations = await Promise.all(
      violations.map(async (violation) => {
        const data = violation.newValues;
        
        // Get agent info
        const agent = await prisma.agent.findUnique({
          where: { id: data.agentId },
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

        // Get site info
        const site = await prisma.site.findUnique({
          where: { id: data.siteId },
          select: {
            id: true,
            name: true,
          },
        });

        // Determine severity based on distance
        let violationSeverity = 'low';
        if (data.distance > 500) violationSeverity = 'critical';
        else if (data.distance > 200) violationSeverity = 'high';
        else if (data.distance > 100) violationSeverity = 'medium';

        return {
          id: violation.id,
          timestamp: violation.timestamp,
          agent,
          site,
          distance: data.distance,
          severity: violationSeverity,
          location: {
            latitude: data.latitude,
            longitude: data.longitude,
          },
          shiftId: data.shiftId,
        };
      })
    );

    // Filter by severity if specified
    const filteredViolations = severity
      ? enrichedViolations.filter(v => v.severity === severity)
      : enrichedViolations;

    res.json({
      violations: filteredViolations,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasNext: offset + limit < totalCount,
      },
    });
  })
);

/**
 * @swagger
 * /geofencing/alerts/configure:
 *   post:
 *     summary: Configure geofence alerts
 *     description: Configure alert settings for geofence violations
 *     tags: [Geofencing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               siteId:
 *                 type: string
 *                 format: uuid
 *               alertThreshold:
 *                 type: integer
 *                 description: Distance threshold in meters
 *               alertChannels:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [PUSH, EMAIL, SMS]
 *               escalationRules:
 *                 type: object
 *               autoResponse:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Alert configuration updated
 */
router.post('/alerts/configure',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('siteId').optional().isUUID(),
    body('alertThreshold').optional().isInt({ min: 10, max: 1000 }),
    body('alertChannels').optional().isArray(),
    body('escalationRules').optional().isObject(),
    body('autoResponse').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const {
      siteId,
      alertThreshold = 100,
      alertChannels = ['PUSH', 'EMAIL'],
      escalationRules = {},
      autoResponse = false,
    } = req.body;

    const prisma = req.app.locals.prisma;

    // Store alert configuration in user preferences or site settings
    const alertConfig = {
      alertThreshold,
      alertChannels,
      escalationRules,
      autoResponse,
      configuredBy: req.user.id,
      configuredAt: new Date(),
    };

    if (siteId) {
      // Site-specific configuration
      await prisma.site.update({
        where: { id: siteId },
        data: {
          settings: {
            ...alertConfig,
          },
        },
      });
    } else {
      // Global configuration for user
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          preferences: {
            ...req.user.preferences,
            geofenceAlerts: alertConfig,
          },
        },
      });
    }

    logger.audit('geofence_alerts_configured', {
      configuredBy: req.user.id,
      siteId,
      alertConfig,
    });

    res.json({
      message: 'Geofence alert configuration updated successfully',
      configuration: alertConfig,
    });
  })
);

module.exports = router;
