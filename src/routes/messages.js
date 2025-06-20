const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /messages:
 *   get:
 *     summary: Get user messages
 *     description: Retrieve messages for the authenticated user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of messages
 */
router.get('/',
  authenticate,
  [
    query('conversationWith').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const { conversationWith, limit = 50, offset = 0 } = req.query;
    const prisma = req.app.locals.prisma;

    const where = {
      OR: [
        { senderId: req.user.id },
        { recipientId: req.user.id },
      ],
    };

    if (conversationWith) {
      where.OR = [
        { senderId: req.user.id, recipientId: conversationWith },
        { senderId: conversationWith, recipientId: req.user.id },
      ];
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
        recipient: {
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
    });

    res.json({ messages });
  })
);

/**
 * @swagger
 * /messages:
 *   post:
 *     summary: Send message
 *     description: Send a message to another user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Message sent successfully
 */
router.post('/',
  authenticate,
  [
    body('recipientId').isUUID().withMessage('Valid recipient ID is required'),
    body('message').isLength({ min: 1, max: 1000 }).withMessage('Message is required'),
    body('messageType').optional().isIn(['TEXT', 'IMAGE', 'VIDEO', 'LOCATION', 'FILE']),
    body('priority').optional().isIn(['NORMAL', 'HIGH', 'URGENT']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const {
      recipientId,
      message,
      messageType = 'TEXT',
      priority = 'NORMAL',
    } = req.body;

    const prisma = req.app.locals.prisma;

    // Verify recipient exists
    const recipient = await prisma.user.findUnique({
      where: {
        id: recipientId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (!recipient) {
      throw new ApiError(404, 'Recipient not found or inactive');
    }

    const newMessage = await prisma.message.create({
      data: {
        id: uuidv4(),
        senderId: req.user.id,
        recipientId,
        message,
        messageType,
        priority,
        status: 'SENT',
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
        recipient: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
      },
    });

    // Emit real-time message via Socket.IO
    const io = req.app.locals.io;
    if (io) {
      io.to(`user:${recipientId}`).emit('new_message', {
        id: newMessage.id,
        senderId: req.user.id,
        sender: newMessage.sender,
        message,
        messageType,
        priority,
        timestamp: newMessage.createdAt,
      });
    }

    res.status(201).json({
      message: 'Message sent successfully',
      messageData: newMessage,
    });
  })
);

/**
 * @swagger
 * /messages/conversations:
 *   get:
 *     summary: Get user conversations
 *     description: Get list of conversations for the authenticated user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
 */
router.get('/conversations',
  authenticate,
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    // Get unique conversation partners
    const conversations = await prisma.$queryRaw`
      SELECT DISTINCT
        CASE 
          WHEN sender_id = ${req.user.id} THEN recipient_id
          ELSE sender_id
        END as user_id,
        MAX(created_at) as last_message_at
      FROM messages 
      WHERE sender_id = ${req.user.id} OR recipient_id = ${req.user.id}
      GROUP BY user_id
      ORDER BY last_message_at DESC
      LIMIT 20
    `;

    // Get user details for each conversation
    const conversationDetails = await Promise.all(
      conversations.map(async (conv) => {
        const user = await prisma.user.findUnique({
          where: { id: conv.user_id },
          select: {
            id: true,
            username: true,
            profile: true,
            role: true,
          },
        });

        // Get last message
        const lastMessage = await prisma.message.findFirst({
          where: {
            OR: [
              { senderId: req.user.id, recipientId: conv.user_id },
              { senderId: conv.user_id, recipientId: req.user.id },
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: {
            message: true,
            messageType: true,
            createdAt: true,
            senderId: true,
          },
        });

        // Count unread messages
        const unreadCount = await prisma.message.count({
          where: {
            senderId: conv.user_id,
            recipientId: req.user.id,
            readAt: null,
          },
        });

        return {
          user,
          lastMessage,
          unreadCount,
          lastMessageAt: conv.last_message_at,
        };
      })
    );

    res.json({ conversations: conversationDetails });
  })
);

module.exports = router;
