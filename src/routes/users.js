const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize, authorizeOwnerOrRole } = require('../middleware/auth');
const config = require('../config/config');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         username:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         role:
 *           type: string
 *           enum: [ADMIN, SUPERVISOR, AGENT, CLIENT]
 *         status:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, SUSPENDED, PENDING]
 *         profile:
 *           type: object
 *         preferences:
 *           type: object
 *         lastLoginAt:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     description: Retrieve a list of users (Admin/Supervisor only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [ADMIN, SUPERVISOR, AGENT, CLIENT]
 *         description: Filter by user role
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, SUSPENDED, PENDING]
 *         description: Filter by user status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by username, email, or name
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of users per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of users to skip
 *     responses:
 *       200:
 *         description: List of users
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('role').optional().isIn(['ADMIN', 'SUPERVISOR', 'AGENT', 'CLIENT']),
    query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING']),
    query('search').optional().isString().isLength({ max: 100 }),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { role, status, search, limit = 20, offset = 0 } = req.query;
    const prisma = req.app.locals.prisma;

    // Build where clause
    const where = {
      deletedAt: null,
    };

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        {
          profile: {
            path: ['firstName'],
            string_contains: search,
          },
        },
        {
          profile: {
            path: ['lastName'],
            string_contains: search,
          },
        },
      ];
    }

    // Supervisors can only see agents
    if (req.user.role === 'SUPERVISOR') {
      where.role = 'AGENT';
    }

    // Get users with pagination
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          status: true,
          profile: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          agent: {
            select: {
              id: true,
              employeeId: true,
              employmentStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
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
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieve a specific user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
router.get('/:id',
  authenticate,
  authorizeOwnerOrRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    const user = await prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        profile: true,
        preferences: true,
        lastLoginAt: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
        agent: {
          select: {
            id: true,
            employeeId: true,
            hireDate: true,
            employmentStatus: true,
            skills: true,
            certifications: true,
            emergencyContact: true,
            performanceMetrics: true,
          },
        },
      },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Supervisors can only see agents
    if (req.user.role === 'SUPERVISOR' && user.role !== 'AGENT') {
      throw new ApiError(403, 'Access denied');
    }

    res.json({ user });
  })
);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create new user
 *     description: Create a new user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - role
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               role:
 *                 type: string
 *                 enum: [ADMIN, SUPERVISOR, AGENT, CLIENT]
 *               profile:
 *                 type: object
 *                 properties:
 *                   firstName:
 *                     type: string
 *                   lastName:
 *                     type: string
 *                   phone:
 *                     type: string
 *               agentDetails:
 *                 type: object
 *                 description: Required if role is AGENT
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: Username or email already exists
 */
router.post('/',
  authenticate,
  authorize('ADMIN'),
  [
    body('username')
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    body('role')
      .isIn(['ADMIN', 'SUPERVISOR', 'AGENT', 'CLIENT'])
      .withMessage('Invalid role'),
    body('profile.firstName')
      .optional()
      .isString()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name must be between 1 and 50 characters'),
    body('profile.lastName')
      .optional()
      .isString()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name must be between 1 and 50 characters'),
    body('profile.phone')
      .optional()
      .isMobilePhone()
      .withMessage('Valid phone number is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { username, email, password, role, profile = {}, agentDetails } = req.body;
    const prisma = req.app.locals.prisma;

    // Check if username or email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email },
        ],
        deletedAt: null,
      },
    });

    if (existingUser) {
      const field = existingUser.username === username ? 'username' : 'email';
      throw new ApiError(409, `${field} already exists`);
    }

    // Note: Password hashing is now handled by Clerk
    // Users should be created through Clerk authentication system

    // Create user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          id: uuidv4(),
          username,
          email,
          // Note: passwordHash removed - authentication handled by Clerk
          role,
          status: 'ACTIVE',
          profile,
          preferences: {
            language: 'en',
            timezone: 'UTC',
            notifications: {
              pushEnabled: true,
              emailEnabled: true,
              smsEnabled: false,
            },
          },
        },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          status: true,
          profile: true,
          createdAt: true,
        },
      });

      // Create agent profile if role is AGENT
      if (role === 'AGENT' && agentDetails) {
        await tx.agent.create({
          data: {
            id: uuidv4(),
            userId: newUser.id,
            employeeId: agentDetails.employeeId || `EMP${Date.now()}`,
            hireDate: agentDetails.hireDate ? new Date(agentDetails.hireDate) : new Date(),
            employmentStatus: 'ACTIVE',
            skills: agentDetails.skills || [],
            certifications: agentDetails.certifications || [],
            emergencyContact: agentDetails.emergencyContact || null,
          },
        });
      }

      return newUser;
    });

    logger.audit('user_created', {
      createdBy: req.user.id,
      newUserId: result.id,
      role,
      username,
      email,
    });

    res.status(201).json({
      message: 'User created successfully',
      user: result,
    });
  })
);

