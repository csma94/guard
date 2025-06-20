const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize, authorizeOwnerOrRole } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Agent:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         userId:
 *           type: string
 *           format: uuid
 *         employeeId:
 *           type: string
 *         hireDate:
 *           type: string
 *           format: date
 *         employmentStatus:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, ON_LEAVE, TERMINATED]
 *         skills:
 *           type: array
 *           items:
 *             type: string
 *         certifications:
 *           type: array
 *           items:
 *             type: object
 *         emergencyContact:
 *           type: object
 *         performanceMetrics:
 *           type: object
 */

/**
 * @swagger
 * /agents:
 *   get:
 *     summary: Get all agents
 *     description: Retrieve a list of agents (Admin/Supervisor only)
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, ON_LEAVE, TERMINATED]
 *         description: Filter by employment status
 *       - in: query
 *         name: skills
 *         schema:
 *           type: string
 *         description: Filter by skills (comma-separated)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or employee ID
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
 *         description: List of agents
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']),
    query('skills').optional().isString(),
    query('search').optional().isString().isLength({ max: 100 }),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { status, skills, search, limit = 20, offset = 0 } = req.query;
    const prisma = req.app.locals.prisma;

    // Build where clause
    const where = {
      deletedAt: null,
      user: {
        deletedAt: null,
      },
    };

    if (status) {
      where.employmentStatus = status;
    }

    if (skills) {
      const skillsArray = skills.split(',').map(s => s.trim());
      where.skills = {
        hasSome: skillsArray,
      };
    }

    if (search) {
      where.OR = [
        { employeeId: { contains: search, mode: 'insensitive' } },
        {
          user: {
            profile: {
              path: ['firstName'],
              string_contains: search,
            },
          },
        },
        {
          user: {
            profile: {
              path: ['lastName'],
              string_contains: search,
            },
          },
        },
      ];
    }

    // Get agents with pagination
    const [agents, totalCount] = await Promise.all([
      prisma.agent.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              status: true,
              profile: true,
              lastLoginAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.agent.count({ where }),
    ]);

    res.json({
      agents,
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
 * /agents/{id}:
 *   get:
 *     summary: Get agent by ID
 *     description: Retrieve a specific agent by ID
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Agent ID
 *     responses:
 *       200:
 *         description: Agent details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Agent not found
 */
router.get('/:id',
  authenticate,
  authorizeOwnerOrRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    const agent = await prisma.agent.findUnique({
      where: { id, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            status: true,
            profile: true,
            preferences: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!agent) {
      throw new ApiError(404, 'Agent not found');
    }

    res.json({ agent });
  })
);

/**
 * @swagger
 * /agents/{id}/performance:
 *   get:
 *     summary: Get agent performance metrics
 *     description: Retrieve performance metrics for a specific agent
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *           default: month
 *     responses:
 *       200:
 *         description: Agent performance metrics
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Agent not found
 */
router.get('/:id/performance',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    query('period').optional().isIn(['week', 'month', 'quarter', 'year']),
  ],
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { period = 'month' } = req.query;
    const prisma = req.app.locals.prisma;

    // Check if agent exists
    const agent = await prisma.agent.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, performanceMetrics: true },
    });

    if (!agent) {
      throw new ApiError(404, 'Agent not found');
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default: // month
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get performance data
    const [shifts, reports, attendance] = await Promise.all([
      // Shifts completed
      prisma.shift.count({
        where: {
          agentId: id,
          status: 'COMPLETED',
          startTime: { gte: startDate },
        },
      }),
      
      // Reports submitted
      prisma.report.count({
        where: {
          agentId: id,
          status: { in: ['SUBMITTED', 'APPROVED'] },
          createdAt: { gte: startDate },
        },
      }),
      
      // Attendance records
      prisma.attendance.findMany({
        where: {
          agentId: id,
          createdAt: { gte: startDate },
        },
        select: {
          clockInTime: true,
          clockOutTime: true,
          totalHours: true,
          overtimeHours: true,
        },
      }),
    ]);

    // Calculate metrics
    const totalHours = attendance.reduce((sum, record) => {
      return sum + (record.totalHours ? parseFloat(record.totalHours) : 0);
    }, 0);

    const totalOvertimeHours = attendance.reduce((sum, record) => {
      return sum + (record.overtimeHours ? parseFloat(record.overtimeHours) : 0);
    }, 0);

    const onTimeClockIns = attendance.filter(record => {
      // Consider on-time if clocked in within 15 minutes of shift start
      // This would require shift data to calculate properly
      return true; // Simplified for now
    }).length;

    const punctualityRate = attendance.length > 0 ? 
      (onTimeClockIns / attendance.length * 100).toFixed(1) : 0;

    const performance = {
      period,
      startDate,
      endDate: now,
      metrics: {
        shiftsCompleted: shifts,
        reportsSubmitted: reports,
        totalHours: totalHours.toFixed(1),
        overtimeHours: totalOvertimeHours.toFixed(1),
        punctualityRate: `${punctualityRate}%`,
        attendanceRecords: attendance.length,
      },
      storedMetrics: agent.performanceMetrics,
    };

    res.json({ performance });
  })
);

