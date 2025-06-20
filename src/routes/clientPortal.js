const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const ClientPortalService = require('../services/clientPortal');
const logger = require('../config/logger');

const router = express.Router();

/**
 * Get client dashboard data
 * GET /api/client-portal/dashboard
 */
router.get('/dashboard',
  authenticate,
  authorize('CLIENT'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const clientPortalService = new ClientPortalService(prisma, io);
    
    const dashboard = await clientPortalService.getClientDashboard(req.user.client.id);

    res.json({
      success: true,
      dashboard
    });
  })
);

/**
 * Get real-time agent tracking
 * GET /api/client-portal/tracking
 */
router.get('/tracking',
  authenticate,
  authorize('CLIENT'),
  [
    query('siteId').optional().isUUID().withMessage('Invalid site ID')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { siteId } = req.query;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const clientPortalService = new ClientPortalService(prisma, io);
    
    const tracking = await clientPortalService.getAgentTracking(req.user.client.id, siteId);

    res.json({
      success: true,
      tracking
    });
  })
);

/**
 * Get client reports
 * GET /api/client-portal/reports
 */
router.get('/reports',
  authenticate,
  authorize('CLIENT'),
  [
    query('siteId').optional().isUUID().withMessage('Invalid site ID'),
    query('reportType').optional().isIn(['PATROL', 'INCIDENT', 'INSPECTION', 'MAINTENANCE']),
    query('status').optional().isIn(['DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'REJECTED']),
    query('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']),
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'priority', 'status']),
    query('sortOrder').optional().isIn(['asc', 'desc'])
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const filters = req.query;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const clientPortalService = new ClientPortalService(prisma, io);
    
    const reports = await clientPortalService.getClientReports(req.user.client.id, filters);

    res.json({
      success: true,
      ...reports
    });
  })
);

/**
 * Get specific report details
 * GET /api/client-portal/reports/:reportId
 */
router.get('/reports/:reportId',
  authenticate,
  authorize('CLIENT'),
  [
    param('reportId').isUUID().withMessage('Invalid report ID')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { reportId } = req.params;
    const prisma = req.app.locals.prisma;

    // Get client sites to verify access
    const clientSites = await prisma.site.findMany({
      where: { clientId: req.user.client.id, deletedAt: null },
      select: { id: true }
    });

    const siteIds = clientSites.map(site => site.id);

    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        siteId: { in: siteIds },
        deletedAt: null
      },
      include: {
        site: {
          select: { id: true, name: true }
        },
        agent: {
          include: {
            user: {
              select: { username: true, profile: true }
            }
          }
        },
        reviewer: {
          select: { id: true, username: true, profile: true }
        },
        mediaFiles: {
          select: {
            id: true,
            filename: true,
            originalFilename: true,
            fileType: true,
            description: true,
            createdAt: true
          }
        }
      }
    });

    if (!report) {
      throw new ApiError(404, 'Report not found or access denied');
    }

    res.json({
      success: true,
      report
    });
  })
);

/**
 * Submit client request
 * POST /api/client-portal/requests
 */
router.post('/requests',
  authenticate,
  authorize('CLIENT'),
  [
    body('siteId').isUUID().withMessage('Valid site ID is required'),
    body('requestType').isIn(['SERVICE_REQUEST', 'INCIDENT_REPORT', 'SCHEDULE_CHANGE', 'EQUIPMENT_ISSUE', 'GENERAL_INQUIRY']).withMessage('Valid request type is required'),
    body('title').isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
    body('description').isLength({ min: 1, max: 2000 }).withMessage('Description must be between 1 and 2000 characters'),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    body('contactPerson').optional().isLength({ max: 100 }),
    body('preferredResponseTime').optional().isISO8601()
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const requestData = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const clientPortalService = new ClientPortalService(prisma, io);
    
    const request = await clientPortalService.submitClientRequest(req.user.client.id, requestData);

    res.status(201).json({
      success: true,
      message: 'Request submitted successfully',
      request: {
        id: request.id,
        title: request.title,
        requestType: request.requestType,
        priority: request.priority,
        status: request.status,
        createdAt: request.createdAt
      }
    });
  })
);

