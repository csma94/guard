const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get user notifications
 *     description: Retrieve notifications for the authenticated user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notifications
 */
router.get('/',
  authenticate,
  [
    query('status').optional().isIn(['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ']),
    query('type').optional().isIn(['INFO', 'WARNING', 'URGENT', 'EMERGENCY', 'SYSTEM']),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { status, type, limit = 20, offset = 0 } = req.query;
    const prisma = req.app.locals.prisma;

    const where = {
      recipientId: req.user.id,
    };

    if (status) where.status = status;
    if (type) where.type = type;

    const [notifications, totalCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              profile: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      notifications,
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
 * /notifications/{id}/read:
 *   post:
 *     summary: Mark notification as read
 *     description: Mark a specific notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.post('/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    const notification = await prisma.notification.findFirst({
      where: {
        id,
        recipientId: req.user.id,
      },
    });

    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }

    const updatedNotification = await prisma.notification.update({
      where: { id },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });

    res.json({
      message: 'Notification marked as read',
      notification: updatedNotification,
    });
  })
);

/**
 * @swagger
 * /notifications/send:
 *   post:
 *     summary: Send notification
 *     description: Send a notification to users (Admin/Supervisor only)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Notification sent successfully
 */
router.post('/send',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('recipientIds').isArray().withMessage('Recipient IDs array is required'),
    body('type').isIn(['INFO', 'WARNING', 'URGENT', 'EMERGENCY', 'SYSTEM']).withMessage('Valid notification type is required'),
    body('title').isLength({ min: 1, max: 255 }).withMessage('Title is required'),
    body('message').isLength({ min: 1, max: 1000 }).withMessage('Message is required'),
    body('channels').isArray().withMessage('Channels array is required'),
    body('data').optional().isObject(),
    body('scheduledAt').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const {
      recipientIds,
      type,
      title,
      message,
      channels,
      data = {},
      scheduledAt,
    } = req.body;

    const prisma = req.app.locals.prisma;

    // Validate recipients exist
    const recipients = await prisma.user.findMany({
      where: {
        id: { in: recipientIds },
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (recipients.length !== recipientIds.length) {
      throw new ApiError(400, 'Some recipients not found or inactive');
    }

    // Create notifications for each recipient
    const notifications = await Promise.all(
      recipientIds.map(recipientId =>
        prisma.notification.create({
          data: {
            id: uuidv4(),
            recipientId,
            senderId: req.user.id,
            type,
            title,
            message,
            channels,
            data,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
            status: 'PENDING',
          },
        })
      )
    );

    logger.audit('notifications_sent', {
      sentBy: req.user.id,
      recipientCount: recipientIds.length,
      type,
      title,
    });

    res.status(201).json({
      message: 'Notifications created successfully',
      notifications: notifications.map(n => ({
        id: n.id,
        recipientId: n.recipientId,
        status: n.status,
      })),
    });
  })
);

module.exports = router;