/**
 * @swagger
 * /agents/{id}/status:
 *   patch:
 *     summary: Update agent status
 *     description: Update agent employment status
 *     tags: [Agents]
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
 *                 enum: [ACTIVE, INACTIVE, ON_LEAVE, TERMINATED]
 *               reason:
 *                 type: string
 *               effectiveDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Agent status updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Agent not found
 */
router.patch('/:id/status',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('status')
      .isIn(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED'])
      .withMessage('Invalid status'),
    body('reason')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Reason must be a string with max 500 characters'),
    body('effectiveDate')
      .optional()
      .isISO8601()
      .withMessage('Effective date must be a valid ISO 8601 date'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const { status, reason, effectiveDate } = req.body;
    const prisma = req.app.locals.prisma;

    // Check if agent exists
    const agent = await prisma.agent.findUnique({
      where: { id, deletedAt: null },
      include: {
        user: {
          select: { id: true, status: true },
        },
      },
    });

    if (!agent) {
      throw new ApiError(404, 'Agent not found');
    }

    // Update agent status
    const updatedAgent = await prisma.agent.update({
      where: { id },
      data: {
        employmentStatus: status,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            status: true,
            profile: true,
          },
        },
      },
    });

    // Update user status if agent is terminated or inactive
    if (status === 'TERMINATED' || status === 'INACTIVE') {
      await prisma.user.update({
        where: { id: agent.userId },
        data: { status: 'INACTIVE' },
      });
    } else if (status === 'ACTIVE' && agent.user.status === 'INACTIVE') {
      await prisma.user.update({
        where: { id: agent.userId },
        data: { status: 'ACTIVE' },
      });
    }

    logger.audit('agent_status_updated', {
      updatedBy: req.user.id,
      agentId: id,
      oldStatus: agent.employmentStatus,
      newStatus: status,
      reason,
      effectiveDate,
    });

    res.json({
      message: 'Agent status updated successfully',
      agent: updatedAgent,
    });
  })
);

/**
 * @swagger
 * /agents/{id}:
 *   patch:
 *     summary: Update agent details
 *     description: Update agent information
 *     tags: [Agents]
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
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               certifications:
 *                 type: array
 *                 items:
 *                   type: object
 *               emergencyContact:
 *                 type: object
 *     responses:
 *       200:
 *         description: Agent updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Agent not found
 */
router.patch('/:id',
  authenticate,
  authorizeOwnerOrRole('ADMIN', 'SUPERVISOR'),
  [
    body('skills').optional().isArray(),
    body('certifications').optional().isArray(),
    body('emergencyContact').optional().isObject(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const { skills, certifications, emergencyContact } = req.body;
    const prisma = req.app.locals.prisma;

    // Check if agent exists
    const existingAgent = await prisma.agent.findUnique({
      where: { id, deletedAt: null },
    });

    if (!existingAgent) {
      throw new ApiError(404, 'Agent not found');
    }

    // Build update data
    const updateData = {};
    if (skills !== undefined) updateData.skills = skills;
    if (certifications !== undefined) updateData.certifications = certifications;
    if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;

    // Update agent
    const updatedAgent = await prisma.agent.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            profile: true,
          },
        },
      },
    });

    logger.audit('agent_updated', {
      updatedBy: req.user.id,
      agentId: id,
      changes: updateData,
    });

    res.json({
      message: 'Agent updated successfully',
      agent: updatedAgent,
    });
  })
);

module.exports = router;
