const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize, authorizeOwnerOrRole } = require('../middleware/auth');
const logger = require('../config/logger');
const ReportingSystemService = require('../services/reportingSystem');
const ReportTemplateService = require('../services/reportTemplates');

const router = express.Router();

/**
 * @swagger
 * /reports:
 *   get:
 *     summary: Get reports
 *     description: Retrieve reports based on user permissions
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of reports
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    
    const where = { deletedAt: null };
    
    if (req.user.role === 'AGENT' && req.user.agent) {
      where.agentId = req.user.agent.id;
    }

    const reports = await prisma.report.findMany({
      where,
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
        shift: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
          },
        },
        mediaFiles: {
          select: {
            id: true,
            filename: true,
            fileType: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ reports });
  })
);

/**
 * @swagger
 * /reports:
 *   post:
 *     summary: Create new report
 *     description: Create a new report (Agent only)
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Report created successfully
 */
router.post('/',
  authenticate,
  authorize('AGENT'),
  [
    body('shiftId').isUUID().withMessage('Valid shift ID is required'),
    body('siteId').isUUID().withMessage('Valid site ID is required'),
    body('reportType').isIn(['PATROL', 'INCIDENT', 'INSPECTION', 'MAINTENANCE', 'EMERGENCY']).withMessage('Valid report type is required'),
    body('title').isLength({ min: 1, max: 255 }).withMessage('Title is required'),
    body('content').isObject().withMessage('Content is required'),
    body('observations').optional().isString(),
    body('incidents').optional().isArray(),
    body('weatherConditions').optional().isString(),
    body('equipmentStatus').optional().isString(),
    body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']),
    body('templateId').optional().isString(),
    body('isDraft').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const reportingService = new ReportingSystemService(prisma, io);
    const result = await reportingService.createReport(req.body, req.user.agent.id);

    res.status(201).json(result);
  })
);

/**
 * @swagger
 * /reports/{id}/submit:
 *   post:
 *     summary: Submit report for review
 *     description: Submit a draft report for supervisor review
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Report submitted successfully
 */
router.post('/:id/submit',
  authenticate,
  authorize('AGENT'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    // Verify report belongs to agent
    const report = await prisma.report.findFirst({
      where: {
        id,
        agentId: req.user.agent.id,
        status: 'DRAFT',
        deletedAt: null,
      },
    });

    if (!report) {
      throw new ApiError(404, 'Report not found or cannot be submitted');
    }

    const updatedReport = await prisma.report.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    // Create notification for supervisors
    await prisma.notification.create({
      data: {
        id: uuidv4(),
        recipientId: req.user.id, // Will be updated to notify supervisors
        type: 'INFO',
        title: 'New Report Submitted',
        message: `Report "${report.title}" has been submitted for review`,
        data: {
          reportId: id,
          reportType: report.reportType,
          agentId: req.user.agent.id,
        },
        channels: ['PUSH', 'EMAIL'],
      },
    });

    logger.audit('report_submitted', {
      submittedBy: req.user.id,
      reportId: id,
    });

    res.json({
      message: 'Report submitted successfully',
      report: updatedReport,
    });
  })
);

/**
 * @swagger
 * /reports/{id}/approve:
 *   post:
 *     summary: Approve report
 *     description: Approve a submitted report (Supervisor/Admin only)
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Report approved successfully
 */
router.post('/:id/approve',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('reviewerNotes').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reviewerNotes } = req.body;
    const prisma = req.app.locals.prisma;

    const report = await prisma.report.findUnique({
      where: { id, deletedAt: null },
    });

    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    if (report.status !== 'SUBMITTED' && report.status !== 'UNDER_REVIEW') {
      throw new ApiError(400, 'Report cannot be approved in current status');
    }

    const updatedReport = await prisma.report.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        reviewerNotes,
      },
    });

    logger.audit('report_approved', {
      approvedBy: req.user.id,
      reportId: id,
      reviewerNotes,
    });

    res.json({
      message: 'Report approved successfully',
      report: updatedReport,
    });
  })
);

