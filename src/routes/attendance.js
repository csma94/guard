const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const AttendanceService = require('../services/attendance');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /attendance/clock-in:
 *   post:
 *     summary: Clock in for shift
 *     description: Record clock-in time and location for an agent
 *     tags: [Attendance]
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
 *               - location
 *             properties:
 *               shiftId:
 *                 type: string
 *                 format: uuid
 *               location:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 *                   accuracy:
 *                     type: number
 *               method:
 *                 type: string
 *                 enum: [GPS, QR_CODE, MANUAL, NFC]
 *               qrCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Clock-in successful
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 */
router.post('/clock-in',
  authenticate,
  authorize('AGENT'),
  [
    body('shiftId').isUUID().withMessage('Valid shift ID is required'),
    body('location.latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('location.longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    body('location.accuracy').optional().isFloat({ min: 0 }),
    body('method').optional().isIn(['GPS', 'QR_CODE', 'MANUAL', 'NFC']),
    body('qrCode').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { shiftId, location, method = 'GPS', qrCode, notes } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can clock in');
    }

    const attendanceService = new AttendanceService(prisma, io);

    try {
      const result = await attendanceService.clockIn(req.user.agent.id, shiftId, {
        location,
        method,
        qrData: qrCode,
        deviceInfo: {
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip
        },
        notes
      });

      logger.audit('clock_in', {
        agentId: req.user.agent.id,
        shiftId,
        method,
        success: true,
        attendanceId: result.attendance.id
      });

      res.json({
        success: true,
        message: 'Clock-in successful',
        attendance: result.attendance,
        shift: result.shift
      });

    } catch (error) {
      logger.audit('clock_in', {
        agentId: req.user.agent.id,
        shiftId,
        method,
        success: false,
        error: error.message
      });

      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /attendance/clock-out:
 *   post:
 *     summary: Clock out from shift
 *     description: Record clock-out time and calculate total hours
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Clock-out successful
 */
router.post('/clock-out',
  authenticate,
  authorize('AGENT'),
  [
    body('shiftId').isUUID().withMessage('Valid shift ID is required'),
    body('location.latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('location.longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    body('method').optional().isIn(['GPS', 'QR_CODE', 'MANUAL', 'NFC']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { shiftId, location, method = 'GPS', qrCode, notes } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can clock out');
    }

    const attendanceService = new AttendanceService(prisma, io);

    try {
      const result = await attendanceService.clockOut(req.user.agent.id, shiftId, {
        location,
        method,
        qrData: qrCode,
        deviceInfo: {
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip
        },
        notes
      });

      logger.audit('clock_out', {
        agentId: req.user.agent.id,
        shiftId,
        method,
        success: true,
        totalHours: result.attendance.totalHours,
        overtimeHours: result.attendance.overtimeHours,
        attendanceId: result.attendance.id
      });

      res.json({
        success: true,
        message: 'Clock-out successful',
        attendance: result.attendance,
        shift: result.shift
      });

    } catch (error) {
      logger.audit('clock_out', {
        agentId: req.user.agent.id,
        shiftId,
        method,
        success: false,
        error: error.message
      });

      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /attendance:
 *   get:
 *     summary: Get attendance records
 *     description: Retrieve attendance records based on user permissions
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of attendance records
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    
    const where = {};
    
    if (req.user.role === 'AGENT' && req.user.agent) {
      where.agentId = req.user.agent.id;
    }

    const attendance = await prisma.attendance.findMany({
      where,
      include: {
        shift: {
          include: {
            site: {
              select: {
                id: true,
                name: true,
              },
            },
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
      orderBy: { clockInTime: 'desc' },
      take: 50,
    });

    res.json({ attendance });
  })
);

/**
 * @swagger
 * /attendance/break/start:
 *   post:
 *     summary: Start break
 *     description: Record break start time for an agent
 *     tags: [Attendance]
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
 *               - breakType
 *             properties:
 *               shiftId:
 *                 type: string
 *                 format: uuid
 *               breakType:
 *                 type: string
 *                 enum: [LUNCH, SHORT, EMERGENCY, PERSONAL]
 *               location:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 *     responses:
 *       200:
 *         description: Break started successfully
 */
router.post('/break/start',
  authenticate,
  authorize('AGENT'),
  [
    body('shiftId').isUUID().withMessage('Valid shift ID is required'),
    body('breakType').isIn(['LUNCH', 'SHORT', 'EMERGENCY', 'PERSONAL']).withMessage('Valid break type is required'),
    body('location.latitude').optional().isFloat({ min: -90, max: 90 }),
    body('location.longitude').optional().isFloat({ min: -180, max: 180 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { shiftId, breakType, location, notes } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can start breaks');
    }

    const attendanceService = new AttendanceService(prisma, io);

    try {
      const result = await attendanceService.startBreak(req.user.agent.id, shiftId, {
        breakType,
        location,
        notes
      });

      res.json({
        success: true,
        message: 'Break started successfully',
        break: result.break,
        attendance: result.attendance
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /attendance/break/end:
 *   post:
 *     summary: End break
 *     description: Record break end time and calculate break duration
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - breakId
 *             properties:
 *               breakId:
 *                 type: string
 *                 format: uuid
 *               location:
 *                 type: object
 *     responses:
 *       200:
 *         description: Break ended successfully
 */
router.post('/break/end',
  authenticate,
  authorize('AGENT'),
  [
    body('breakId').isUUID().withMessage('Valid break ID is required'),
    body('location.latitude').optional().isFloat({ min: -90, max: 90 }),
    body('location.longitude').optional().isFloat({ min: -180, max: 180 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { breakId, location, notes } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can end breaks');
    }

    const attendanceService = new AttendanceService(prisma, io);

    try {
      const result = await attendanceService.endBreak(req.user.agent.id, breakId, {
        location,
        notes
      });

      res.json({
        success: true,
        message: 'Break ended successfully',
        break: result.break,
        attendance: result.attendance
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /attendance/analytics:
 *   get:
 *     summary: Get attendance analytics
 *     description: Retrieve attendance analytics and metrics
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: agentId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Attendance analytics data
 */
router.get('/analytics',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date is required'),
    query('agentId').optional().isUUID().withMessage('Valid agent ID is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { startDate, endDate, agentId } = req.query;
    const prisma = req.app.locals.prisma;

    const attendanceService = new AttendanceService(prisma);
    const analytics = await attendanceService.generateAttendanceAnalytics({
      startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate) : new Date(),
      agentId,
      requestedBy: req.user.id
    });

    res.json({
      success: true,
      analytics
    });
  })
);

module.exports = router;
