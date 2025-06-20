const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../config/logger');
const GeofencingService = require('../services/geofencing');
const LocationAnalyticsService = require('../services/locationAnalytics');

const router = express.Router();

/**
 * @swagger
 * /locations/track:
 *   post:
 *     summary: Submit location update
 *     description: Submit real-time location data from agent device
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *               - timestamp
 *             properties:
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *               accuracy:
 *                 type: number
 *                 minimum: 0
 *               altitude:
 *                 type: number
 *               speed:
 *                 type: number
 *                 minimum: 0
 *               heading:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 360
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *               batteryLevel:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *               shiftId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Location recorded successfully
 *       400:
 *         description: Invalid location data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only agents can submit location data
 */
router.post('/track',
  authenticate,
  authorize('AGENT'),
  [
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    body('accuracy').optional().isFloat({ min: 0 }),
    body('altitude').optional().isFloat(),
    body('speed').optional().isFloat({ min: 0 }),
    body('heading').optional().isFloat({ min: 0, max: 360 }),
    body('timestamp').isISO8601().withMessage('Valid timestamp is required'),
    body('batteryLevel').optional().isInt({ min: 0, max: 100 }),
    body('shiftId').optional().isUUID(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const {
      latitude,
      longitude,
      accuracy,
      altitude,
      speed,
      heading,
      timestamp,
      batteryLevel,
      shiftId,
    } = req.body;

    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    // Initialize services
    const geofencingService = new GeofencingService(prisma, io);
    const analyticsService = new LocationAnalyticsService(prisma);

    // Validate shift if provided
    if (shiftId) {
      const shift = await prisma.shift.findFirst({
        where: {
          id: shiftId,
          agentId: req.user.agent.id,
          deletedAt: null,
        },
      });

      if (!shift) {
        throw new ApiError(404, 'Shift not found or access denied');
      }
    }

    // Detect mock location and anomalies
    const isMockLocation = accuracy === 0 || accuracy === 1;

    // Monitor geofence compliance
    const geofenceResult = await geofencingService.monitorAgentLocation(
      req.user.agent.id,
      latitude,
      longitude,
      shiftId
    );

    // Create location tracking record
    const locationRecord = await prisma.locationTracking.create({
      data: {
        id: uuidv4(),
        agentId: req.user.agent.id,
        shiftId,
        coordinates: `POINT(${longitude} ${latitude})`,
        accuracy,
        altitude,
        speed,
        heading,
        timestamp: new Date(timestamp),
        batteryLevel,
        isMockLocation,
      },
    });

    // Emit real-time update via Socket.IO with geofence status
    if (io) {
      io.to('role:supervisor').to('role:admin').emit('agent_location_update', {
        agentId: req.user.agent.id,
        latitude,
        longitude,
        accuracy,
        timestamp,
        batteryLevel,
        shiftId,
        geofenceStatus: geofenceResult.status,
        distance: geofenceResult.distance,
        isMockLocation,
      });
    }

    res.json({
      message: 'Location recorded successfully',
      id: locationRecord.id,
      timestamp: locationRecord.timestamp,
      geofenceStatus: geofenceResult.status,
      compliance: geofenceResult.status === 'compliant',
      distance: geofenceResult.distance,
      warnings: isMockLocation ? ['Mock location detected'] : [],
    });
  })
);

/**
 * @swagger
 * /locations/agent/{agentId}:
 *   get:
 *     summary: Get agent location history
 *     description: Retrieve location history for a specific agent
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *     responses:
 *       200:
 *         description: Agent location history
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Agent not found
 */
