const express = require('express');
const { body, query, validationResult } = require('express-validator');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../config/logger');
const WorkforcePlanningService = require('../services/workforcePlanning');

const router = express.Router();

/**
 * @swagger
 * /workforce/capacity:
 *   get:
 *     summary: Get workforce capacity analysis
 *     description: Get detailed workforce capacity and utilization analysis
 *     tags: [Workforce]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: siteId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: skillRequirements
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: includeProjections
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: Workforce capacity analysis
 */
router.get('/capacity',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('startDate').isISO8601().withMessage('Valid start date is required'),
    query('endDate').isISO8601().withMessage('Valid end date is required'),
    query('siteId').optional().isUUID(),
    query('skillRequirements').optional().isArray(),
    query('includeProjections').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const {
      startDate,
      endDate,
      siteId,
      skillRequirements = [],
      includeProjections = true,
    } = req.query;
    const prisma = req.app.locals.prisma;

    const workforceService = new WorkforcePlanningService(prisma);
    const capacity = await workforceService.calculateWorkforceCapacity(
      new Date(startDate),
      new Date(endDate),
      {
        siteId,
        skillRequirements,
        includeProjections,
      }
    );

    res.json(capacity);
  })
);

/**
 * @swagger
 * /workforce/allocation/optimize:
 *   post:
 *     summary: Optimize workforce allocation
 *     description: Generate optimized workforce allocation recommendations
 *     tags: [Workforce]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               prioritizeCoverage:
 *                 type: boolean
 *                 default: true
 *               minimizeCosts:
 *                 type: boolean
 *                 default: true
 *               respectPreferences:
 *                 type: boolean
 *                 default: true
 *               balanceWorkload:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Workforce allocation optimization results
 */
router.post('/allocation/optimize',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('prioritizeCoverage').optional().isBoolean(),
    body('minimizeCosts').optional().isBoolean(),
    body('respectPreferences').optional().isBoolean(),
    body('balanceWorkload').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const criteria = {
      ...req.body,
      startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
    };
    const prisma = req.app.locals.prisma;

    const workforceService = new WorkforcePlanningService(prisma);
    const optimization = await workforceService.optimizeWorkforceAllocation(criteria);

    logger.audit('workforce_allocation_optimized', {
      optimizedBy: req.user.id,
      criteria,
      potentialSavings: optimization.potentialSavings,
    });

    res.json({
      message: 'Workforce allocation optimization completed',
      optimization,
    });
  })
);

/**
 * @swagger
 * /workforce/forecast:
 *   get:
 *     summary: Get workforce demand forecast
 *     description: Get AI-powered workforce demand forecasting
 *     tags: [Workforce]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: forecastPeriod
 *         schema:
 *           type: integer
 *           minimum: 30
 *           maximum: 365
 *           default: 90
 *         description: Forecast period in days
 *     responses:
 *       200:
 *         description: Workforce demand forecast
 */
router.get('/forecast',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('forecastPeriod').optional().isInt({ min: 30, max: 365 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { forecastPeriod = 90 } = req.query;
    const prisma = req.app.locals.prisma;

    const workforceService = new WorkforcePlanningService(prisma);
    const forecast = await workforceService.forecastWorkforceNeeds(forecastPeriod);

    res.json(forecast);
  })
);

/**
 * @swagger
 * /workforce/performance:
 *   get:
 *     summary: Get workforce performance insights
 *     description: Get comprehensive workforce performance analysis
 *     tags: [Workforce]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Workforce performance insights
 */
router.get('/performance',
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

    const { startDate, endDate } = req.query;
    const prisma = req.app.locals.prisma;

    const workforceService = new WorkforcePlanningService(prisma);
    const insights = await workforceService.generatePerformanceInsights(
      new Date(startDate),
      new Date(endDate)
    );

    res.json(insights);
  })
);

/**
 * @swagger
 * /workforce/dashboard:
 *   get:
 *     summary: Get workforce management dashboard
 *     description: Get comprehensive workforce management dashboard data
 *     tags: [Workforce]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workforce dashboard data
 */
router.get('/dashboard',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Get current workforce metrics
    const [
      totalAgents,
      activeAgents,
      totalShifts,
      unassignedShifts,
      completedShifts,
    ] = await Promise.all([
      prisma.agent.count({
        where: { deletedAt: null },
      }),
      prisma.agent.count({
        where: {
          employmentStatus: 'ACTIVE',
          deletedAt: null,
        },
      }),
      prisma.shift.count({
        where: {
          startTime: { gte: last30Days },
          endTime: { lte: next30Days },
          deletedAt: null,
        },
      }),
      prisma.shift.count({
        where: {
          agentId: null,
          startTime: { gte: now },
          endTime: { lte: next30Days },
          status: 'SCHEDULED',
          deletedAt: null,
        },
      }),
      prisma.shift.count({
        where: {
          status: 'COMPLETED',
          startTime: { gte: last30Days },
          endTime: { lte: now },
          deletedAt: null,
        },
      }),
    ]);

    // Get capacity analysis for next 30 days
    const workforceService = new WorkforcePlanningService(prisma);
    const capacity = await workforceService.calculateWorkforceCapacity(
      now,
      next30Days,
      { includeProjections: false }
    );

    // Calculate key metrics
    const utilizationRate = capacity.utilization.overallUtilization;
    const assignmentRate = totalShifts > 0 ? ((totalShifts - unassignedShifts) / totalShifts * 100).toFixed(1) : 0;
    const completionRate = totalShifts > 0 ? (completedShifts / totalShifts * 100).toFixed(1) : 0;

    // Get recent alerts/issues
    const recentIssues = await prisma.notification.count({
      where: {
        type: 'WARNING',
        createdAt: { gte: last30Days },
        data: {
          path: ['type'],
          in: ['scheduling_conflict', 'understaffed', 'overtime_violation'],
        },
      },
    });

    const dashboardData = {
      overview: {
        totalAgents,
        activeAgents,
        totalShifts,
        unassignedShifts,
        completedShifts,
      },
      metrics: {
        utilizationRate: parseFloat(utilizationRate),
        assignmentRate: parseFloat(assignmentRate),
        completionRate: parseFloat(completionRate),
        capacityStatus: capacity.utilization.status,
      },
      capacity: {
        maxCapacityHours: capacity.capacity.maxCapacityHours,
        scheduledHours: capacity.capacity.scheduledHours,
        availableHours: capacity.capacity.availableHours,
        demandHours: capacity.demand.demandHours,
      },
      alerts: {
        recentIssues,
        unassignedShifts,
        capacityGap: capacity.utilization.capacityGap,
      },
      recommendations: capacity.recommendations,
      lastUpdated: new Date(),
    };

    res.json(dashboardData);
  })
);

module.exports = router;
