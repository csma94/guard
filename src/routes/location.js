const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const LocationTrackingService = require('../services/locationTracking');
const GeofencingService = require('../services/geofencing');

const router = express.Router();

/**
 * @swagger
 * /location/tracking/start:
 *   post:
 *     summary: Start location tracking
 *     description: Start real-time location tracking for an agent's shift
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shiftId
 *             properties:
 *               shiftId:
 *                 type: string
 *                 format: uuid
 *               updateInterval:
 *                 type: integer
 *                 default: 30
 *                 description: Update interval in seconds
 *               highAccuracy:
 *                 type: boolean
 *                 default: true
 *               enableGeofencing:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Location tracking started
 */
router.post('/tracking/start',
  authenticate,
  authorize('AGENT'),
  [
    body('shiftId').isUUID().withMessage('Valid shift ID is required'),
    body('updateInterval').optional().isInt({ min: 10, max: 300 }).withMessage('Update interval must be between 10-300 seconds'),
    body('highAccuracy').optional().isBoolean(),
    body('enableGeofencing').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { shiftId, updateInterval, highAccuracy, enableGeofencing } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can start location tracking');
    }

    const locationService = new LocationTrackingService(prisma, io);

    try {
      const result = await locationService.startLocationTracking(req.user.agent.id, shiftId, {
        updateInterval,
        highAccuracy,
        enableGeofencing
      });

      res.json({
        success: true,
        message: 'Location tracking started successfully',
        ...result
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /location/tracking/update:
 *   post:
 *     summary: Update location
 *     description: Update agent's current location
 *     tags: [Location]
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
 *               altitude:
 *                 type: number
 *               speed:
 *                 type: number
 *               heading:
 *                 type: number
 *               batteryLevel:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Location updated successfully
 */
router.post('/tracking/update',
  authenticate,
  authorize('AGENT'),
  [
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    body('accuracy').optional().isFloat({ min: 0 }),
    body('altitude').optional().isFloat(),
    body('speed').optional().isFloat({ min: 0 }),
    body('heading').optional().isFloat({ min: 0, max: 360 }),
    body('batteryLevel').optional().isFloat({ min: 0, max: 100 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const locationData = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can update location');
    }

    const locationService = new LocationTrackingService(prisma, io);

    try {
      const result = await locationService.updateLocation(req.user.agent.id, locationData);

      res.json({
        success: true,
        message: 'Location updated successfully',
        ...result
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /location/tracking/stop:
 *   post:
 *     summary: Stop location tracking
 *     description: Stop location tracking for current agent
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Location tracking stopped
 */
router.post('/tracking/stop',
  authenticate,
  authorize('AGENT'),
  [
    body('reason').optional().isString().isLength({ max: 255 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { reason = 'Manual stop' } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can stop location tracking');
    }

    const locationService = new LocationTrackingService(prisma, io);

    try {
      const result = await locationService.stopLocationTracking(req.user.agent.id, reason);

      res.json({
        success: true,
        message: 'Location tracking stopped successfully',
        ...result
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /location/agents/active:
 *   get:
 *     summary: Get active agent locations
 *     description: Get real-time locations of all active agents
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: siteIds
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             format: uuid
 *         description: Filter by site IDs
 *       - in: query
 *         name: includeOffline
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Active agent locations
 */
router.get('/agents/active',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('siteIds').optional().isArray(),
    query('includeOffline').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { siteIds = [], includeOffline = false } = req.query;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const locationService = new LocationTrackingService(prisma, io);

    try {
      const result = await locationService.getActiveAgentLocations(siteIds, includeOffline);

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      throw new ApiError(500, error.message);
    }
  })
);

/**
 * @swagger
 * /location/geofence/validate:
 *   post:
 *     summary: Validate geofence
 *     description: Check if a location is within a site's geofence
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - siteId
 *               - latitude
 *               - longitude
 *             properties:
 *               siteId:
 *                 type: string
 *                 format: uuid
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       200:
 *         description: Geofence validation result
 */
router.post('/geofence/validate',
  authenticate,
  [
    body('siteId').isUUID().withMessage('Valid site ID is required'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { siteId, latitude, longitude } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const geofencingService = new GeofencingService(prisma, io);

    try {
      const result = await geofencingService.isWithinGeofence(latitude, longitude, siteId);

      res.json({
        success: true,
        validation: result
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

module.exports = router;