router.get('/agent/:agentId',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { agentId } = req.params;
    const { startDate, endDate, limit = 100 } = req.query;
    const prisma = req.app.locals.prisma;

    // Verify agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: agentId, deletedAt: null },
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

    if (!agent) {
      throw new ApiError(404, 'Agent not found');
    }

    // Build date filter
    const where = { agentId };
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    // Get location history
    const locations = await prisma.locationTracking.findMany({
      where,
      select: {
        id: true,
        coordinates: true,
        accuracy: true,
        altitude: true,
        speed: true,
        heading: true,
        timestamp: true,
        batteryLevel: true,
        shift: {
          select: {
            id: true,
            site: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    // Convert PostGIS POINT to lat/lng
    const formattedLocations = locations.map(location => {
      // Extract coordinates from PostGIS POINT format
      const coordMatch = location.coordinates.match(/POINT\(([^)]+)\)/);
      const [longitude, latitude] = coordMatch ? coordMatch[1].split(' ').map(Number) : [0, 0];
      
      return {
        ...location,
        latitude,
        longitude,
        coordinates: undefined, // Remove raw coordinates
      };
    });

    res.json({
      agent: {
        id: agent.id,
        user: agent.user,
      },
      locations: formattedLocations,
      totalCount: formattedLocations.length,
    });
  })
);

/**
 * @swagger
 * /locations/current:
 *   get:
 *     summary: Get current locations of all active agents
 *     description: Retrieve the latest location for all agents currently on shift
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current agent locations
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/current',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    // Get agents currently on active shifts
    const activeShifts = await prisma.shift.findMany({
      where: {
        status: 'IN_PROGRESS',
        startTime: { lte: new Date() },
        endTime: { gte: new Date() },
        deletedAt: null,
      },
      include: {
        agent: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profile: true,
              },
            },
          },
        },
        site: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Get latest location for each agent
    const currentLocations = await Promise.all(
      activeShifts.map(async (shift) => {
        const latestLocation = await prisma.locationTracking.findFirst({
          where: { agentId: shift.agentId },
          orderBy: { timestamp: 'desc' },
          select: {
            coordinates: true,
            accuracy: true,
            timestamp: true,
            batteryLevel: true,
          },
        });

        if (!latestLocation) return null;

        // Extract coordinates from PostGIS POINT format
        const coordMatch = latestLocation.coordinates.match(/POINT\(([^)]+)\)/);
        const [longitude, latitude] = coordMatch ? coordMatch[1].split(' ').map(Number) : [0, 0];

        return {
          agent: shift.agent,
          shift: {
            id: shift.id,
            site: shift.site,
            startTime: shift.startTime,
            endTime: shift.endTime,
          },
          location: {
            latitude,
            longitude,
            accuracy: latestLocation.accuracy,
            timestamp: latestLocation.timestamp,
            batteryLevel: latestLocation.batteryLevel,
          },
        };
      })
    );

    // Filter out null results
    const validLocations = currentLocations.filter(Boolean);

    res.json({
      currentLocations: validLocations,
      totalAgents: validLocations.length,
    });
  })
);

/**
 * @swagger
 * /locations/geofence/validate:
 *   post:
 *     summary: Validate location against geofence
 *     description: Check if a location is within a site's geofence
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *               - siteId
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               siteId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Geofence validation result
 */
router.post('/geofence/validate',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  [
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    body('siteId').isUUID().withMessage('Valid site ID is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { latitude, longitude, siteId } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const geofencingService = new GeofencingService(prisma, io);
    const result = await geofencingService.isWithinGeofence(latitude, longitude, siteId);

    res.json({
      validation: result,
      timestamp: new Date(),
    });
  })
);

/**
 * @swagger
 * /locations/analytics/patrol-efficiency/{agentId}/{shiftId}:
 *   get:
 *     summary: Get patrol efficiency analytics
 *     description: Calculate patrol efficiency metrics for an agent's shift
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: shiftId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Patrol efficiency metrics
 */
router.get('/analytics/patrol-efficiency/:agentId/:shiftId',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const { agentId, shiftId } = req.params;
    const prisma = req.app.locals.prisma;

    const analyticsService = new LocationAnalyticsService(prisma);
    const efficiency = await analyticsService.calculatePatrolEfficiency(agentId, shiftId);

    res.json({
      agentId,
      shiftId,
      efficiency,
      calculatedAt: new Date(),
    });
  })
);

/**
 * @swagger
 * /locations/analytics/movement-patterns/{agentId}:
 *   get:
 *     summary: Analyze agent movement patterns
 *     description: Get detailed movement pattern analysis for an agent
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
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
 *         description: Movement pattern analysis
 */
router.get('/analytics/movement-patterns/:agentId',
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

    const { agentId } = req.params;
    const { startDate, endDate } = req.query;
    const prisma = req.app.locals.prisma;

    const analyticsService = new LocationAnalyticsService(prisma);
    const patterns = await analyticsService.analyzeMovementPatterns(
      agentId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json(patterns);
  })
);

/**
 * @swagger
 * /locations/analytics/anomalies/{agentId}/{shiftId}:
 *   get:
 *     summary: Detect location anomalies
 *     description: Detect anomalies in agent location data for a shift
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Location anomaly analysis
 */
router.get('/analytics/anomalies/:agentId/:shiftId',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const { agentId, shiftId } = req.params;
    const prisma = req.app.locals.prisma;

    const analyticsService = new LocationAnalyticsService(prisma);
    const anomalies = await analyticsService.detectLocationAnomalies(agentId, shiftId);

    res.json(anomalies);
  })
);

module.exports = router;
