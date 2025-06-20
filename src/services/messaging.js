const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * Real-time Messaging Service
 * Handles direct messages, group chats, and emergency communications
 */
class MessagingService {
  constructor(prisma, io) {
    this.prisma = prisma;
    this.io = io;
    this.activeConnections = new Map(); // Track active user connections
  }

  /**
   * Send direct message between users
   */
  async sendDirectMessage(senderId, recipientId, messageData) {
    try {
      const { content, messageType = 'TEXT', attachments = [], priority = 'NORMAL' } = messageData;

      // Validate users exist and can communicate
      await this.validateCommunicationPermissions(senderId, recipientId);

      // Create message record
      const message = await this.prisma.message.create({
        data: {
          id: uuidv4(),
          senderId,
          recipientId,
          content,
          messageType,
          attachments,
          priority,
          status: 'SENT',
          sentAt: new Date()
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              profile: true,
              role: true
            }
          },
          recipient: {
            select: {
              id: true,
              username: true,
              profile: true,
              role: true
            }
          }
        }
      });

      // Send real-time message via WebSocket
      if (this.io) {
        this.io.to(`user:${recipientId}`).emit('new_message', {
          id: message.id,
          senderId: message.senderId,
          senderName: `${message.sender.profile?.firstName || ''} ${message.sender.profile?.lastName || ''}`.trim(),
          senderRole: message.sender.role,
          content: message.content,
          messageType: message.messageType,
          attachments: message.attachments,
          priority: message.priority,
          sentAt: message.sentAt,
          conversationId: this.generateConversationId(senderId, recipientId)
        });

        // Send delivery confirmation to sender
        this.io.to(`user:${senderId}`).emit('message_delivered', {
          messageId: message.id,
          recipientId,
          deliveredAt: new Date()
        });
      }