/**
 * @swagger
 * /reports/{id}/submit:
 *   post:
 *     summary: Submit report for review
 *     description: Submit a draft report for supervisor review with validation
 *     tags: [Reports]
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               finalReview:
 *                 type: boolean
 *                 default: false
 *               clientNotification:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Report submitted successfully
 */
router.post('/:id/submit',
  authenticate,
  authorize('AGENT'),
  [
    body('finalReview').optional().isBoolean(),
    body('clientNotification').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const reportingService = new ReportingSystemService(prisma, io);
    const result = await reportingService.submitReport(id, req.user.agent.id, req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  })
);

/**
 * @swagger
 * /reports/{id}/review:
 *   post:
 *     summary: Review report
 *     description: Review and approve/reject a submitted report
 *     tags: [Reports]
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
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [APPROVE, REJECT, REQUEST_CHANGES]
 *               reviewerNotes:
 *                 type: string
 *               clientApprovalRequired:
 *                 type: boolean
 *                 default: false
 *               scheduledDelivery:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Report reviewed successfully
 */
router.post('/:id/review',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('action').isIn(['APPROVE', 'REJECT', 'REQUEST_CHANGES']).withMessage('Valid action is required'),
    body('reviewerNotes').optional().isString(),
    body('clientApprovalRequired').optional().isBoolean(),
    body('scheduledDelivery').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const reportingService = new ReportingSystemService(prisma, io);
    const result = await reportingService.reviewReport(id, req.body, req.user.id);

    res.json(result);
  })
);

/**
 * @swagger
 * /reports/{id}/signature:
 *   post:
 *     summary: Process client signature
 *     description: Handle client signature and approval for reports
 *     tags: [Reports]
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
 *               - clientSignature
 *             properties:
 *               clientSignature:
 *                 type: string
 *                 description: Base64 encoded signature image
 *               clientFeedback:
 *                 type: string
 *               clientApproval:
 *                 type: boolean
 *                 default: true
 *               signedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Client signature processed successfully
 */
router.post('/:id/signature',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'CLIENT'),
  [
    body('clientSignature').isString().withMessage('Client signature is required'),
    body('clientFeedback').optional().isString(),
    body('clientApproval').optional().isBoolean(),
    body('signedAt').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const reportingService = new ReportingSystemService(prisma, io);
    const result = await reportingService.processClientSignature(id, req.body, req.user.id);

    res.json(result);
  })
);

/**
 * @swagger
 * /reports/analytics:
 *   get:
 *     summary: Get report analytics
 *     description: Get comprehensive report analytics and insights
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         name: siteId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: agentId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Report analytics data
 */
router.get('/analytics',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('siteId').optional().isUUID(),
    query('agentId').optional().isUUID(),
    query('reportType').optional().isString(),
    query('clientId').optional().isUUID(),
  ],
  asyncHandler(async (req, res) => {
    const filters = {
      ...req.query,
      startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
    };

    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const reportingService = new ReportingSystemService(prisma, io);
    const analytics = await reportingService.generateReportAnalytics(filters);

    res.json(analytics);
  })
);

/**
 * @swagger
 * /reports/templates:
 *   get:
 *     summary: Get report templates
 *     description: Get available report templates for a report type
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: siteId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: includePublic
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: List of available report templates
 */
router.get('/templates',
  authenticate,
  [
    query('reportType').optional().isString(),
    query('clientId').optional().isUUID(),
    query('siteId').optional().isUUID(),
    query('includePublic').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const { reportType, clientId, siteId, includePublic = true } = req.query;
    const prisma = req.app.locals.prisma;

    const templateService = new ReportTemplateService(prisma);
    const result = await templateService.getTemplatesForReportType(reportType, {
      clientId,
      siteId,
      includePublic,
    });

    res.json(result);
  })
);

/**
 * @swagger
 * /reports/{id}/client-signature:
 *   post:
 *     summary: Submit client signature for report
 *     description: Submit client signature to approve or reject a report
 *     tags: [Reports]
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
 *               - signature
 *               - signedBy
 *               - approved
 *             properties:
 *               signature:
 *                 type: string
 *                 description: Base64 encoded signature image
 *               signedBy:
 *                 type: string
 *                 description: Name of the person signing
 *               feedback:
 *                 type: string
 *                 description: Optional feedback or comments
 *               approved:
 *                 type: boolean
 *                 description: Whether the report is approved or rejected
 *     responses:
 *       200:
 *         description: Signature submitted successfully
 */
