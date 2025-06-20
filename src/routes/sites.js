const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize, authorizeSiteAccess } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Site:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         clientId:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         address:
 *           type: object
 *         coordinates:
 *           type: string
 *           description: PostGIS POINT format
 *         geofenceRadius:
 *           type: integer
 *           description: Radius in meters
 *         qrCode:
 *           type: string
 *         siteType:
 *           type: string
 *         status:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, MAINTENANCE, CLOSED]
 */

/**
 * @swagger
 * /sites:
 *   get:
 *     summary: Get all sites
 *     description: Retrieve a list of sites based on user permissions
 *     tags: [Sites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by client ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, MAINTENANCE, CLOSED]
 *         description: Filter by site status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by site name or address
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: List of sites
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/',
  authenticate,
  [
    query('clientId').optional().isUUID(),
    query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'CLOSED']),
    query('search').optional().isString().isLength({ max: 100 }),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { clientId, status, search, limit = 20, offset = 0 } = req.query;
    const prisma = req.app.locals.prisma;

    // Build where clause based on user role
    const where = {
      deletedAt: null,
    };

    if (clientId) {
      where.clientId = clientId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        {
          address: {
            path: ['street'],
            string_contains: search,
          },
        },
        {
          address: {
            path: ['city'],
            string_contains: search,
          },
        },
      ];
    }

    // Role-based filtering
    if (req.user.role === 'AGENT' && req.user.agent) {
      // Agents can only see sites where they have shifts
      const agentShifts = await prisma.shift.findMany({
        where: { agentId: req.user.agent.id },
        select: { siteId: true },
        distinct: ['siteId'],
      });
      
      const siteIds = agentShifts.map(shift => shift.siteId);
      where.id = { in: siteIds };
    }

    // Get sites with pagination
    const [sites, totalCount] = await Promise.all([
      prisma.site.findMany({
        where,
        include: {
          client: {
            select: {
              id: true,
              companyName: true,
            },
          },
          _count: {
            select: {
              shifts: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.site.count({ where }),
    ]);

    res.json({
      sites,
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
 * /sites/{id}:
 *   get:
 *     summary: Get site by ID
 *     description: Retrieve a specific site by ID
 *     tags: [Sites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Site ID
 *     responses:
 *       200:
 *         description: Site details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Site not found
 */
router.get('/:id',
  authenticate,
  authorizeSiteAccess,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    const site = await prisma.site.findUnique({
      where: { id, deletedAt: null },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            contactPerson: true,
          },
        },
        shifts: {
          where: {
            startTime: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
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
          },
          orderBy: { startTime: 'desc' },
          take: 10,
        },
        reports: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
          select: {
            id: true,
            reportType: true,
            status: true,
            priority: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!site) {
      throw new ApiError(404, 'Site not found');
    }

    res.json({ site });
  })
);

/**
 * @swagger
 * /sites:
 *   post:
 *     summary: Create new site
 *     description: Create a new site (Admin only)
 *     tags: [Sites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clientId
 *               - name
 *               - address
 *               - coordinates
 *             properties:
 *               clientId:
 *                 type: string
 *                 format: uuid
 *               name:
 *                 type: string
 *               address:
 *                 type: object
 *               coordinates:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 *               geofenceRadius:
 *                 type: integer
 *                 minimum: 10
 *                 maximum: 1000
 *               siteType:
 *                 type: string
 *               accessInstructions:
 *                 type: string
 *               emergencyContacts:
 *                 type: array
 *               equipmentList:
 *                 type: array
 *     responses:
 *       201:
 *         description: Site created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post('/',
  authenticate,
  authorize('ADMIN'),
  [
    body('clientId').isUUID().withMessage('Valid client ID is required'),
    body('name').isLength({ min: 1, max: 255 }).withMessage('Site name is required'),
    body('address').isObject().withMessage('Address is required'),
    body('coordinates.latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('coordinates.longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    body('geofenceRadius').optional().isInt({ min: 10, max: 1000 }).withMessage('Geofence radius must be between 10 and 1000 meters'),
    body('siteType').optional().isString(),
    body('accessInstructions').optional().isString(),
    body('emergencyContacts').optional().isArray(),
    body('equipmentList').optional().isArray(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const {
      clientId,
      name,
      address,
      coordinates,
      geofenceRadius = 100,
      siteType = 'commercial',
      accessInstructions,
      emergencyContacts = [],
      equipmentList = [],
    } = req.body;

    const prisma = req.app.locals.prisma;

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId, deletedAt: null },
    });

    if (!client) {
      throw new ApiError(404, 'Client not found');
    }

    // Check if site name already exists for this client
    const existingSite = await prisma.site.findFirst({
      where: {
        clientId,
        name,
        deletedAt: null,
      },
    });

    if (existingSite) {
      throw new ApiError(409, 'Site name already exists for this client');
    }

    // Create site
    const newSite = await prisma.site.create({
      data: {
        id: uuidv4(),
        clientId,
        name,
        address,
        coordinates: `POINT(${coordinates.longitude} ${coordinates.latitude})`,
        geofenceRadius,
        qrCode: `QR-${name.replace(/\s+/g, '-').toUpperCase()}-${Date.now()}`,
        siteType,
        accessInstructions,
        emergencyContacts,
        equipmentList,
        status: 'ACTIVE',
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    logger.audit('site_created', {
      createdBy: req.user.id,
      siteId: newSite.id,
      clientId,
      name,
    });

    res.status(201).json({
      message: 'Site created successfully',
      site: newSite,
    });
  })
);

/**
 * @swagger
 * /sites/{id}:
 *   patch:
 *     summary: Update site
 *     description: Update site information
 *     tags: [Sites]
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
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: object
 *               coordinates:
 *                 type: object
 *               geofenceRadius:
 *                 type: integer
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, MAINTENANCE, CLOSED]
 *               accessInstructions:
 *                 type: string
 *               emergencyContacts:
 *                 type: array
 *               equipmentList:
 *                 type: array
 *     responses:
 *       200:
 *         description: Site updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Site not found
 */
router.patch('/:id',
  authenticate,
  authorize('ADMIN'),
  [
    body('name').optional().isLength({ min: 1, max: 255 }),
    body('address').optional().isObject(),
    body('coordinates.latitude').optional().isFloat({ min: -90, max: 90 }),
    body('coordinates.longitude').optional().isFloat({ min: -180, max: 180 }),
    body('geofenceRadius').optional().isInt({ min: 10, max: 1000 }),
    body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'CLOSED']),
    body('accessInstructions').optional().isString(),
    body('emergencyContacts').optional().isArray(),
    body('equipmentList').optional().isArray(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const updateData = req.body;
    const prisma = req.app.locals.prisma;

    // Check if site exists
    const existingSite = await prisma.site.findUnique({
      where: { id, deletedAt: null },
    });

    if (!existingSite) {
      throw new ApiError(404, 'Site not found');
    }

    // Handle coordinates update
    if (updateData.coordinates) {
      updateData.coordinates = `POINT(${updateData.coordinates.longitude} ${updateData.coordinates.latitude})`;
    }

    // Update site
    const updatedSite = await prisma.site.update({
      where: { id },
      data: updateData,
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    logger.audit('site_updated', {
      updatedBy: req.user.id,
      siteId: id,
      changes: updateData,
    });

    res.json({
      message: 'Site updated successfully',
      site: updatedSite,
    });
  })
);

module.exports = router;