      // Update message status to delivered
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date()
        }
      });

      logger.info('Direct message sent', {
        messageId: message.id,
        senderId,
        recipientId,
        messageType,
        priority
      });

      return {
        success: true,
        message: {
          id: message.id,
          content: message.content,
          messageType: message.messageType,
          sentAt: message.sentAt,
          conversationId: this.generateConversationId(senderId, recipientId)
        }
      };

    } catch (error) {
      logger.error('Failed to send direct message:', error);
      throw error;
    }
  }

  /**
   * Send group message (e.g., to all agents at a site)
   */
  async sendGroupMessage(senderId, groupData, messageData) {
    try {
      const { groupType, groupId, recipientIds } = groupData;
      const { content, messageType = 'TEXT', attachments = [], priority = 'NORMAL' } = messageData;

      let recipients = recipientIds;

      // Determine recipients based on group type
      if (groupType && groupId) {
        recipients = await this.getGroupRecipients(groupType, groupId);
      }

      if (!recipients || recipients.length === 0) {
        throw new Error('No recipients found for group message');
      }

      // Create group message record
      const groupMessage = await this.prisma.groupMessage.create({
        data: {
          id: uuidv4(),
          senderId,
          groupType,
          groupId,
          content,
          messageType,
          attachments,
          priority,
          recipientIds: recipients,
          sentAt: new Date()
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              profile: true,
              role: true
            }
          }
        }
      });

      // Create individual message records for each recipient
      const individualMessages = await Promise.all(
        recipients.map(recipientId =>
          this.prisma.message.create({
            data: {
              id: uuidv4(),
              senderId,
              recipientId,
              content,
              messageType,
              attachments,
              priority,
              groupMessageId: groupMessage.id,
              status: 'SENT',
              sentAt: new Date()
            }
          })
        )
      );

      // Send real-time messages via WebSocket
      if (this.io) {
        const messagePayload = {
          id: groupMessage.id,
          senderId: groupMessage.senderId,
          senderName: `${groupMessage.sender.profile?.firstName || ''} ${groupMessage.sender.profile?.lastName || ''}`.trim(),
          senderRole: groupMessage.sender.role,
          content: groupMessage.content,
          messageType: groupMessage.messageType,
          attachments: groupMessage.attachments,
          priority: groupMessage.priority,
          sentAt: groupMessage.sentAt,
          isGroupMessage: true,
          groupType,
          groupId
        };

        recipients.forEach(recipientId => {
          this.io.to(`user:${recipientId}`).emit('new_group_message', messagePayload);
        });
      }

      logger.info('Group message sent', {
        groupMessageId: groupMessage.id,
        senderId,
        groupType,
        groupId,
        recipientCount: recipients.length,
        messageType,
        priority
      });

      return {
        success: true,
        groupMessage: {
          id: groupMessage.id,
          content: groupMessage.content,
          messageType: groupMessage.messageType,
          sentAt: groupMessage.sentAt,
          recipientCount: recipients.length
        }
      };

    } catch (error) {
      logger.error('Failed to send group message:', error);
      throw error;
    }
  }

  /**
   * Send emergency broadcast message
   */
  async sendEmergencyBroadcast(senderId, emergencyData) {
    try {
      const {
        message,
        severity = 'HIGH',
        location,
        affectedSites = [],
        requiresAcknowledgment = true
      } = emergencyData;

      // Get all active users who should receive emergency alerts
      const recipients = await this.getEmergencyRecipients(affectedSites);

      // Create emergency broadcast record
      const emergencyBroadcast = await this.prisma.emergencyBroadcast.create({
        data: {
          id: uuidv4(),
          senderId,
          message,
          severity,
          location,
          affectedSites,
          requiresAcknowledgment,
          recipientIds: recipients.map(r => r.id),
          sentAt: new Date()
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              profile: true,
              role: true
            }
          }
        }
      });

      // Create acknowledgment records if required
      if (requiresAcknowledgment) {
        await Promise.all(
          recipients.map(recipient =>
            this.prisma.emergencyAcknowledgment.create({
              data: {
                id: uuidv4(),
                emergencyBroadcastId: emergencyBroadcast.id,
                userId: recipient.id,
                status: 'PENDING'
              }
            })
          )
        );
      }

      // Send real-time emergency alert via WebSocket
      if (this.io) {
        const alertPayload = {
          id: emergencyBroadcast.id,
          senderId: emergencyBroadcast.senderId,
          senderName: `${emergencyBroadcast.sender.profile?.firstName || ''} ${emergencyBroadcast.sender.profile?.lastName || ''}`.trim(),
          message: emergencyBroadcast.message,
          severity: emergencyBroadcast.severity,
          location: emergencyBroadcast.location,
          sentAt: emergencyBroadcast.sentAt,
          requiresAcknowledgment,
          isEmergency: true
        };

        // Send to all recipients
        recipients.forEach(recipient => {
          this.io.to(`user:${recipient.id}`).emit('emergency_alert', alertPayload);
        });

        // Send to all supervisors and admins regardless of site
        this.io.to('role:supervisor').to('role:admin').emit('emergency_broadcast', alertPayload);
      }

      logger.security('Emergency broadcast sent', {
        emergencyBroadcastId: emergencyBroadcast.id,
        senderId,
        severity,
        recipientCount: recipients.length,
        affectedSites,
        requiresAcknowledgment
      });

      return {
        success: true,
        emergencyBroadcast: {
          id: emergencyBroadcast.id,
          message: emergencyBroadcast.message,
          severity: emergencyBroadcast.severity,
          sentAt: emergencyBroadcast.sentAt,
          recipientCount: recipients.length,
          requiresAcknowledgment
        }
      };

    } catch (error) {
      logger.error('Failed to send emergency broadcast:', error);
      throw error;
    }
  }

  /**
   * Acknowledge emergency message
   */
  async acknowledgeEmergency(emergencyBroadcastId, userId, acknowledgmentData = {}) {
    try {
      const { location, notes, status = 'SAFE' } = acknowledgmentData;

      // Update acknowledgment record
      const acknowledgment = await this.prisma.emergencyAcknowledgment.update({
        where: {
          emergencyBroadcastId_userId: {
            emergencyBroadcastId,
            userId
          }
        },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
          userStatus: status,
          location,
          notes
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: true,
              role: true
            }
          },
          emergencyBroadcast: true
        }
      });

      // Send real-time acknowledgment update
      if (this.io) {
        this.io.to('role:supervisor').to('role:admin').emit('emergency_acknowledgment', {
          emergencyBroadcastId,
          userId,
          userName: `${acknowledgment.user.profile?.firstName || ''} ${acknowledgment.user.profile?.lastName || ''}`.trim(),
          userRole: acknowledgment.user.role,
          status,
          location,
          notes,
          acknowledgedAt: acknowledgment.acknowledgedAt
        });
      }

      logger.info('Emergency acknowledgment received', {
        emergencyBroadcastId,
        userId,
        status,
        acknowledgedAt: acknowledgment.acknowledgedAt
      });

      return {
        success: true,
        acknowledgment: {
          id: acknowledgment.id,
          status,
          acknowledgedAt: acknowledgment.acknowledgedAt,
          location,
          notes
        }
      };

    } catch (error) {
      logger.error('Failed to acknowledge emergency:', error);
      throw error;
    }
  }

  /**
   * Get conversation history between two users
   */
  async getConversationHistory(userId1, userId2, options = {}) {
    try {
      const { limit = 50, offset = 0, before } = options;

      const where = {
        OR: [
          { senderId: userId1, recipientId: userId2 },
          { senderId: userId2, recipientId: userId1 }
        ]
      };

      if (before) {
        where.sentAt = { lt: new Date(before) };
      }

      const messages = await this.prisma.message.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              profile: true,
              role: true
            }
          }
        },
        orderBy: { sentAt: 'desc' },
        take: limit,
        skip: offset
      });

      return {
        success: true,
        messages: messages.reverse(), // Return in chronological order
        conversationId: this.generateConversationId(userId1, userId2),
        hasMore: messages.length === limit
      };

    } catch (error) {
      logger.error('Failed to get conversation history:', error);
      throw error;
    }
  }

  // Helper methods

  generateConversationId(userId1, userId2) {
    const sortedIds = [userId1, userId2].sort();
    return `conv_${sortedIds[0]}_${sortedIds[1]}`;
  }

  async validateCommunicationPermissions(senderId, recipientId) {
    const [sender, recipient] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId },
        select: { id: true, role: true, status: true }
      }),
      this.prisma.user.findUnique({
        where: { id: recipientId },
        select: { id: true, role: true, status: true }
      })
    ]);

    if (!sender || !recipient) {
      throw new Error('Invalid sender or recipient');
    }

    if (sender.status !== 'ACTIVE' || recipient.status !== 'ACTIVE') {
      throw new Error('Both users must be active to communicate');
    }

    // Add additional permission checks based on roles if needed
    return true;
  }

  async getGroupRecipients(groupType, groupId) {
    switch (groupType) {
      case 'SITE':
        // Get all active agents assigned to the site
        const siteAgents = await this.prisma.agent.findMany({
          where: {
            shifts: {
              some: {
                siteId: groupId,
                status: { in: ['SCHEDULED', 'IN_PROGRESS'] }
              }
            },
            employmentStatus: 'ACTIVE'
          },
          select: { userId: true }
        });
        return siteAgents.map(agent => agent.userId);

      case 'SHIFT':
        // Get all agents in the specific shift
        const shift = await this.prisma.shift.findUnique({
          where: { id: groupId },
          select: { agentId: true }
        });
        return shift ? [shift.agentId] : [];

      case 'ROLE':
        // Get all users with specific role
        const roleUsers = await this.prisma.user.findMany({
          where: {
            role: groupId,
            status: 'ACTIVE'
          },
          select: { id: true }
        });
        return roleUsers.map(user => user.id);

      default:
        throw new Error('Invalid group type');
    }
  }

  async getEmergencyRecipients(affectedSites = []) {
    const where = {
      status: 'ACTIVE',
      role: { in: ['ADMIN', 'SUPERVISOR', 'AGENT'] }
    };

    // If specific sites are affected, include agents working at those sites
    if (affectedSites.length > 0) {
      where.OR = [
        { role: { in: ['ADMIN', 'SUPERVISOR'] } }, // Always include admins and supervisors
        {
          role: 'AGENT',
          agent: {
            shifts: {
              some: {
                siteId: { in: affectedSites },
                status: { in: ['SCHEDULED', 'IN_PROGRESS'] }
              }
            }
          }
        }
      ];
    }

    return await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        profile: true,
        role: true
      }
    });
  }
}

module.exports = MessagingService;