/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Update user
 *     description: Update user information
 *     tags: [Users]
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
 *               profile:
 *                 type: object
 *               preferences:
 *                 type: object
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, SUSPENDED, PENDING]
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
router.patch('/:id',
  authenticate,
  authorizeOwnerOrRole('ADMIN', 'SUPERVISOR'),
  [
    body('profile').optional().isObject(),
    body('preferences').optional().isObject(),
    body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const { profile, preferences, status } = req.body;
    const prisma = req.app.locals.prisma;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id, deletedAt: null },
    });

    if (!existingUser) {
      throw new ApiError(404, 'User not found');
    }

    // Supervisors can only update agents
    if (req.user.role === 'SUPERVISOR' && existingUser.role !== 'AGENT') {
      throw new ApiError(403, 'Access denied');
    }

    // Only admins can change status
    if (status && req.user.role !== 'ADMIN') {
      throw new ApiError(403, 'Only admins can change user status');
    }

    // Build update data
    const updateData = {};
    if (profile) updateData.profile = { ...existingUser.profile, ...profile };
    if (preferences) updateData.preferences = { ...existingUser.preferences, ...preferences };
    if (status) updateData.status = status;

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        profile: true,
        preferences: true,
        updatedAt: true,
      },
    });

    logger.audit('user_updated', {
      updatedBy: req.user.id,
      userId: id,
      changes: updateData,
    });

    res.json({
      message: 'User updated successfully',
      user: updatedUser,
    });
  })
);

