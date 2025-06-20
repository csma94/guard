const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /clients:
 *   get:
 *     summary: Get all clients
 *     description: Retrieve a list of clients (Admin only)
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of clients
 */
router.get('/',
  authenticate,
  authorize('ADMIN'),
  [
    query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED']),
    query('search').optional().isString().isLength({ max: 100 }),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { status, search, limit = 20, offset = 0 } = req.query;
    const prisma = req.app.locals.prisma;

    const where = { deletedAt: null };

    if (status) where.status = status;

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        {
          contactPerson: {
            path: ['name'],
            string_contains: search,
          },
        },
      ];
    }

    const [clients, totalCount] = await Promise.all([
      prisma.client.findMany({
        where,
        include: {
          sites: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
          _count: {
            select: {
              sites: true,
              requests: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.client.count({ where }),
    ]);

    res.json({
      clients,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasNext: offset + limit < totalCount,
      },
    });
  })
);

/**
 * @swagger
 * /clients:
 *   post:
 *     summary: Create new client
 *     description: Create a new client (Admin only)
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Client created successfully
 */
router.post('/',
  authenticate,
  authorize('ADMIN'),
  [
    body('companyName').isLength({ min: 1, max: 255 }).withMessage('Company name is required'),
    body('contactPerson').isObject().withMessage('Contact person is required'),
    body('billingAddress').isObject().withMessage('Billing address is required'),
    body('serviceLevel').optional().isString(),
    body('contractDetails').optional().isObject(),
    body('settings').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const {
      companyName,
      contactPerson,
      billingAddress,
      serviceLevel = 'standard',
      contractDetails,
      settings = {},
    } = req.body;

    const prisma = req.app.locals.prisma;

    // Check if company name already exists
    const existingClient = await prisma.client.findFirst({
      where: {
        companyName,
        deletedAt: null,
      },
    });

    if (existingClient) {
      throw new ApiError(409, 'Company name already exists');
    }

    const newClient = await prisma.client.create({
      data: {
        id: uuidv4(),
        companyName,
        contactPerson,
        billingAddress,
        serviceLevel,
        contractDetails,
        settings,
        status: 'ACTIVE',
      },
    });

    logger.audit('client_created', {
      createdBy: req.user.id,
      clientId: newClient.id,
      companyName,
    });

    res.status(201).json({
      message: 'Client created successfully',
      client: newClient,
    });
  })
);

/**
 * @swagger
 * /clients/{id}:
 *   get:
 *     summary: Get client by ID
 *     description: Retrieve a specific client by ID
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Client details
 */
router.get('/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    const client = await prisma.client.findUnique({
      where: { id, deletedAt: null },
      include: {
        sites: {
          include: {
            _count: {
              select: {
                shifts: true,
                reports: true,
              },
            },
          },
        },
        requests: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!client) {
      throw new ApiError(404, 'Client not found');
    }

    res.json({ client });
  })
);

/**
 * @swagger
 * /clients/dashboard:
 *   get:
 *     summary: Get client dashboard data
 *     description: Get comprehensive dashboard data for client portal
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Client dashboard data
 */
router.get('/dashboard',
  authenticate,
  authorize('CLIENT', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const clientId = req.user.role === 'CLIENT' ? req.user.clientId : req.query.clientId;

    if (!clientId) {
      throw new ApiError(400, 'Client ID is required');
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get basic metrics
    const [
      activeSites,
      totalAgents,
      ongoingShifts,
      reportsToday,
    ] = await Promise.all([
      // Active sites
      prisma.site.count({
        where: {
          clientId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),

      // Total agents assigned to client sites
      prisma.agent.count({
        where: {
          shifts: {
            some: {
              site: {
                clientId,
              },
              startTime: { gte: last7Days },
            },
          },
          employmentStatus: 'ACTIVE',
          deletedAt: null,
        },
      }),

      // Ongoing shifts
      prisma.shift.count({
        where: {
          site: { clientId },
          startTime: { lte: now },
          endTime: { gte: now },
          status: 'IN_PROGRESS',
          deletedAt: null,
        },
      }),

      // Reports today
      prisma.report.count({
        where: {
          site: { clientId },
          createdAt: { gte: today },
          deletedAt: null,
        },
      }),
    ]);

    // Get site statuses
    const sites = await prisma.site.findMany({
      where: {
        clientId,
        deletedAt: null,
      },
      include: {
        shifts: {
          where: {
            startTime: { lte: now },
            endTime: { gte: now },
            status: 'IN_PROGRESS',
          },
        },
        _count: {
          select: {
            reports: {
              where: {
                createdAt: { gte: today },
                reportType: 'INCIDENT',
              },
            },
          },
        },
      },
    });

    const siteStatuses = sites.map(site => ({
      id: site.id,
      name: site.name,
      address: site.address,
      status: site.shifts.length > 0 ? 'active' :
              site._count.reports > 0 ? 'alert' : 'inactive',
      agentsOnSite: site.shifts.length,
      lastUpdate: site.shifts.length > 0 ?
                  new Date(Math.max(...site.shifts.map(s => new Date(s.startTime).getTime()))).toISOString() :
                  site.updatedAt.toISOString(),
    }));

    // Get recent alerts
    const alerts = await prisma.notification.findMany({
      where: {
        data: {
          path: ['clientId'],
          equals: clientId,
        },
        type: { in: ['WARNING', 'ALERT'] },
        createdAt: { gte: last7Days },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const formattedAlerts = alerts.map(alert => ({
      id: alert.id,
      type: alert.type === 'WARNING' ? 'warning' : 'error',
      title: alert.title,
      message: alert.message,
      timestamp: alert.createdAt.toISOString(),
      priority: alert.priority || 'medium',
      acknowledged: alert.readAt !== null,
    }));

    // Get recent activity
    const recentReports = await prisma.report.findMany({
      where: {
        site: { clientId },
        createdAt: { gte: last7Days },
        deletedAt: null,
      },
      include: {
        agent: {
          include: {
            user: {
              select: {
                profile: true,
                username: true,
              },
            },
          },
        },
        site: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const recentActivity = recentReports.map(report => ({
      id: report.id,
      type: 'report_submitted',
      title: `${report.reportType} Report Submitted`,
      description: report.title,
      timestamp: report.createdAt.toISOString(),
      agentName: `${report.agent.user.profile?.firstName || ''} ${report.agent.user.profile?.lastName || ''}`.trim() || report.agent.user.username,
      siteName: report.site.name,
    }));

    const dashboardData = {
      metrics: {
        activeSites,
        activeAgents: totalAgents,
        ongoingShifts,
        reportsToday,
        systemHealth: {
          status: 'operational',
          issues: [],
        },
      },
      siteStatuses,
      alerts: formattedAlerts,
      recentActivity,
      performanceData: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
          {
            label: 'Reports',
            data: [12, 19, 3, 5, 2, 3, 9],
            borderColor: '#1976d2',
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
          },
        ],
      },
    };

    res.json(dashboardData);
  })
);

module.exports = router;
