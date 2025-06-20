const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize, authorizeOwnerOrRole } = require('../middleware/auth');
const logger = require('../config/logger');
const SchedulingService = require('../services/scheduling');
const ShiftManagementService = require('../services/shiftManagement');

const router = express.Router();

/**
 * @swagger
 * /shifts:
 *   get:
 *     summary: Get shifts
 *     description: Retrieve shifts based on user permissions
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of shifts
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    
    // Build where clause based on user role
    const where = { deletedAt: null };
    
    if (req.user.role === 'AGENT' && req.user.agent) {
      where.agentId = req.user.agent.id;
    }
    
    const shifts = await prisma.shift.findMany({
      where,
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address: true,
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
      take: 50,
    });

    res.json({ shifts });
  })
);

/**
 * @swagger
 * /shifts/{id}:
 *   get:
 *     summary: Get shift by ID
 *     description: Retrieve a specific shift by ID
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Shift details
 */
router.get('/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    const shift = await prisma.shift.findUnique({
      where: { id, deletedAt: null },
      include: {
        site: true,
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
        attendance: true,
        reports: {
          select: {
            id: true,
            reportType: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!shift) {
      throw new ApiError(404, 'Shift not found');
    }

    // Check access permissions
    if (req.user.role === 'AGENT' && shift.agentId !== req.user.agent?.id) {
      throw new ApiError(403, 'Access denied');
    }

    res.json({ shift });
  })
);

/**
 * @swagger
 * /shifts:
 *   post:
 *     summary: Create new shift
 *     description: Create a new shift (Admin/Supervisor only)
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Shift created successfully
 */
router.post('/',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('siteId').isUUID().withMessage('Valid site ID is required'),
    body('startTime').isISO8601().withMessage('Valid start time is required'),
    body('endTime').isISO8601().withMessage('Valid end time is required'),
    body('agentId').optional().isUUID(),
    body('shiftType').optional().isIn(['REGULAR', 'OVERTIME', 'EMERGENCY', 'TRAINING']),
    body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']),
    body('autoAssign').optional().isBoolean(),
    body('forceCreate').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const shiftManagement = new ShiftManagementService(prisma, io);
    const result = await shiftManagement.createShift(req.body, req.user.id);

    if (!result.success) {
      return res.status(409).json({
        message: result.message,
        conflicts: result.conflicts,
      });
    }

    res.status(201).json({
      message: 'Shift created successfully',
      shift: result.shift,
      conflicts: result.conflicts,
    });
  })
);

/**
 * @swagger
 * /shifts/{id}/status:
 *   patch:
 *     summary: Update shift status
 *     description: Update shift status with proper validation and notifications
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW]
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Shift status updated successfully
 */
router.patch('/:id/status',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  [
    body('status').isIn(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).withMessage('Valid status is required'),
    body('metadata').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const { status, metadata = {} } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const shiftManagement = new ShiftManagementService(prisma, io);
    const result = await shiftManagement.updateShiftStatus(id, status, metadata);

    res.json({
      message: 'Shift status updated successfully',
      shift: result.shift,
      statusChange: result.statusChange,
    });
  })
);

/**
 * @swagger
 * /shifts/{id}/cancel:
 *   post:
 *     summary: Cancel shift
 *     description: Cancel a shift with reason and notifications
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Shift cancelled successfully
 */
router.post('/:id/cancel',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('reason').isLength({ min: 1, max: 500 }).withMessage('Cancellation reason is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const { reason } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const shiftManagement = new ShiftManagementService(prisma, io);
    const result = await shiftManagement.cancelShift(id, reason, req.user.id);

    res.json({
      message: 'Shift cancelled successfully',
      shift: result.shift,
      reason: result.reason,
    });
  })
);

/**
 * @swagger
 * /shifts/schedule/generate:
 *   post:
 *     summary: Generate optimal schedule
 *     description: Generate an optimal shift schedule for a site
 *     tags: [Shifts]
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
 *               requirements:
 *                 type: object
 *     responses:
 *       200:
 *         description: Schedule generated successfully
 */
router.post('/schedule/generate',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('siteId').isUUID().withMessage('Valid site ID is required'),
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
    body('requirements').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { siteId, startDate, endDate, requirements = {} } = req.body;
    const prisma = req.app.locals.prisma;

    const schedulingService = new SchedulingService(prisma);
    const schedule = await schedulingService.generateOptimalSchedule(
      siteId,
      new Date(startDate),
      new Date(endDate),
      requirements
    );

    logger.audit('schedule_generated', {
      generatedBy: req.user.id,
      siteId,
      startDate,
      endDate,
      scheduleMetrics: schedule.metrics,
    });

    res.json({
      message: 'Schedule generated successfully',
      schedule,
    });
  })
);

/**
 * @swagger
 * /shifts/auto-assign:
 *   post:
 *     summary: Auto-assign unassigned shifts
 *     description: Automatically assign agents to unassigned shifts
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
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
 *               criteria:
 *                 type: object
 *     responses:
 *       200:
 *         description: Auto-assignment completed
 */
router.post('/auto-assign',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('siteId').optional().isUUID(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('criteria').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const { siteId, startDate, endDate, criteria = {} } = req.body;
    const prisma = req.app.locals.prisma;

    const schedulingService = new SchedulingService(prisma);
    const result = await schedulingService.autoAssignShifts({
      siteId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      ...criteria,
    });

    logger.audit('shifts_auto_assigned', {
      assignedBy: req.user.id,
      totalShifts: result.totalShifts,
      assignedShifts: result.assignedShifts,
      criteria,
    });

    res.json({
      message: 'Auto-assignment completed',
      result,
    });
  })
);

module.exports = router;
