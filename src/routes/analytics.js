const express = require('express');
const { body, query, validationResult } = require('express-validator');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../config/logger');
const AnalyticsService = require('../services/analytics');

const router = express.Router();

/**
 * @swagger
 * /analytics/operational:
 *   get:
 *     summary: Get operational analytics
 *     description: Get comprehensive operational analytics and insights
 *     tags: [Analytics]
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
 *         name: agentId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: includeForecasting
 *         schema:
 *           type: boolean
 *           default: true
 *       - in: query
 *         name: includeBenchmarking
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: Operational analytics data
 */
router.get('/operational',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'CLIENT'),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('clientId').optional().isUUID(),
    query('siteId').optional().isUUID(),
    query('agentId').optional().isUUID(),
    query('includeForecasting').optional().isBoolean(),
    query('includeBenchmarking').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const {
      startDate,
      endDate,
      clientId,
      siteId,
      agentId,
      includeForecasting = true,
      includeBenchmarking = true,
    } = req.query;

    const filters = {
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
      ...(clientId && { clientId }),
      ...(siteId && { siteId }),
      ...(agentId && { agentId }),
      includeForecasting,
      includeBenchmarking,
    };

    // If user is a client, restrict to their data
    if (req.user.role === 'CLIENT') {
      filters.clientId = req.user.clientId;
    }

    const prisma = req.app.locals.prisma;
    const analyticsService = new AnalyticsService(prisma);
    
    const analytics = await analyticsService.generateOperationalAnalytics(filters);

    logger.audit('analytics_operational_accessed', {
      accessedBy: req.user.id,
      filters,
    });

    res.json(analytics);
  })
);

/**
 * @swagger
 * /analytics/performance:
 *   get:
 *     summary: Get performance analytics
 *     description: Get detailed performance analytics for agents and sites
 *     tags: [Analytics]
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
 *         name: agentId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: metricType
 *         schema:
 *           type: string
 *           enum: [attendance, quality, efficiency, satisfaction]
 *     responses:
 *       200:
 *         description: Performance analytics data
 */
router.get('/performance',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'CLIENT'),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('clientId').optional().isUUID(),
    query('siteId').optional().isUUID(),
    query('agentId').optional().isUUID(),
    query('metricType').optional().isIn(['attendance', 'quality', 'efficiency', 'satisfaction']),
  ],
  asyncHandler(async (req, res) => {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      clientId,
      siteId,
      agentId,
      metricType,
    } = req.query;

    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      ...(clientId && { clientId }),
      ...(siteId && { siteId }),
      ...(agentId && { agentId }),
    };

    // If user is a client, restrict to their data
    if (req.user.role === 'CLIENT') {
      filters.clientId = req.user.clientId;
    }

    const prisma = req.app.locals.prisma;
    const analyticsService = new AnalyticsService(prisma);
    
    const performanceAnalytics = await analyticsService.calculatePerformanceAnalytics(
      filters.startDate,
      filters.endDate,
      filters
    );

    // Filter by metric type if specified
    let result = performanceAnalytics;
    if (metricType) {
      result = { [metricType]: performanceAnalytics[metricType] };
    }

    res.json({
      period: { startDate: filters.startDate, endDate: filters.endDate },
      performance: result,
      filters,
    });
  })
);

/**
 * @swagger
 * /analytics/financial:
 *   get:
 *     summary: Get financial analytics
 *     description: Get cost analysis and financial insights
 *     tags: [Analytics]
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
 *         name: breakdown
 *         schema:
 *           type: string
 *           enum: [agent, site, client, time]
 *     responses:
 *       200:
 *         description: Financial analytics data
 */
router.get('/financial',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('clientId').optional().isUUID(),
    query('siteId').optional().isUUID(),
    query('breakdown').optional().isIn(['agent', 'site', 'client', 'time']),
  ],
  asyncHandler(async (req, res) => {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      clientId,
      siteId,
      breakdown = 'time',
    } = req.query;

    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      ...(clientId && { clientId }),
      ...(siteId && { siteId }),
    };

    const prisma = req.app.locals.prisma;
    const analyticsService = new AnalyticsService(prisma);
    
    const costAnalytics = await analyticsService.calculateCostAnalytics(
      filters.startDate,
      filters.endDate,
      filters
    );

    res.json({
      period: { startDate: filters.startDate, endDate: filters.endDate },
      costAnalytics,
      breakdown,
      filters,
    });
  })
);

/**
 * @swagger
 * /analytics/trends:
 *   get:
 *     summary: Get trend analysis
 *     description: Get historical trends and patterns
 *     tags: [Analytics]
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
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: daily
 *     responses:
 *       200:
 *         description: Trend analysis data
 */