/**
 * Get client requests
 * GET /api/client-portal/requests
 */
router.get('/requests',
  authenticate,
  authorize('CLIENT'),
  [
    query('status').optional().isIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
    query('requestType').optional().isIn(['SERVICE_REQUEST', 'INCIDENT_REPORT', 'SCHEDULE_CHANGE', 'EQUIPMENT_ISSUE', 'GENERAL_INQUIRY']),
    query('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { status, requestType, priority, page = 1, limit = 20 } = req.query;
    const prisma = req.app.locals.prisma;

    const where = {
      clientId: req.user.client.id,
      deletedAt: null
    };

    if (status) where.status = status;
    if (requestType) where.requestType = requestType;
    if (priority) where.priority = priority;

    const [requests, totalCount] = await Promise.all([
      prisma.clientRequest.findMany({
        where,
        include: {
          site: {
            select: { id: true, name: true }
          },
          assignedTo: {
            select: { id: true, username: true, profile: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit)
      }),
      prisma.clientRequest.count({ where })
    ]);

    res.json({
      success: true,
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  })
);

/**
 * Get site performance metrics
 * GET /api/client-portal/sites/:siteId/metrics
 */
router.get('/sites/:siteId/metrics',
  authenticate,
  authorize('CLIENT'),
  [
    param('siteId').isUUID().withMessage('Invalid site ID'),
    query('period').optional().isIn(['day', 'week', 'month', 'quarter']).withMessage('Invalid period'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { siteId } = req.params;
    const { period = 'month', startDate, endDate } = req.query;
    const prisma = req.app.locals.prisma;

    // Verify site belongs to client
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        clientId: req.user.client.id,
        deletedAt: null
      }
    });

    if (!site) {
      throw new ApiError(404, 'Site not found or access denied');
    }

    // Calculate date range
    let dateRange = {};
    if (startDate && endDate) {
      dateRange = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    } else {
      const now = new Date();
      const periodDays = {
        day: 1,
        week: 7,
        month: 30,
        quarter: 90
      };
      
      dateRange = {
        gte: new Date(now.getTime() - periodDays[period] * 24 * 60 * 60 * 1000),
        lte: now
      };
    }

    // Get metrics
    const [
      totalShifts,
      completedShifts,
      totalReports,
      incidentReports,
      averageResponseTime,
      attendanceRate
    ] = await Promise.all([
      prisma.shift.count({
        where: {
          siteId,
          startTime: dateRange,
          deletedAt: null
        }
      }),
      prisma.shift.count({
        where: {
          siteId,
          status: 'COMPLETED',
          startTime: dateRange,
          deletedAt: null
        }
      }),
      prisma.report.count({
        where: {
          siteId,
          createdAt: dateRange,
          deletedAt: null
        }
      }),
      prisma.report.count({
        where: {
          siteId,
          reportType: 'INCIDENT',
          createdAt: dateRange,
          deletedAt: null
        }
      }),
      // Calculate average response time for incidents
      prisma.report.aggregate({
        where: {
          siteId,
          reportType: 'INCIDENT',
          createdAt: dateRange,
          deletedAt: null,
          submittedAt: { not: null },
          reviewedAt: { not: null }
        },
        _avg: {
          // This would need a computed field for response time
          // For now, we'll return null
        }
      }),
      // Calculate attendance rate
      prisma.attendance.aggregate({
        where: {
          shift: {
            siteId,
            startTime: dateRange
          }
        },
        _avg: {
          totalHours: true
        }
      })
    ]);

    const metrics = {
      site: {
        id: site.id,
        name: site.name
      },
      period: {
        type: period,
        startDate: dateRange.gte,
        endDate: dateRange.lte
      },
      shifts: {
        total: totalShifts,
        completed: completedShifts,
        completionRate: totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0
      },
      reports: {
        total: totalReports,
        incidents: incidentReports,
        incidentRate: totalReports > 0 ? Math.round((incidentReports / totalReports) * 100) : 0
      },
      performance: {
        averageResponseTime: null, // Would need to implement response time calculation
        attendanceRate: attendanceRate._avg.totalHours || 0
      }
    };

    res.json({
      success: true,
      metrics
    });
  })
);

module.exports = router;
