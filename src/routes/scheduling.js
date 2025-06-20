const express = require('express');
const { body, query, validationResult } = require('express-validator');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../config/logger');
const SchedulingService = require('../services/scheduling');

const router = express.Router();

/**
 * @swagger
 * /scheduling/conflicts:
 *   get:
 *     summary: Detect scheduling conflicts
 *     description: Detect and analyze scheduling conflicts
 *     tags: [Scheduling]
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
 *         description: Scheduling conflicts analysis
 */
router.get('/conflicts',
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

    const schedulingService = new SchedulingService(prisma);
    const conflicts = await schedulingService.detectSchedulingConflicts(
      new Date(startDate),
      new Date(endDate)
    );

    res.json(conflicts);
  })
);

/**
 * @swagger
 * /scheduling/analytics/workforce:
 *   get:
 *     summary: Get workforce analytics
 *     description: Get comprehensive workforce analytics and insights
 *     tags: [Scheduling]
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
 *         description: Workforce analytics data
 */
router.get('/analytics/workforce',
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

    const schedulingService = new SchedulingService(prisma);
    const analytics = await schedulingService.generateWorkforceAnalytics(
      new Date(startDate),
      new Date(endDate)
    );

    res.json(analytics);
  })
);

/**
 * @swagger
 * /scheduling/recommendations:
 *   get:
 *     summary: Get scheduling recommendations
 *     description: Get AI-powered scheduling recommendations
 *     tags: [Scheduling]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: siteId
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
 *         name: includeOptimization
 *         schema:
 *           type: boolean
 *           default: true
 *       - in: query
 *         name: includeStaffing
 *         schema:
 *           type: boolean
 *           default: true
 *       - in: query
 *         name: includeCost
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: Scheduling recommendations
 */
router.get('/recommendations',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('siteId').optional().isUUID(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('includeOptimization').optional().isBoolean(),
    query('includeStaffing').optional().isBoolean(),
    query('includeCost').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const {
      siteId,
      startDate,
      endDate,
      includeOptimization = true,
      includeStaffing = true,
      includeCost = true,
    } = req.query;
    const prisma = req.app.locals.prisma;

    const schedulingService = new SchedulingService(prisma);
    const recommendations = await schedulingService.getShiftRecommendations({
      siteId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      includeOptimization,
      includeStaffing,
      includeCost,
    });

    res.json(recommendations);
  })
);

/**
 * @swagger
 * /scheduling/templates:
 *   get:
 *     summary: Get scheduling templates
 *     description: Get predefined scheduling templates
 *     tags: [Scheduling]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: siteType
 *         schema:
 *           type: string
 *         description: Filter by site type
 *       - in: query
 *         name: shiftType
 *         schema:
 *           type: string
 *         description: Filter by shift type
 *     responses:
 *       200:
 *         description: List of scheduling templates
 */
router.get('/templates',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('siteType').optional().isString(),
    query('shiftType').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const { siteType, shiftType } = req.query;

    // Predefined scheduling templates
    const templates = {
      commercial: {
        '24_7_coverage': {
          id: 'commercial-24-7',
          name: '24/7 Commercial Coverage',
          description: 'Continuous coverage for commercial buildings',
          shifts: [
            { name: 'Day Shift', startHour: 6, duration: 8, agents: 2 },
            { name: 'Evening Shift', startHour: 14, duration: 8, agents: 2 },
            { name: 'Night Shift', startHour: 22, duration: 8, agents: 1 },
          ],
          weeklyHours: 168,
          estimatedCost: 'high',
        },
        'business_hours': {
          id: 'commercial-business',
          name: 'Business Hours Coverage',
          description: 'Coverage during business hours only',
          shifts: [
            { name: 'Morning Shift', startHour: 7, duration: 8, agents: 1 },
            { name: 'Afternoon Shift', startHour: 15, duration: 8, agents: 1 },
          ],
          weeklyHours: 80,
          estimatedCost: 'medium',
        },
      },
      industrial: {
        'continuous_operations': {
          id: 'industrial-continuous',
          name: 'Continuous Industrial Operations',
          description: 'Round-the-clock coverage for industrial facilities',
          shifts: [
            { name: 'Day Shift', startHour: 6, duration: 12, agents: 3 },
            { name: 'Night Shift', startHour: 18, duration: 12, agents: 2 },
          ],
          weeklyHours: 168,
          estimatedCost: 'very_high',
        },
        'maintenance_windows': {
          id: 'industrial-maintenance',
          name: 'Maintenance Window Coverage',
          description: 'Coverage during maintenance periods',
          shifts: [
            { name: 'Maintenance Shift', startHour: 22, duration: 6, agents: 2 },
          ],
          weeklyHours: 42,
          estimatedCost: 'medium',
        },
      },
      retail: {
        'store_hours': {
          id: 'retail-store-hours',
          name: 'Store Hours Coverage',
          description: 'Coverage during store operating hours',
          shifts: [
            { name: 'Opening Shift', startHour: 8, duration: 8, agents: 1 },
            { name: 'Closing Shift', startHour: 16, duration: 6, agents: 1 },
          ],
          weeklyHours: 70,
          estimatedCost: 'low',
        },
      },
    };

    // Filter templates
    let filteredTemplates = templates;
    if (siteType && templates[siteType]) {
      filteredTemplates = { [siteType]: templates[siteType] };
    }

    // Further filter by shift type if specified
    if (shiftType) {
      Object.keys(filteredTemplates).forEach(type => {
        Object.keys(filteredTemplates[type]).forEach(templateKey => {
          const template = filteredTemplates[type][templateKey];
          const hasShiftType = template.shifts.some(shift => 
            shift.name.toLowerCase().includes(shiftType.toLowerCase())
          );
          if (!hasShiftType) {
            delete filteredTemplates[type][templateKey];
          }
        });
      });
    }

    res.json({
      templates: filteredTemplates,
      totalTemplates: Object.values(filteredTemplates)
        .reduce((count, typeTemplates) => count + Object.keys(typeTemplates).length, 0),
      filters: { siteType, shiftType },
    });
  })
);

/**
 * @swagger
 * /scheduling/templates/{templateId}/apply:
 *   post:
 *     summary: Apply scheduling template
 *     description: Apply a predefined scheduling template to a site
 *     tags: [Scheduling]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - siteId
 *               - startDate
 *               - endDate
 *             properties:
 *               siteId:
 *                 type: string
 *                 format: uuid
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               customizations:
 *                 type: object
 *     responses:
 *       201:
 *         description: Template applied successfully
 */
router.post('/templates/:templateId/apply',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('siteId').isUUID().withMessage('Valid site ID is required'),
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
    body('customizations').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { templateId } = req.params;
    const { siteId, startDate, endDate, customizations = {} } = req.body;
    const prisma = req.app.locals.prisma;

    // This would implement template application logic
    // For now, return a placeholder response
    const result = {
      templateId,
      siteId,
      period: { startDate, endDate },
      shiftsCreated: 0,
      message: 'Template application feature coming soon',
    };

    logger.audit('scheduling_template_applied', {
      appliedBy: req.user.id,
      templateId,
      siteId,
      startDate,
      endDate,
    });

    res.status(201).json({
      message: 'Scheduling template applied successfully',
      result,
    });
  })
);

module.exports = router;