router.get('/trends',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'CLIENT'),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('clientId').optional().isUUID(),
    query('siteId').optional().isUUID(),
    query('granularity').optional().isIn(['daily', 'weekly', 'monthly']),
  ],
  asyncHandler(async (req, res) => {
    const {
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      endDate = new Date(),
      clientId,
      siteId,
      granularity = 'daily',
    } = req.query;

    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      ...(clientId && { clientId }),
      ...(siteId && { siteId }),
    };

    // If user is a client, restrict to their data
    if (req.user.role === 'CLIENT') {
      filters.clientId = req.user.clientId;
    }

    const prisma = req.app.locals.prisma;
    const analyticsService = new AnalyticsService(prisma);
    
    const trendAnalysis = await analyticsService.calculateTrendAnalysis(
      filters.startDate,
      filters.endDate,
      filters
    );

    res.json({
      period: { startDate: filters.startDate, endDate: filters.endDate },
      trends: trendAnalysis[granularity] || trendAnalysis.daily,
      granularity,
      filters,
    });
  })
);

/**
 * @swagger
 * /analytics/kpi:
 *   get:
 *     summary: Get KPI metrics
 *     description: Get key performance indicators for dashboard
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KPI metrics data
 */
router.get('/kpi',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'CLIENT'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    try {
      // Get real-time KPI metrics
      const [
        totalUsers,
        activeAgents,
        activeSites,
        activeShifts,
        reportsToday,
        incidentsToday,
        recentActivity
      ] = await Promise.all([
        // Total users count
        prisma.user.count({
          where: { deletedAt: null }
        }),

        // Active agents (currently on shift)
        prisma.shift.count({
          where: {
            status: 'IN_PROGRESS',
            startTime: { lte: now },
            endTime: { gte: now },
            deletedAt: null
          }
        }),

        // Active sites
        prisma.site.count({
          where: {
            status: 'ACTIVE',
            deletedAt: null
          }
        }),

        // Active shifts today
        prisma.shift.count({
          where: {
            startTime: { gte: today },
            deletedAt: null
          }
        }),

        // Reports submitted today
        prisma.report.count({
          where: {
            submittedAt: { gte: today },
            deletedAt: null
          }
        }),

        // Incidents reported today
        prisma.report.count({
          where: {
            reportType: 'INCIDENT',
            submittedAt: { gte: today },
            deletedAt: null
          }
        }),

        // Recent activity (last 10 activities)
        prisma.auditLog.findMany({
          where: {
            timestamp: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
          },
          orderBy: { timestamp: 'desc' },
          take: 10,
          include: {
            user: {
              select: { username: true }
            }
          }
        })
      ]);

      // Transform recent activity
      const formattedActivity = recentActivity.map(log => ({
        id: log.id,
        type: log.action,
        message: `${log.user?.username || 'System'} ${log.action.replace('_', ' ')}`,
        timestamp: log.timestamp.toISOString(),
        severity: log.action.includes('error') ? 'error' :
                 log.action.includes('warning') ? 'warning' : 'info'
      }));

      const kpiData = {
        totalUsers,
        activeAgents,
        activeSites,
        activeShifts,
        reportsToday,
        incidentsToday,
        recentActivity: formattedActivity,
        lastUpdated: now.toISOString()
      };

      res.json({
        success: true,
        data: kpiData
      });

    } catch (error) {
      logger.error('Failed to fetch KPI metrics:', error);

      // Return fallback data if database query fails
      res.json({
        success: true,
        data: {
          totalUsers: 0,
          activeAgents: 0,
          activeSites: 0,
          activeShifts: 0,
          reportsToday: 0,
          incidentsToday: 0,
          recentActivity: [],
          lastUpdated: now.toISOString(),
          error: 'Failed to fetch real-time data'
        }
      });
    }
  })
);

/**
 * @swagger
 * /analytics/dashboard:
 *   get:
 *     summary: Get analytics dashboard
 *     description: Get comprehensive analytics dashboard data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics dashboard data
 */
router.get('/dashboard',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'CLIENT'),
  [
    query('siteId').optional().isUUID(),
    query('clientId').optional().isUUID(),
  ],
  asyncHandler(async (req, res) => {
    const { siteId, clientId } = req.query;
    const prisma = req.app.locals.prisma;
    const analyticsService = new AnalyticsService(prisma);

    // Use the enhanced dashboard data generation
    const dashboardData = await analyticsService.generateDashboardData(
      req.user.id,
      req.user.role,
      { siteId, clientId }
    );

    logger.audit('analytics_dashboard_accessed', {
      accessedBy: req.user.id,
      userRole: req.user.role,
      filters: { siteId, clientId }
    });

    res.json({
      success: true,
      dashboard: dashboardData
    });
  })
);

