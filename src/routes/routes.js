const express = require('express');
const { body, query, validationResult } = require('express-validator');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../config/logger');
const LocationAnalyticsService = require('../services/locationAnalytics');

const router = express.Router();

/**
 * @swagger
 * /routes/optimize/{siteId}:
 *   post:
 *     summary: Generate optimal patrol route
 *     description: Generate an optimized patrol route for a site
 *     tags: [Routes]
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               patrolPoints:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     name:
 *                       type: string
 *                     priority:
 *                       type: integer
 *               routeType:
 *                 type: string
 *                 enum: [perimeter, grid, custom, equipment_check]
 *               maxDuration:
 *                 type: integer
 *                 description: Maximum route duration in minutes
 *     responses:
 *       200:
 *         description: Optimized patrol route
 */
router.post('/optimize/:siteId',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  [
    body('patrolPoints').optional().isArray(),
    body('routeType').optional().isIn(['perimeter', 'grid', 'custom', 'equipment_check']),
    body('maxDuration').optional().isInt({ min: 10, max: 480 }),
  ],
  asyncHandler(async (req, res) => {
    const { siteId } = req.params;
    const { patrolPoints = [], routeType = 'perimeter', maxDuration = 60 } = req.body;
    const prisma = req.app.locals.prisma;

    // Verify site exists and user has access
    const site = await prisma.site.findUnique({
      where: { id: siteId, deletedAt: null },
      include: {
        equipmentList: true,
      },
    });

    if (!site) {
      throw new ApiError(404, 'Site not found');
    }

    const analyticsService = new LocationAnalyticsService(prisma);
    
    // Generate route based on type
    let optimizedRoute;
    
    switch (routeType) {
      case 'equipment_check':
        optimizedRoute = await generateEquipmentCheckRoute(site, analyticsService);
        break;
      case 'grid':
        optimizedRoute = await generateGridRoute(site, analyticsService);
        break;
      case 'custom':
        optimizedRoute = await analyticsService.generateOptimalRoute(siteId, patrolPoints);
        break;
      default: // perimeter
        optimizedRoute = await analyticsService.generateOptimalRoute(siteId, []);
    }

    // Adjust route if it exceeds max duration
    if (optimizedRoute.estimatedDuration > maxDuration) {
      optimizedRoute = await adjustRouteForDuration(optimizedRoute, maxDuration);
    }

    logger.audit('route_optimized', {
      optimizedBy: req.user.id,
      siteId,
      routeType,
      estimatedDuration: optimizedRoute.estimatedDuration,
      waypointCount: optimizedRoute.route.length,
    });

    res.json({
      message: 'Route optimized successfully',
      route: optimizedRoute,
      metadata: {
        routeType,
        maxDuration,
        generatedAt: new Date(),
        generatedBy: req.user.id,
      },
    });
  })
);

/**
 * @swagger
 * /routes/templates:
 *   get:
 *     summary: Get route templates
 *     description: Get predefined route templates for different site types
 *     tags: [Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: siteType
 *         schema:
 *           type: string
 *         description: Filter by site type
 *     responses:
 *       200:
 *         description: List of route templates
 */
router.get('/templates',
  authenticate,
  [
    query('siteType').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const { siteType } = req.query;

    // Predefined route templates based on site types
    const templates = {
      commercial: [
        {
          id: 'commercial-perimeter',
          name: 'Commercial Perimeter Patrol',
          description: 'Standard perimeter patrol for commercial buildings',
          estimatedDuration: 30,
          checkpoints: ['main_entrance', 'loading_dock', 'parking_lot', 'emergency_exits'],
          instructions: [
            'Start at main entrance',
            'Check all entry points',
            'Inspect parking areas',
            'Verify emergency exit accessibility',
            'Return to main entrance',
          ],
        },
        {
          id: 'commercial-interior',
          name: 'Commercial Interior Check',
          description: 'Interior security check for commercial buildings',
          estimatedDuration: 45,
          checkpoints: ['lobby', 'elevators', 'stairwells', 'common_areas', 'roof_access'],
          instructions: [
            'Check lobby and reception area',
            'Inspect all elevator areas',
            'Check stairwell access',
            'Patrol common areas',
            'Verify roof access security',
          ],
        },
      ],
      industrial: [
        {
          id: 'industrial-perimeter',
          name: 'Industrial Perimeter Patrol',
          description: 'Comprehensive perimeter patrol for industrial sites',
          estimatedDuration: 60,
          checkpoints: ['main_gate', 'fence_line', 'storage_areas', 'equipment_yards', 'utility_areas'],
          instructions: [
            'Start at main gate',
            'Patrol entire fence line',
            'Check storage and equipment areas',
            'Inspect utility installations',
            'Return to main gate',
          ],
        },
      ],
      retail: [
        {
          id: 'retail-standard',
          name: 'Retail Standard Patrol',
          description: 'Standard patrol route for retail locations',
          estimatedDuration: 20,
          checkpoints: ['store_front', 'customer_areas', 'stock_room', 'employee_areas', 'cash_office'],
          instructions: [
            'Check store front and entrance',
            'Patrol customer areas',
            'Inspect stock and storage rooms',
            'Check employee areas',
            'Verify cash office security',
          ],
        },
      ],
    };

    // Filter by site type if specified
    const filteredTemplates = siteType && templates[siteType] 
      ? { [siteType]: templates[siteType] }
      : templates;

    res.json({
      templates: filteredTemplates,
      totalTemplates: Object.values(filteredTemplates).flat().length,
    });
  })
);