router.post('/:id/client-signature',
  authenticate,
  authorize('CLIENT'),
  [
    body('signature').notEmpty().withMessage('Signature is required'),
    body('signedBy').notEmpty().withMessage('Signer name is required'),
    body('approved').isBoolean().withMessage('Approval status is required'),
    body('feedback').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const { signature, signedBy, feedback, approved } = req.body;
    const prisma = req.app.locals.prisma;

    // Verify report exists and client has access
    const report = await prisma.report.findFirst({
      where: {
        id,
        shift: {
          site: {
            clientId: req.user.clientId,
          },
        },
        status: { in: ['APPROVED', 'DELIVERED'] },
        deletedAt: null,
      },
      include: {
        shift: {
          include: {
            site: {
              include: {
                client: true,
              },
            },
          },
        },
      },
    });

    if (!report) {
      throw new ApiError(404, 'Report not found or access denied');
    }

    if (report.clientSignature) {
      throw new ApiError(400, 'Report has already been signed');
    }

    // Process signature using delivery service
    const ReportDeliveryService = require('../services/reportDelivery');
    const deliveryService = new ReportDeliveryService(prisma, req.app.locals.emailService);

    const result = await deliveryService.processClientSignature(id, {
      signature,
      signedBy,
      feedback,
      approved,
    });

    logger.audit('client_signature_submitted', {
      submittedBy: req.user.id,
      reportId: id,
      signedBy,
      approved,
      hasFeedback: !!feedback,
    });

    res.json({
      message: `Report ${approved ? 'approved' : 'rejected'} successfully`,
      report: result.report,
      signature: {
        signedBy,
        signedAt: new Date(),
        approved,
      },
    });
  })
);

/**
 * @swagger
 * /reports/{id}/delivery:
 *   post:
 *     summary: Schedule report delivery
 *     description: Schedule delivery of an approved report to the client
 *     tags: [Reports]
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scheduledTime:
 *                 type: string
 *                 format: date-time
 *                 description: When to deliver the report (defaults to immediate)
 *               deliveryMethod:
 *                 type: string
 *                 enum: [EMAIL, PORTAL]
 *                 default: EMAIL
 *     responses:
 *       200:
 *         description: Delivery scheduled successfully
 */
router.post('/:id/delivery',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('scheduledTime').optional().isISO8601(),
    body('deliveryMethod').optional().isIn(['EMAIL', 'PORTAL']),
  ],
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { scheduledTime, deliveryMethod = 'EMAIL' } = req.body;
    const prisma = req.app.locals.prisma;

    const report = await prisma.report.findUnique({
      where: { id, deletedAt: null },
      include: {
        shift: {
          include: {
            site: {
              include: {
                client: true,
              },
            },
          },
        },
      },
    });

    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    if (report.status !== 'APPROVED') {
      throw new ApiError(400, 'Report must be approved before delivery');
    }

    // Schedule delivery using delivery service
    const ReportDeliveryService = require('../services/reportDelivery');
    const deliveryService = new ReportDeliveryService(prisma, req.app.locals.emailService);

    const delivery = await deliveryService.scheduleClientDelivery(report, scheduledTime);

    logger.audit('report_delivery_scheduled', {
      scheduledBy: req.user.id,
      reportId: id,
      deliveryId: delivery.id,
      scheduledTime: scheduledTime || 'immediate',
    });

    res.json({
      message: 'Report delivery scheduled successfully',
      delivery: {
        id: delivery.id,
        scheduledAt: delivery.scheduledAt,
        status: delivery.status,
        deliveryMethod: delivery.deliveryMethod,
      },
    });
  })
);

/**
 * @swagger
 * /reports/{id}/delivery-status:
 *   get:
 *     summary: Get report delivery status
 *     description: Get the delivery status and history for a report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Delivery status retrieved successfully
 */