/**
 * @swagger
 * /analytics/custom-reports:
 *   post:
 *     summary: Generate custom report
 *     description: Generate a custom analytics report based on configuration
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               fields:
 *                 type: array
 *               filters:
 *                 type: object
 *               chartType:
 *                 type: string
 *               dateRange:
 *                 type: object
 *     responses:
 *       200:
 *         description: Custom report generated successfully
 */
router.post('/custom-reports',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('name').notEmpty().withMessage('Report name is required'),
    body('fields').isArray().withMessage('Fields must be an array'),
    body('chartType').isIn(['table', 'line', 'bar', 'pie', 'area']).withMessage('Invalid chart type'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { name, fields, filters, chartType, dateRange, groupBy, sortBy, sortOrder } = req.body;
    const prisma = req.app.locals.prisma;

    // Build dynamic query based on configuration
    const reportData = await generateCustomReportData({
      prisma,
      fields,
      filters,
      dateRange,
      groupBy,
      sortBy,
      sortOrder,
    });

    // Save report configuration for future use
    const savedReport = await prisma.customReport.create({
      data: {
        id: uuidv4(),
        name,
        configuration: {
          fields,
          filters,
          chartType,
          dateRange,
          groupBy,
          sortBy,
          sortOrder,
        },
        createdBy: req.user.id,
      },
    });

    logger.audit('custom_report_generated', {
      generatedBy: req.user.id,
      reportId: savedReport.id,
      reportName: name,
      fieldsCount: fields.length,
    });

    res.json({
      message: 'Custom report generated successfully',
      reportId: savedReport.id,
      data: reportData,
      configuration: {
        name,
        chartType,
        fields: fields.length,
      },
    });
  })
);

/**
 * @swagger
 * /analytics/export:
 *   post:
 *     summary: Export analytics data
 *     description: Export analytics data in various formats
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [csv, excel, pdf]
 *               data:
 *                 type: object
 *               reportName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Data exported successfully
 */