/**
 * @swagger
 * /routes/history/{agentId}:
 *   get:
 *     summary: Get agent route history
 *     description: Get historical route data for an agent
 *     tags: [Routes]
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
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Agent route history
 */
router.get('/history/:agentId',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { agentId } = req.params;
    const { startDate, endDate, limit = 20 } = req.query;
    const prisma = req.app.locals.prisma;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    // Get shifts with location data
    const shifts = await prisma.shift.findMany({
      where: {
        agentId,
        ...(Object.keys(dateFilter).length > 0 && {
          startTime: dateFilter,
        }),
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
        locationTracking: {
          orderBy: { timestamp: 'asc' },
          select: {
            coordinates: true,
            timestamp: true,
            speed: true,
          },
        },
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
      },
      orderBy: { startTime: 'desc' },
      take: limit,
    });

    // Process route data for each shift
    const routeHistory = await Promise.all(
      shifts.map(async (shift) => {
        const analyticsService = new LocationAnalyticsService(prisma);
        const efficiency = await analyticsService.calculatePatrolEfficiency(
          agentId,
          shift.id
        );

        // Convert location tracking to route points
        const routePoints = shift.locationTracking.map(location => {
          const coordMatch = location.coordinates.match(/POINT\(([^)]+)\)/);
          const [longitude, latitude] = coordMatch[1].split(' ').map(Number);
          return {
            latitude,
            longitude,
            timestamp: location.timestamp,
            speed: location.speed,
          };
        });

        return {
          shiftId: shift.id,
          site: shift.site,
          startTime: shift.startTime,
          endTime: shift.endTime,
          status: shift.status,
          routePoints,
          efficiency,
          totalPoints: routePoints.length,
        };
      })
    );

    res.json({
      agentId,
      agent: shifts[0]?.agent || null,
      routeHistory,
      totalShifts: routeHistory.length,
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
    });
  })
);

// Helper functions

async function generateEquipmentCheckRoute(site, analyticsService) {
  // Extract equipment locations from site data
  const equipmentPoints = site.equipmentList
    .filter(item => item.location && item.status === 'Active')
    .map(item => ({
      latitude: item.location.latitude || 0,
      longitude: item.location.longitude || 0,
      name: item.item,
      type: 'equipment',
    }));

  return await analyticsService.generateOptimalRoute(site.id, equipmentPoints);
}

async function generateGridRoute(site, analyticsService) {
  // Generate grid pattern based on site coordinates and geofence
  const siteCenter = analyticsService.extractCoordinates(site.coordinates);
  const radius = site.geofenceRadius || 100;
  
  // Create a 3x3 grid pattern
  const gridPoints = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      if (x === 0 && y === 0) continue; // Skip center
      
      const offsetLat = (y * radius * 0.6) / 111000; // Approximate degrees
      const offsetLng = (x * radius * 0.6) / (111000 * Math.cos(siteCenter.latitude * Math.PI / 180));
      
      gridPoints.push({
        latitude: siteCenter.latitude + offsetLat,
        longitude: siteCenter.longitude + offsetLng,
        name: `Grid Point ${x},${y}`,
        type: 'grid',
      });
    }
  }

  return await analyticsService.generateOptimalRoute(site.id, gridPoints);
}

async function adjustRouteForDuration(route, maxDuration) {
  // Simple route adjustment - remove waypoints if route is too long
  if (route.estimatedDuration <= maxDuration) {
    return route;
  }

  const reductionFactor = maxDuration / route.estimatedDuration;
  const targetWaypoints = Math.floor(route.route.length * reductionFactor);
  
  // Keep start, end, and evenly distributed waypoints
  const adjustedRoute = [route.route[0]]; // Start point
  
  if (targetWaypoints > 2) {
    const step = Math.floor((route.route.length - 2) / (targetWaypoints - 2));
    for (let i = step; i < route.route.length - 1; i += step) {
      adjustedRoute.push(route.route[i]);
    }
  }
  
  adjustedRoute.push(route.route[route.route.length - 1]); // End point

  return {
    ...route,
    route: adjustedRoute,
    estimatedDuration: Math.ceil(maxDuration),
    adjusted: true,
    originalWaypoints: route.route.length,
    adjustedWaypoints: adjustedRoute.length,
  };
}

module.exports = router;