router.get('/:id/delivery-status',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'CLIENT'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    // Verify access
    const whereClause = { id, deletedAt: null };
    if (req.user.role === 'CLIENT') {
      whereClause.shift = {
        site: {
          clientId: req.user.clientId,
        },
      };
    }

    const report = await prisma.report.findFirst({
      where: whereClause,
    });

    if (!report) {
      throw new ApiError(404, 'Report not found or access denied');
    }

    // Get delivery status
    const ReportDeliveryService = require('../services/reportDelivery');
    const deliveryService = new ReportDeliveryService(prisma, req.app.locals.emailService);

    const deliveries = await deliveryService.getDeliveryStatus(id);

    res.json({
      message: 'Delivery status retrieved successfully',
      reportId: id,
      deliveries,
    });
  })
);

/**
 * @swagger
 * /reports/bulk/approve:
 *   post:
 *     summary: Bulk approve reports
 *     description: Approve multiple reports at once (Admin/Supervisor only)
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportIds
 *             properties:
 *               reportIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               reviewerNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reports approved successfully
 */
router.post('/bulk/approve',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('reportIds').isArray().withMessage('Report IDs must be an array'),
    body('reportIds.*').isUUID().withMessage('Each report ID must be a valid UUID'),
    body('reviewerNotes').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { reportIds, reviewerNotes } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (reportIds.length === 0) {
      throw new ApiError(400, 'At least one report ID is required');
    }

    if (reportIds.length > 50) {
      throw new ApiError(400, 'Cannot approve more than 50 reports at once');
    }

    const reportingService = new ReportingSystemService(prisma, io);
    const result = await reportingService.bulkApproveReports(reportIds, req.user.id, reviewerNotes);

    res.json({
      success: true,
      message: `Successfully approved ${result.approvedCount} reports`,
      ...result
    });
  })
);

/**
 * @swagger
 * /reports/templates:
 *   get:
 *     summary: Get report templates
 *     description: Get available report templates
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of report templates
 */
router.get('/templates',
  authenticate,
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    const templateService = new ReportTemplateService(prisma);
    const templates = await templateService.getAvailableTemplates(req.user.role);

    res.json({
      success: true,
      templates
    });
  })
);

/**
 * @swagger
 * /reports/templates:
 *   post:
 *     summary: Create report template
 *     description: Create a new report template (Admin only)
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - reportType
 *               - template
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               reportType:
 *                 type: string
 *                 enum: [PATROL, INCIDENT, INSPECTION, MAINTENANCE, EMERGENCY]
 *               template:
 *                 type: object
 *               isActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Template created successfully
 */
router.post('/templates',
  authenticate,
  authorize('ADMIN'),
  [
    body('name').isLength({ min: 1, max: 255 }).withMessage('Template name is required'),
    body('description').optional().isString(),
    body('reportType').isIn(['PATROL', 'INCIDENT', 'INSPECTION', 'MAINTENANCE', 'EMERGENCY']).withMessage('Valid report type is required'),
    body('template').isObject().withMessage('Template structure is required'),
    body('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const prisma = req.app.locals.prisma;

    const templateService = new ReportTemplateService(prisma);
    const template = await templateService.createTemplate(req.body, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      template
    });
  })
);

/**
 * @swagger
 * /reports/export:
 *   get:
 *     summary: Export reports
 *     description: Export reports in various formats
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, pdf, excel]
 *           default: csv
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
 *         name: siteId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reports exported successfully
 */
router.get('/export',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'CLIENT'),
  [
    query('format').optional().isIn(['csv', 'pdf', 'excel']).withMessage('Invalid export format'),
    query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date is required'),
    query('siteId').optional().isUUID().withMessage('Valid site ID is required'),
    query('reportType').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { format = 'csv', ...filters } = req.query;
    const prisma = req.app.locals.prisma;

    const reportingService = new ReportingSystemService(prisma);
    const result = await reportingService.exportReports(filters, format, req.user);

    // Set appropriate headers based on format
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="reports_export_${new Date().toISOString().split('T')[0]}.csv"`);
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="reports_export_${new Date().toISOString().split('T')[0]}.pdf"`);
    } else if (format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="reports_export_${new Date().toISOString().split('T')[0]}.xlsx"`);
    }

    res.send(result.data);
  })
);

module.exports = router;
