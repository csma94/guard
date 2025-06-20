const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const AdminToolsService = require('../services/adminTools');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /admin/overview:
 *   get:
 *     summary: Get system overview
 *     description: Get comprehensive system overview and health metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System overview retrieved successfully
 */
router.get('/overview',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const adminService = new AdminToolsService(prisma, io);
    const overview = await adminService.getSystemOverview();

    res.json({
      success: true,
      overview
    });
  })
);

/**
 * @swagger
 * /admin/users/bulk:
 *   post:
 *     summary: Bulk user operations
 *     description: Perform bulk operations on multiple users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operation
 *               - userIds
 *             properties:
 *               operation:
 *                 type: string
 *                 enum: [ACTIVATE, DEACTIVATE, RESET_PASSWORD, UPDATE_ROLE, DELETE]
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               operationData:
 *                 type: object
 *                 properties:
 *                   reason:
 *                     type: string
 *                   newRole:
 *                     type: string
 *                     enum: [ADMIN, SUPERVISOR, AGENT, CLIENT]
 *     responses:
 *       200:
 *         description: Bulk operation completed
 */
router.post('/users/bulk',
  authenticate,
  authorize('ADMIN'),
  [
    body('operation').isIn(['ACTIVATE', 'DEACTIVATE', 'RESET_PASSWORD', 'UPDATE_ROLE', 'DELETE']).withMessage('Valid operation is required'),
    body('userIds').isArray().withMessage('User IDs must be an array'),
    body('userIds.*').isUUID().withMessage('Each user ID must be a valid UUID'),
    body('operationData').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { operation, userIds, operationData = {} } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (userIds.length === 0) {
      throw new ApiError(400, 'At least one user ID is required');
    }

    if (userIds.length > 100) {
      throw new ApiError(400, 'Cannot process more than 100 users at once');
    }

    const adminService = new AdminToolsService(prisma, io);
    const results = await adminService.bulkUserOperations(operation, userIds, operationData, req.user.id);

    res.json({
      success: true,
      message: `Bulk ${operation.toLowerCase()} operation completed`,
      results
    });
  })
);

/**
 * @swagger
 * /admin/config:
 *   get:
 *     summary: Get system configuration
 *     description: Get current system configuration
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System configuration retrieved
 */
router.get('/config',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    const config = await prisma.systemConfiguration.findUnique({
      where: { key: 'SYSTEM_CONFIG' }
    });

    res.json({
      success: true,
      configuration: config?.value || {},
      lastUpdated: config?.updatedAt
    });
  })
);

/**
 * @swagger
 * /admin/config:
 *   put:
 *     summary: Update system configuration
 *     description: Update system configuration settings
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maintenanceMode:
 *                 type: boolean
 *               allowRegistration:
 *                 type: boolean
 *               maxFileSize:
 *                 type: integer
 *               sessionTimeout:
 *                 type: integer
 *               passwordPolicy:
 *                 type: object
 *               notificationSettings:
 *                 type: object
 *               securitySettings:
 *                 type: object
 *               featureFlags:
 *                 type: object
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 */
router.put('/config',
  authenticate,
  authorize('ADMIN'),
  [
    body('maintenanceMode').optional().isBoolean(),
    body('allowRegistration').optional().isBoolean(),
    body('maxFileSize').optional().isInt({ min: 1024, max: 100 * 1024 * 1024 }),
    body('sessionTimeout').optional().isInt({ min: 300000, max: 7 * 24 * 60 * 60 * 1000 }),
    body('passwordPolicy').optional().isObject(),
    body('notificationSettings').optional().isObject(),
    body('securitySettings').optional().isObject(),
    body('featureFlags').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const adminService = new AdminToolsService(prisma, io);
    const result = await adminService.updateSystemConfiguration(req.body, req.user.id);

    res.json(result);
  })
);

/**
 * @swagger
 * /admin/reports:
 *   post:
 *     summary: Generate system report
 *     description: Generate various system reports
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportType
 *             properties:
 *               reportType:
 *                 type: string
 *                 enum: [USER_ACTIVITY, SYSTEM_PERFORMANCE, SECURITY_AUDIT, STORAGE_USAGE, ERROR_ANALYSIS]
 *               parameters:
 *                 type: object
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date
 *                   endDate:
 *                     type: string
 *                     format: date
 *                   format:
 *                     type: string
 *                     enum: [JSON, CSV, PDF]
 *                     default: JSON
 *     responses:
 *       200:
 *         description: Report generated successfully
 */
router.post('/reports',
  authenticate,
  authorize('ADMIN'),
  [
    body('reportType').isIn(['USER_ACTIVITY', 'SYSTEM_PERFORMANCE', 'SECURITY_AUDIT', 'STORAGE_USAGE', 'ERROR_ANALYSIS']).withMessage('Valid report type is required'),
    body('parameters').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { reportType, parameters = {} } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const adminService = new AdminToolsService(prisma, io);
    const report = await adminService.generateSystemReport(reportType, parameters);

    // Log report generation
    logger.audit('system_report_generated', {
      reportType,
      generatedBy: req.user.id,
      parameters
    });

    res.json({
      success: true,
      report
    });
  })
);

/**
 * @swagger
 * /admin/alerts:
 *   get:
 *     summary: Get system alerts
 *     description: Get current system alerts and notifications
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [CRITICAL, HIGH, MEDIUM, LOW]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: System alerts retrieved
 */
router.get('/alerts',
  authenticate,
  authorize('ADMIN'),
  [
    query('severity').optional().isIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
    query('limit').optional().isInt({ min: 1, max: 500 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { severity, limit = 100 } = req.query;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const adminService = new AdminToolsService(prisma, io);
    const alerts = await adminService.getSystemAlerts(severity, parseInt(limit));

    res.json({
      success: true,
      alerts
    });
  })
);

/**
 * @swagger
 * /admin/maintenance:
 *   post:
 *     summary: Perform database maintenance
 *     description: Perform various database maintenance operations
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operations
 *             properties:
 *               operations:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [CLEANUP_LOGS, OPTIMIZE_TABLES, UPDATE_STATISTICS, CLEANUP_FILES, VACUUM_DATABASE]
 *     responses:
 *       200:
 *         description: Maintenance operations completed
 */
router.post('/maintenance',
  authenticate,
  authorize('ADMIN'),
  [
    body('operations').isArray().withMessage('Operations must be an array'),
    body('operations.*').isIn(['CLEANUP_LOGS', 'OPTIMIZE_TABLES', 'UPDATE_STATISTICS', 'CLEANUP_FILES', 'VACUUM_DATABASE']).withMessage('Invalid operation'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { operations } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (operations.length === 0) {
      throw new ApiError(400, 'At least one operation is required');
    }

    const adminService = new AdminToolsService(prisma, io);
    const results = await adminService.performDatabaseMaintenance(operations, req.user.id);

    res.json({
      success: true,
      message: 'Database maintenance completed',
      results
    });
  })
);

/**
 * @swagger
 * /admin/activity:
 *   get:
 *     summary: Get recent system activity
 *     description: Get recent system activity and audit logs
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *     responses:
 *       200:
 *         description: Recent activity retrieved
 */
router.get('/activity',
  authenticate,
  authorize('ADMIN'),
  [
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { limit = 50 } = req.query;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const adminService = new AdminToolsService(prisma, io);
    const activity = await adminService.getRecentActivity(parseInt(limit));

    res.json({
      success: true,
      activity,
      total: activity.length
    });
  })
);

module.exports = router;
