const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const MessagingService = require('../services/messaging');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /messaging/direct:
 *   post:
 *     summary: Send direct message
 *     description: Send a direct message to another user
 *     tags: [Messaging]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipientId
 *               - content
 *             properties:
 *               recipientId:
 *                 type: string
 *                 format: uuid
 *               content:
 *                 type: string
 *               messageType:
 *                 type: string
 *                 enum: [TEXT, IMAGE, FILE, LOCATION]
 *                 default: TEXT
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *               priority:
 *                 type: string
 *                 enum: [LOW, NORMAL, HIGH, URGENT]
 *                 default: NORMAL
 *     responses:
 *       200:
 *         description: Message sent successfully
 */
router.post('/direct',
  authenticate,
  [
    body('recipientId').isUUID().withMessage('Valid recipient ID is required'),
    body('content').isLength({ min: 1, max: 2000 }).withMessage('Message content is required (max 2000 characters)'),
    body('messageType').optional().isIn(['TEXT', 'IMAGE', 'FILE', 'LOCATION']),
    body('attachments').optional().isArray(),
    body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { recipientId, content, messageType, attachments, priority } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const messagingService = new MessagingService(prisma, io);

    try {
      const result = await messagingService.sendDirectMessage(req.user.id, recipientId, {
        content,
        messageType,
        attachments,
        priority
      });

      res.json({
        success: true,
        message: 'Message sent successfully',
        ...result
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /messaging/group:
 *   post:
 *     summary: Send group message
 *     description: Send a message to a group of users
 *     tags: [Messaging]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *               groupType:
 *                 type: string
 *                 enum: [SITE, SHIFT, ROLE]
 *               groupId:
 *                 type: string
 *               recipientIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               messageType:
 *                 type: string
 *                 enum: [TEXT, IMAGE, FILE, LOCATION]
 *                 default: TEXT
 *               priority:
 *                 type: string
 *                 enum: [LOW, NORMAL, HIGH, URGENT]
 *                 default: NORMAL
 *     responses:
 *       200:
 *         description: Group message sent successfully
 */
router.post('/group',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('content').isLength({ min: 1, max: 2000 }).withMessage('Message content is required (max 2000 characters)'),
    body('groupType').optional().isIn(['SITE', 'SHIFT', 'ROLE']),
    body('groupId').optional().isString(),
    body('recipientIds').optional().isArray(),
    body('messageType').optional().isIn(['TEXT', 'IMAGE', 'FILE', 'LOCATION']),
    body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { content, groupType, groupId, recipientIds, messageType, priority } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    if (!groupType && !recipientIds) {
      throw new ApiError(400, 'Either groupType/groupId or recipientIds must be provided');
    }

    const messagingService = new MessagingService(prisma, io);

    try {
      const result = await messagingService.sendGroupMessage(req.user.id, {
        groupType,
        groupId,
        recipientIds
      }, {
        content,
        messageType,
        priority
      });

      res.json({
        success: true,
        message: 'Group message sent successfully',
        ...result
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /messaging/emergency:
 *   post:
 *     summary: Send emergency broadcast
 *     description: Send an emergency broadcast message to all relevant users
 *     tags: [Messaging]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                 default: HIGH
 *               location:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 *                   address:
 *                     type: string
 *               affectedSites:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               requiresAcknowledgment:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Emergency broadcast sent successfully
 */
router.post('/emergency',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('message').isLength({ min: 1, max: 1000 }).withMessage('Emergency message is required (max 1000 characters)'),
    body('severity').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('location').optional().isObject(),
    body('affectedSites').optional().isArray(),
    body('requiresAcknowledgment').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { message, severity, location, affectedSites, requiresAcknowledgment } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const messagingService = new MessagingService(prisma, io);

    try {
      const result = await messagingService.sendEmergencyBroadcast(req.user.id, {
        message,
        severity,
        location,
        affectedSites,
        requiresAcknowledgment
      });

      // Log emergency broadcast
      logger.security('Emergency broadcast initiated', {
        broadcastId: result.emergencyBroadcast.id,
        initiatedBy: req.user.id,
        severity,
        affectedSites,
        recipientCount: result.emergencyBroadcast.recipientCount
      });

      res.json({
        success: true,
        message: 'Emergency broadcast sent successfully',
        ...result
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /messaging/emergency/{id}/acknowledge:
 *   post:
 *     summary: Acknowledge emergency message
 *     description: Acknowledge receipt and status for an emergency message
 *     tags: [Messaging]
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
 *               status:
 *                 type: string
 *                 enum: [SAFE, NEEDS_ASSISTANCE, EVACUATING, INJURED]
 *                 default: SAFE
 *               location:
 *                 type: object
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Emergency acknowledgment recorded
 */
router.post('/emergency/:id/acknowledge',
  authenticate,
  [
    body('status').optional().isIn(['SAFE', 'NEEDS_ASSISTANCE', 'EVACUATING', 'INJURED']),
    body('location').optional().isObject(),
    body('notes').optional().isString().isLength({ max: 500 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const { status, location, notes } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const messagingService = new MessagingService(prisma, io);

    try {
      const result = await messagingService.acknowledgeEmergency(id, req.user.id, {
        status,
        location,
        notes
      });

      res.json({
        success: true,
        message: 'Emergency acknowledgment recorded',
        ...result
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /messaging/conversations/{userId}:
 *   get:
 *     summary: Get conversation history
 *     description: Get message history between current user and another user
 *     tags: [Messaging]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Conversation history retrieved
 */
router.get('/conversations/:userId',
  authenticate,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('before').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { userId } = req.params;
    const { limit, offset, before } = req.query;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const messagingService = new MessagingService(prisma, io);

    try {
      const result = await messagingService.getConversationHistory(req.user.id, userId, {
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0,
        before
      });

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

module.exports = router;