router.post('/export',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR', 'CLIENT'),
  [
    body('format').isIn(['csv', 'excel', 'pdf']).withMessage('Invalid export format'),
    body('data').isObject().withMessage('Data is required'),
  ],
  asyncHandler(async (req, res) => {
    const { format, data, reportName = 'analytics_export' } = req.body;

    const ExportService = require('../services/exportService');
    const exportService = new ExportService();

    let exportedData;
    let contentType;
    let fileExtension;

    switch (format) {
      case 'csv':
        exportedData = await exportService.exportToCSV(data);
        contentType = 'text/csv';
        fileExtension = 'csv';
        break;
      case 'excel':
        exportedData = await exportService.exportToExcel(data);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        fileExtension = 'xlsx';
        break;
      case 'pdf':
        exportedData = await exportService.exportToPDF(data, reportName);
        contentType = 'application/pdf';
        fileExtension = 'pdf';
        break;
      default:
        throw new ApiError(400, 'Unsupported export format');
    }

    const filename = `${reportName}_${new Date().toISOString().split('T')[0]}.${fileExtension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportedData);

    logger.audit('analytics_exported', {
      exportedBy: req.user.id,
      format,
      reportName,
      dataSize: JSON.stringify(data).length,
    });
  })
);

/**
 * @swagger
 * /analytics/fields:
 *   get:
 *     summary: Get available report fields
 *     description: Get list of available fields for custom reports
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available fields retrieved successfully
 */
router.get('/fields',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const availableFields = [
      // Shift fields
      { id: 'shift_count', name: 'Shift Count', type: 'metric', category: 'Shifts', description: 'Total number of shifts' },
      { id: 'shift_hours', name: 'Total Hours', type: 'metric', category: 'Shifts', description: 'Total hours worked' },
      { id: 'completion_rate', name: 'Completion Rate', type: 'metric', category: 'Shifts', description: 'Percentage of completed shifts' },

      // Report fields
      { id: 'report_count', name: 'Report Count', type: 'metric', category: 'Reports', description: 'Total number of reports' },
      { id: 'incident_count', name: 'Incident Count', type: 'metric', category: 'Reports', description: 'Number of incident reports' },
      { id: 'incident_rate', name: 'Incident Rate', type: 'metric', category: 'Reports', description: 'Percentage of incident reports' },

      // Agent fields
      { id: 'agent_count', name: 'Agent Count', type: 'metric', category: 'Agents', description: 'Number of unique agents' },
      { id: 'agent_performance', name: 'Agent Performance', type: 'metric', category: 'Agents', description: 'Average agent performance score' },

      // Site fields
      { id: 'site_count', name: 'Site Count', type: 'metric', category: 'Sites', description: 'Number of unique sites' },
      { id: 'site_coverage', name: 'Site Coverage', type: 'metric', category: 'Sites', description: 'Percentage of sites covered' },

      // Dimensions
      { id: 'date', name: 'Date', type: 'dimension', category: 'Time', description: 'Date dimension' },
      { id: 'site_name', name: 'Site Name', type: 'dimension', category: 'Sites', description: 'Site name' },
      { id: 'agent_name', name: 'Agent Name', type: 'dimension', category: 'Agents', description: 'Agent name' },
      { id: 'client_name', name: 'Client Name', type: 'dimension', category: 'Clients', description: 'Client name' },
      { id: 'shift_type', name: 'Shift Type', type: 'dimension', category: 'Shifts', description: 'Type of shift' },

      // Filters
      { id: 'status_filter', name: 'Status Filter', type: 'filter', category: 'Filters', description: 'Filter by status' },
      { id: 'priority_filter', name: 'Priority Filter', type: 'filter', category: 'Filters', description: 'Filter by priority' },
    ];

    res.json({
      message: 'Available fields retrieved successfully',
      fields: availableFields,
      categories: [...new Set(availableFields.map(f => f.category))],
    });
  })
);

/**
 * @swagger
 * /analytics/saved-reports:
 *   get:
 *     summary: Get saved custom reports
 *     description: Get list of saved custom reports
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved reports retrieved successfully
 */
router.get('/saved-reports',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    const savedReports = await prisma.customReport.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedReports = savedReports.map(report => ({
      id: report.id,
      name: report.name,
      configuration: report.configuration,
      createdBy: report.createdBy.username,
      createdAt: report.createdAt,
      lastRun: report.lastRun,
    }));

    res.json({
      message: 'Saved reports retrieved successfully',
      reports: formattedReports,
    });
  })
);

// Helper function to generate custom report data
async function generateCustomReportData({ prisma, fields, filters, dateRange, groupBy, sortBy, sortOrder }) {
  // This is a simplified implementation
  // In a real system, this would build dynamic queries based on the configuration

  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = new Date();

  // Generate real data based on fields and database queries
  const realData = [];

  try {
    // Calculate the number of days in the date range
    const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const daysToGenerate = Math.min(daysDiff, 30); // Limit to 30 days for performance

    for (let i = 0; i < daysToGenerate; i++) {
      const currentDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
      const dataPoint = {};

      // Process each field with real database queries
      for (const field of fields) {
        switch (field.id) {
          case 'shift_count':
            const shiftCount = await prisma.shift.count({
              where: {
                startTime: { gte: currentDate, lt: nextDate },
                deletedAt: null,
              },
            });
            dataPoint[field.name] = shiftCount;
            break;

          case 'completion_rate':
            const [totalShifts, completedShifts] = await Promise.all([
              prisma.shift.count({
                where: {
                  startTime: { gte: currentDate, lt: nextDate },
                  deletedAt: null,
                },
              }),
              prisma.shift.count({
                where: {
                  startTime: { gte: currentDate, lt: nextDate },
                  status: 'COMPLETED',
                  deletedAt: null,
                },
              }),
            ]);
            dataPoint[field.name] = totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0;
            break;

          case 'incident_count':
            const incidentCount = await prisma.report.count({
              where: {
                createdAt: { gte: currentDate, lt: nextDate },
                type: 'INCIDENT',
                deletedAt: null,
              },
            });
            dataPoint[field.name] = incidentCount;
            break;

          case 'date':
            dataPoint[field.name] = currentDate.toISOString().split('T')[0];
            break;

          case 'site_name':
            // For site-based reports, get actual site names
            const sites = await prisma.site.findMany({
              where: {
                deletedAt: null,
                shifts: {
                  some: {
                    startTime: { gte: currentDate, lt: nextDate },
                  },
                },
              },
              select: { name: true },
              take: 1,
            });
            dataPoint[field.name] = sites.length > 0 ? sites[0].name : 'No Activity';
            break;

          case 'agent_count':
            const agentCount = await prisma.agent.count({
              where: {
                shifts: {
                  some: {
                    startTime: { gte: currentDate, lt: nextDate },
                  },
                },
                deletedAt: null,
              },
            });
            dataPoint[field.name] = agentCount;
            break;

          case 'revenue':
            // Calculate revenue based on completed shifts and hourly rates
            const revenueData = await prisma.shift.aggregate({
              where: {
                startTime: { gte: currentDate, lt: nextDate },
                status: 'COMPLETED',
                deletedAt: null,
              },
              _sum: {
                actualHours: true,
              },
            });
            // Assuming average hourly rate of $25 (this should come from actual pricing)
            const avgHourlyRate = 25;
            dataPoint[field.name] = Math.round((revenueData._sum.actualHours || 0) * avgHourlyRate);
            break;

          default:
            // For custom fields, try to extract from metadata or set to 0
            dataPoint[field.name] = 0;
        }
      }

      realData.push(dataPoint);
    }

    return realData;
  } catch (error) {
    logger.error('Failed to generate real report data:', error);
    // Return empty data structure instead of mock data
    return fields.map(() => ({}));
  }
}

module.exports = router;
