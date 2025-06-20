const { v4: uuidv4 } = require('uuid');
const Redis = require('redis');
const Bull = require('bull');

const logger = require('../config/logger');
const config = require('../config');

class MessageQueueService {
  constructor(prisma, webSocketService, notificationService) {
    this.prisma = prisma;
    this.webSocketService = webSocketService;
    this.notificationService = notificationService;
    
    // Initialize Redis client
    this.redisClient = Redis.createClient({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      enableOfflineQueue: false,
    });

    // Initialize Bull queues
    this.messageQueue = new Bull('message processing', {
      redis: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
      },
    });

    this.notificationQueue = new Bull('notification processing', {
      redis: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
      },
    });

    this.emergencyQueue = new Bull('emergency alerts', {
      redis: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
      },
    });

    this.setupQueueProcessors();
    this.setupQueueEvents();
  }

  /**
   * Setup queue processors
   */
  setupQueueProcessors() {
    // Message processing
    this.messageQueue.process('send_message', async (job) => {
      return await this.processMessage(job.data);
    });

    this.messageQueue.process('send_group_message', async (job) => {
      return await this.processGroupMessage(job.data);
    });

    this.messageQueue.process('retry_failed_message', async (job) => {
      return await this.retryFailedMessage(job.data);
    });

    // Notification processing
    this.notificationQueue.process('send_notification', async (job) => {
      return await this.processNotification(job.data);
    });

    this.notificationQueue.process('send_bulk_notification', async (job) => {
      return await this.processBulkNotification(job.data);
    });

    // Emergency alerts
    this.emergencyQueue.process('emergency_alert', async (job) => {
      return await this.processEmergencyAlert(job.data);
    });
  }

  /**
   * Setup queue event handlers
   */
  setupQueueEvents() {
    // Message queue events
    this.messageQueue.on('completed', (job, result) => {
      logger.info(`Message job ${job.id} completed:`, result);
    });

    this.messageQueue.on('failed', (job, err) => {
      logger.error(`Message job ${job.id} failed:`, err);
      this.handleFailedMessage(job.data, err);
    });

    // Notification queue events
    this.notificationQueue.on('completed', (job, result) => {
      logger.info(`Notification job ${job.id} completed:`, result);
    });

    this.notificationQueue.on('failed', (job, err) => {
      logger.error(`Notification job ${job.id} failed:`, err);
    });

    // Emergency queue events
    this.emergencyQueue.on('completed', (job, result) => {
      logger.info(`Emergency alert job ${job.id} completed:`, result);
    });

    this.emergencyQueue.on('failed', (job, err) => {
      logger.error(`Emergency alert job ${job.id} failed:`, err);
    });
  }

  /**
   * Queue a message for processing
   */
  async queueMessage(messageData, options = {}) {
    try {
      const {
        priority = 'normal',
        delay = 0,
        attempts = 3,
        backoff = 'exponential',
      } = options;

      const job = await this.messageQueue.add('send_message', messageData, {
        priority: this.getPriorityValue(priority),
        delay,
        attempts,
        backoff,
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      logger.info(`Message queued with job ID: ${job.id}`);
      return job;
    } catch (error) {
      logger.error('Failed to queue message:', error);
      throw error;
    }
  }

  /**
   * Queue a group message for processing
   */
  async queueGroupMessage(groupMessageData, options = {}) {
    try {
      const job = await this.messageQueue.add('send_group_message', groupMessageData, {
        priority: this.getPriorityValue(options.priority || 'normal'),
        attempts: 3,
        backoff: 'exponential',
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      return job;
    } catch (error) {
      logger.error('Failed to queue group message:', error);
      throw error;
    }
  }

  /**
   * Queue emergency alert
   */
  async queueEmergencyAlert(alertData, options = {}) {
    try {
      const job = await this.emergencyQueue.add('emergency_alert', alertData, {
        priority: 1, // Highest priority
        attempts: 5,
        backoff: 'fixed',
        removeOnComplete: 200,
        removeOnFail: 100,
      });

      return job;
    } catch (error) {
      logger.error('Failed to queue emergency alert:', error);
      throw error;
    }
  }

  /**
   * Process individual message
   */
  async processMessage(messageData) {
    try {
      const {
        senderId,
        recipientId,
        message,
        messageType = 'TEXT',
        priority = 'NORMAL',
        metadata = {},
      } = messageData;

      // Create message record
      const messageRecord = await this.prisma.message.create({
        data: {
          id: uuidv4(),
          senderId,
          recipientId,
          message,
          messageType,
          priority,
          metadata,
          status: 'SENT',
          deliveredAt: new Date(),
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

      // Send via WebSocket if recipient is online
      const isRecipientOnline = this.webSocketService.isUserOnline(recipientId);
      if (isRecipientOnline) {
        this.webSocketService.sendToUser(recipientId, 'new_message', {
          id: messageRecord.id,
          senderId,
          sender: messageRecord.sender,
          message,
          messageType,
          priority,
          timestamp: messageRecord.createdAt,
          metadata,
        });

        // Update message status to delivered
        await this.prisma.message.update({
          where: { id: messageRecord.id },
          data: { status: 'DELIVERED' },
        });
      } else {
        // Queue for offline delivery
        await this.queueOfflineMessage(messageRecord);
      }

      // Send push notification if high priority or recipient is offline
      if (priority === 'HIGH' || priority === 'URGENT' || !isRecipientOnline) {
        await this.notificationService.sendNotification({
          recipientId,
          type: 'MESSAGE',
          title: `New message from ${messageRecord.sender.username}`,
          message: message.length > 50 ? `${message.substring(0, 50)}...` : message,
          data: {
            messageId: messageRecord.id,
            senderId,
            messageType,
          },
          channels: ['PUSH'],
          priority,
        });
      }

      return {
        messageId: messageRecord.id,
        status: 'processed',
        delivered: isRecipientOnline,
      };
    } catch (error) {
      logger.error('Failed to process message:', error);
      throw error;
    }
  }

  /**
   * Process group message
   */
  async processGroupMessage(groupMessageData) {
    try {
      const {
        senderId,
        groupId,
        message,
        messageType = 'TEXT',
        priority = 'NORMAL',
        metadata = {},
      } = groupMessageData;

      // Get group members
      const group = await this.prisma.messageGroup.findUnique({
        where: { id: groupId },
        include: {
          members: {
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
      });

      if (!group) {
        throw new Error('Group not found');
      }

      // Create group message record
      const groupMessageRecord = await this.prisma.groupMessage.create({
        data: {
          id: uuidv4(),
          senderId,
          groupId,
          message,
          messageType,
          priority,
          metadata,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              profile: true,
            },
          },
        },
      });

      // Send to all group members except sender
      const recipients = group.members
        .filter(member => member.userId !== senderId)
        .map(member => member.user);

      const deliveryResults = [];

      for (const recipient of recipients) {
        try {
          // Send via WebSocket if online
          const isOnline = this.webSocketService.isUserOnline(recipient.id);
          if (isOnline) {
            this.webSocketService.sendToUser(recipient.id, 'new_group_message', {
              id: groupMessageRecord.id,
              groupId,
              groupName: group.name,
              senderId,
              sender: groupMessageRecord.sender,
              message,
              messageType,
              priority,
              timestamp: groupMessageRecord.createdAt,
              metadata,
            });

            deliveryResults.push({
              recipientId: recipient.id,
              status: 'delivered',
              method: 'websocket',
            });
          } else {
            // Queue for offline delivery
            await this.queueOfflineGroupMessage(groupMessageRecord, recipient.id);
            
            deliveryResults.push({
              recipientId: recipient.id,
              status: 'queued',
              method: 'offline',
            });
          }

          // Send push notification for high priority messages
          if (priority === 'HIGH' || priority === 'URGENT') {
            await this.notificationService.sendNotification({
              recipientId: recipient.id,
              type: 'GROUP_MESSAGE',
              title: `${group.name}: ${groupMessageRecord.sender.username}`,
              message: message.length > 50 ? `${message.substring(0, 50)}...` : message,
              data: {
                groupMessageId: groupMessageRecord.id,
                groupId,
                senderId,
                messageType,
              },
              channels: ['PUSH'],
              priority,
            });
          }
        } catch (error) {
          logger.error(`Failed to deliver group message to ${recipient.id}:`, error);
          deliveryResults.push({
            recipientId: recipient.id,
            status: 'failed',
            error: error.message,
          });
        }
      }

      return {
        groupMessageId: groupMessageRecord.id,
        recipientCount: recipients.length,
        deliveryResults,
      };
    } catch (error) {
      logger.error('Failed to process group message:', error);
      throw error;
    }
  }

  /**
   * Process emergency alert
   */
  async processEmergencyAlert(alertData) {
    try {
      const {
        senderId,
        alertType,
        message,
        location,
        severity = 'HIGH',
        metadata = {},
      } = alertData;

      // Create emergency alert record
      const alertRecord = await this.prisma.emergencyAlert.create({
        data: {
          id: uuidv4(),
          senderId,
          alertType,
          message,
          location,
          severity,
          metadata,
          status: 'ACTIVE',
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              profile: true,
            },
          },
        },
      });

      // Get all supervisors and admins
      const emergencyContacts = await this.prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SUPERVISOR'] },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          username: true,
          profile: true,
          email: true,
        },
      });

      // Broadcast emergency alert
      const alertMessage = {
        id: alertRecord.id,
        senderId,
        sender: alertRecord.sender,
        alertType,
        message,
        location,
        severity,
        timestamp: alertRecord.createdAt,
        metadata,
      };

      // Send via WebSocket to all emergency contacts
      for (const contact of emergencyContacts) {
        this.webSocketService.sendToUser(contact.id, 'emergency_alert', alertMessage);
      }

      // Broadcast to all supervisors and admins
      this.webSocketService.broadcastToRole('SUPERVISOR', 'emergency_alert', alertMessage);
      this.webSocketService.broadcastToRole('ADMIN', 'emergency_alert', alertMessage);

      // Send push notifications to all emergency contacts
      await this.notificationService.sendNotification({
        recipientIds: emergencyContacts.map(c => c.id),
        type: 'EMERGENCY',
        title: `🚨 EMERGENCY ALERT: ${alertType}`,
        message,
        data: {
          alertId: alertRecord.id,
          alertType,
          senderId,
          location,
          severity,
        },
        channels: ['PUSH', 'EMAIL', 'SMS'],
        priority: 'URGENT',
      });

      // Log emergency alert
      logger.warn('Emergency alert processed:', {
        alertId: alertRecord.id,
        senderId,
        alertType,
        severity,
        recipientCount: emergencyContacts.length,
      });

      return {
        alertId: alertRecord.id,
        status: 'processed',
        recipientCount: emergencyContacts.length,
      };
    } catch (error) {
      logger.error('Failed to process emergency alert:', error);
      throw error;
    }
  }

  /**
   * Queue message for offline delivery
   */
  async queueOfflineMessage(messageRecord) {
    try {
      await this.redisClient.lpush(
        `offline_messages:${messageRecord.recipientId}`,
        JSON.stringify({
          id: messageRecord.id,
          senderId: messageRecord.senderId,
          message: messageRecord.message,
          messageType: messageRecord.messageType,
          priority: messageRecord.priority,
          timestamp: messageRecord.createdAt,
          metadata: messageRecord.metadata,
        })
      );

      // Set expiration for offline messages (7 days)
      await this.redisClient.expire(`offline_messages:${messageRecord.recipientId}`, 7 * 24 * 60 * 60);
    } catch (error) {
      logger.error('Failed to queue offline message:', error);
    }
  }

  /**
   * Get offline messages for user
   */
  async getOfflineMessages(userId) {
    try {
      const messages = await this.redisClient.lrange(`offline_messages:${userId}`, 0, -1);
      const parsedMessages = messages.map(msg => JSON.parse(msg));
      
      // Clear offline messages after retrieval
      await this.redisClient.del(`offline_messages:${userId}`);
      
      return parsedMessages;
    } catch (error) {
      logger.error('Failed to get offline messages:', error);
      return [];
    }
  }

  /**
   * Handle failed message
   */
  async handleFailedMessage(messageData, error) {
    try {
      // Log failure
      logger.error('Message delivery failed:', {
        messageData,
        error: error.message,
      });

      // Update message status if it exists
      if (messageData.messageId) {
        await this.prisma.message.update({
          where: { id: messageData.messageId },
          data: {
            status: 'FAILED',
            failureReason: error.message,
          },
        });
      }

      // Queue for retry if appropriate
      if (this.shouldRetryMessage(error)) {
        await this.messageQueue.add('retry_failed_message', messageData, {
          delay: 60000, // Retry after 1 minute
          attempts: 2,
        });
      }
    } catch (retryError) {
      logger.error('Failed to handle failed message:', retryError);
    }
  }

  /**
   * Determine if message should be retried
   */
  shouldRetryMessage(error) {
    // Retry on temporary failures, not on permanent ones
    const retryableErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'Network error',
    ];

    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    );
  }

  /**
   * Get priority value for Bull queue
   */
  getPriorityValue(priority) {
    const priorities = {
      low: 10,
      normal: 0,
      high: -5,
      urgent: -10,
    };
    return priorities[priority.toLowerCase()] || 0;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    try {
      const [messageStats, notificationStats, emergencyStats] = await Promise.all([
        this.messageQueue.getJobCounts(),
        this.notificationQueue.getJobCounts(),
        this.emergencyQueue.getJobCounts(),
      ]);

      return {
        messageQueue: messageStats,
        notificationQueue: notificationStats,
        emergencyQueue: emergencyStats,
      };
    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      return null;
    }
  }

  /**
   * Clean up completed jobs
   */
  async cleanupJobs() {
    try {
      await Promise.all([
        this.messageQueue.clean(24 * 60 * 60 * 1000, 'completed'),
        this.messageQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'),
        this.notificationQueue.clean(24 * 60 * 60 * 1000, 'completed'),
        this.notificationQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'),
        this.emergencyQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed'),
        this.emergencyQueue.clean(30 * 24 * 60 * 60 * 1000, 'failed'),
      ]);

      logger.info('Queue cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup jobs:', error);
    }
  }
}

module.exports = MessageQueueService;