/**
 * @swagger
 * /users/bulk/status:
 *   patch:
 *     summary: Bulk update user status
 *     description: Update status for multiple users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIds
 *               - status
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, SUSPENDED, PENDING]
 *               reason:
 *                 type: string
 *                 description: Reason for status change
 *     responses:
 *       200:
 *         description: Users updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.patch('/bulk/status',
  authenticate,
  authorize('ADMIN'),
  [
    body('userIds').isArray().withMessage('User IDs must be an array'),
    body('userIds.*').isUUID().withMessage('Each user ID must be a valid UUID'),
    body('status').isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING']).withMessage('Invalid status'),
    body('reason').optional().isString().isLength({ max: 500 }).withMessage('Reason must be a string with max 500 characters'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { userIds, status, reason } = req.body;
    const prisma = req.app.locals.prisma;

    if (userIds.length === 0) {
      throw new ApiError(400, 'At least one user ID is required');
    }

    if (userIds.length > 100) {
      throw new ApiError(400, 'Cannot update more than 100 users at once');
    }

    // Verify all users exist and are not deleted
    const existingUsers = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        deletedAt: null,
      },
      select: { id: true, username: true, role: true, status: true },
    });

    if (existingUsers.length !== userIds.length) {
      const foundIds = existingUsers.map(u => u.id);
      const missingIds = userIds.filter(id => !foundIds.includes(id));
      throw new ApiError(404, `Users not found: ${missingIds.join(', ')}`);
    }

    // Prevent admins from suspending themselves
    if (status === 'SUSPENDED' && userIds.includes(req.user.id)) {
      throw new ApiError(400, 'Cannot suspend your own account');
    }

    // Update users
    const updateResult = await prisma.user.updateMany({
      where: {
        id: { in: userIds },
        deletedAt: null,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    // Log bulk status change
    logger.audit('bulk_user_status_change', {
      changedBy: req.user.id,
      userIds,
      newStatus: status,
      reason,
      affectedCount: updateResult.count,
    });

    res.json({
      message: `Successfully updated ${updateResult.count} users`,
      updatedCount: updateResult.count,
      status,
      reason,
    });
  })
);

/**
 * @swagger
 * /users/analytics:
 *   get:
 *     summary: Get user analytics
 *     description: Get user statistics and analytics (Admin/Supervisor only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, 1y]
 *           default: 30d
 *         description: Analytics period
 *     responses:
 *       200:
 *         description: User analytics data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/analytics',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { period = '30d' } = req.query;
    const prisma = req.app.locals.prisma;

    // Calculate date range
    const periodDays = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365,
    };

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays[period]);

    // Build base where clause
    const baseWhere = { deletedAt: null };

    // Supervisors can only see agent analytics
    if (req.user.role === 'SUPERVISOR') {
      baseWhere.role = 'AGENT';
    }

    // Get user statistics
    const [
      totalUsers,
      usersByRole,
      usersByStatus,
      recentUsers,
      activeUsers,
      loginStats,
    ] = await Promise.all([
      // Total users
      prisma.user.count({ where: baseWhere }),

      // Users by role
      prisma.user.groupBy({
        by: ['role'],
        where: baseWhere,
        _count: { role: true },
      }),

      // Users by status
      prisma.user.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { status: true },
      }),

      // Recent users (created in period)
      prisma.user.count({
        where: {
          ...baseWhere,
          createdAt: { gte: startDate },
        },
      }),

      // Active users (logged in during period)
      prisma.user.count({
        where: {
          ...baseWhere,
          lastLoginAt: { gte: startDate },
        },
      }),

      // Login statistics
      prisma.user.findMany({
        where: {
          ...baseWhere,
          lastLoginAt: { gte: startDate },
        },
        select: {
          lastLoginAt: true,
          role: true,
        },
      }),
    ]);

    // Process login statistics by day
    const loginsByDay = {};
    loginStats.forEach(user => {
      if (user.lastLoginAt) {
        const day = user.lastLoginAt.toISOString().split('T')[0];
        if (!loginsByDay[day]) {
          loginsByDay[day] = { total: 0, byRole: {} };
        }
        loginsByDay[day].total++;
        loginsByDay[day].byRole[user.role] = (loginsByDay[day].byRole[user.role] || 0) + 1;
      }
    });

    // Calculate growth rate
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays[period]);

    const previousPeriodUsers = await prisma.user.count({
      where: {
        ...baseWhere,
        createdAt: {
          gte: previousPeriodStart,
          lt: startDate,
        },
      },
    });

    const growthRate = previousPeriodUsers > 0
      ? ((recentUsers - previousPeriodUsers) / previousPeriodUsers) * 100
      : 0;

    res.json({
      period,
      summary: {
        totalUsers,
        recentUsers,
        activeUsers,
        growthRate: Math.round(growthRate * 100) / 100,
      },
      distribution: {
        byRole: usersByRole.map(item => ({
          role: item.role,
          count: item._count.role,
        })),
        byStatus: usersByStatus.map(item => ({
          status: item.status,
          count: item._count.status,
        })),
      },
      activity: {
        loginsByDay,
        totalLogins: loginStats.length,
      },
      generatedAt: new Date().toISOString(),
    });
  })
);

/**
 * @swagger
 * /users/export:
 *   get:
 *     summary: Export users data
 *     description: Export users data in CSV format (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [ADMIN, SUPERVISOR, AGENT, CLIENT]
 *         description: Filter by user role
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, SUSPENDED, PENDING]
 *         description: Filter by user status
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: csv
 *         description: Export format
 *     responses:
 *       200:
 *         description: Users data exported
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/export',
  authenticate,
  authorize('ADMIN'),
  [
    query('role').optional().isIn(['ADMIN', 'SUPERVISOR', 'AGENT', 'CLIENT']),
    query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING']),
    query('format').optional().isIn(['csv', 'json']).withMessage('Invalid format'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { role, status, format = 'csv' } = req.query;
    const prisma = req.app.locals.prisma;

    // Build where clause
    const where = { deletedAt: null };
    if (role) where.role = role;
    if (status) where.status = status;

    // Get users data
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        profile: true,
        lastLoginAt: true,
        createdAt: true,
        agent: {
          select: {
            employeeId: true,
            employmentStatus: true,
            hireDate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Log export activity
    logger.audit('user_data_export', {
      exportedBy: req.user.id,
      filters: { role, status },
      format,
      recordCount: users.length,
    });

    if (format === 'json') {
      res.json({
        users,
        exportedAt: new Date().toISOString(),
        totalRecords: users.length,
      });
    } else {
      // Convert to CSV
      const csvHeaders = [
        'ID',
        'Username',
        'Email',
        'Role',
        'Status',
        'First Name',
        'Last Name',
        'Phone',
        'Employee ID',
        'Employment Status',
        'Hire Date',
        'Last Login',
        'Created At',
      ];

      const csvRows = users.map(user => [
        user.id,
        user.username,
        user.email,
        user.role,
        user.status,
        user.profile?.firstName || '',
        user.profile?.lastName || '',
        user.profile?.phone || '',
        user.agent?.employeeId || '',
        user.agent?.employmentStatus || '',
        user.agent?.hireDate ? user.agent.hireDate.toISOString().split('T')[0] : '',
        user.lastLoginAt ? user.lastLoginAt.toISOString() : '',
        user.createdAt.toISOString(),
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row =>
          row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="users_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    }
  })
);

module.exports = router;
