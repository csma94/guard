const logger = require('../config/logger');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const admin = require('firebase-admin');

/**
 * Comprehensive notification service for real-time and scheduled notifications
 */
class NotificationService {
  constructor(prisma, io) {
    this.prisma = prisma;
    this.io = io;
    this.channels = {
      PUSH: this.sendPushNotification.bind(this),
      EMAIL: this.sendEmailNotification.bind(this),
      SMS: this.sendSMSNotification.bind(this),
      IN_APP: this.sendInAppNotification.bind(this),
      WEBSOCKET: this.sendWebSocketNotification.bind(this)
    };

    // Initialize external services
    this.initializeServices();
  }

  /**
   * Initialize external notification services
   */
  initializeServices() {
    // Initialize Twilio for SMS
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }

    // Initialize Nodemailer for Email
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }

    // Initialize Firebase for Push Notifications
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        this.firebaseMessaging = admin.messaging();
      } catch (error) {
        logger.error('Failed to initialize Firebase:', error);
      }
    }
  }

  /**
   * Send notification through specified channels
   */
  async sendNotification(notificationData) {
    try {
      const {
        recipientId,
        senderId = null,
        type,
        title,
        message,
        data = {},
        channels = ['IN_APP'],
        priority = 'NORMAL',
        scheduledAt = new Date()
      } = notificationData;

      // Create notification record
      const notification = await this.prisma.notification.create({
        data: {
          recipientId,
          senderId,
          type,
          title,
          message,
          data,
          channels,
          status: 'PENDING',
          scheduledAt
        },
        include: {
          recipient: {
            select: {
              id: true,
              username: true,
              email: true,
              profile: true,
              preferences: true
            }
          },
          sender: {
            select: {
              id: true,
              username: true,
              profile: true
            }
          }
        }
      });

      // Send through each channel
      const results = {};
      for (const channel of channels) {
        if (this.channels[channel]) {
          try {
            results[channel] = await this.channels[channel](notification);
          } catch (error) {
            logger.error(`Failed to send ${channel} notification:`, error);
            results[channel] = { success: false, error: error.message };
          }
        }
      }

      // Update notification status
      const allSuccessful = Object.values(results).every(result => result.success);
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: allSuccessful ? 'SENT' : 'FAILED',
          sentAt: allSuccessful ? new Date() : null
        }
      });

      logger.info('Notification sent', {
        notificationId: notification.id,
        recipientId,
        type,
        channels,
        results
      });

      return {
        success: allSuccessful,
        notification,
        results
      };

    } catch (error) {
      logger.error('Failed to send notification:', error);
      throw error;
    }
  }

  /**
   * Send push notification
   */
  async sendPushNotification(notification) {
    try {
      if (!this.firebaseMessaging) {
        logger.warn('Firebase not configured, skipping push notification');
        return { success: false, error: 'Firebase not configured' };
      }

      // Get user's device tokens
      const deviceTokens = await this.getUserDeviceTokens(notification.recipientId);

      if (deviceTokens.length === 0) {
        logger.warn('No device tokens found for user', { userId: notification.recipientId });
        return { success: false, error: 'No device tokens found' };
      }

      const message = {
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: {
          type: notification.type,
          notificationId: notification.id,
          ...notification.data
        },
        tokens: deviceTokens
      };

      const response = await this.firebaseMessaging.sendMulticast(message);

      logger.info('Push notification sent', {
        recipientId: notification.recipientId,
        successCount: response.successCount,
        failureCount: response.failureCount
      });

      // Clean up invalid tokens
      if (response.failureCount > 0) {
        await this.cleanupInvalidTokens(notification.recipientId, response.responses, deviceTokens);
      }

      return {
        success: response.successCount > 0,
        method: 'PUSH',
        successCount: response.successCount,
        failureCount: response.failureCount
      };
    } catch (error) {
      logger.error('Push notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(notification) {
    try {
      if (!this.emailTransporter) {
        logger.warn('Email transporter not configured, skipping email notification');
        return { success: false, error: 'Email service not configured' };
      }

      if (!notification.recipient.email) {
        logger.warn('Recipient email not available', { userId: notification.recipientId });
        return { success: false, error: 'Recipient email not available' };
      }

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: notification.recipient.email,
        subject: notification.title,
        html: this.generateEmailTemplate(notification),
        text: notification.message
      };

      const result = await this.emailTransporter.sendMail(mailOptions);

      logger.info('Email notification sent', {
        recipientEmail: notification.recipient.email,
        messageId: result.messageId
      });

      return {
        success: true,
        method: 'EMAIL',
        messageId: result.messageId
      };
    } catch (error) {
      logger.error('Email notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS notification
   */
  async sendSMSNotification(notification) {
    try {
      if (!this.twilioClient) {
        logger.warn('Twilio not configured, skipping SMS notification');
        return { success: false, error: 'SMS service not configured' };
      }

      const phoneNumber = notification.recipient.profile?.phoneNumber;
      if (!phoneNumber) {
        logger.warn('Recipient phone number not available', { userId: notification.recipientId });
        return { success: false, error: 'Recipient phone number not available' };
      }

      const message = await this.twilioClient.messages.create({
        body: `${notification.title}\n\n${notification.message}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });

      logger.info('SMS notification sent', {
        recipientPhone: phoneNumber,
        messageSid: message.sid
      });

      return {
        success: true,
        method: 'SMS',
        messageSid: message.sid
      };
    } catch (error) {
      logger.error('SMS notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send in-app notification
   */
  async sendInAppNotification(notification) {
    try {
      // In-app notifications are stored in database and retrieved by client
      return { success: true, method: 'IN_APP' };
    } catch (error) {
      logger.error('In-app notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send WebSocket notification for real-time updates
   */
  async sendWebSocketNotification(notification) {
    try {
      if (this.io) {
        this.io.to(`user:${notification.recipientId}`).emit('notification', {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          timestamp: notification.scheduledAt
        });
      }

      return { success: true, method: 'WEBSOCKET' };
    } catch (error) {
      logger.error('WebSocket notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        unreadOnly = false,
        type = null
      } = options;

      const where = {
        recipientId: userId
      };

      if (unreadOnly) {
        where.readAt = null;
      }

      if (type) {
        where.type = type;
      }

      const notifications = await this.prisma.notification.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              profile: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      });

      const unreadCount = await this.prisma.notification.count({
        where: {
          recipientId: userId,
          readAt: null
        }
      });

      return {
        notifications,
        unreadCount,
        total: notifications.length
      };

    } catch (error) {
      logger.error('Failed to get user notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    try {
      const notification = await this.prisma.notification.update({
        where: {
          id: notificationId,
          recipientId: userId
        },
        data: {
          readAt: new Date()
        }
      });

      return notification;
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    try {
      const result = await this.prisma.notification.updateMany({
        where: {
          recipientId: userId,
          readAt: null
        },
        data: {
          readAt: new Date()
        }
      });

      return result;
    } catch (error) {
      logger.error('Failed to mark all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(recipientIds, notificationData) {
    try {
      const results = [];

      for (const recipientId of recipientIds) {
        try {
          const result = await this.sendNotification({
            ...notificationData,
            recipientId
          });
          results.push({ recipientId, success: true, result });
        } catch (error) {
          results.push({ recipientId, success: false, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      logger.info('Bulk notifications sent', {
        total: results.length,
        successful: successCount,
        failed: failureCount
      });

      return {
        total: results.length,
        successful: successCount,
        failed: failureCount,
        results
      };

    } catch (error) {
      logger.error('Failed to send bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Send emergency alert to all active agents
   */
  async sendEmergencyAlert(alertData) {
    try {
      const {
        title,
        message,
        location,
        severity = 'HIGH',
        senderId
      } = alertData;

      // Get all active agents
      const activeAgents = await this.prisma.user.findMany({
        where: {
          role: 'AGENT',
          status: 'ACTIVE',
          agent: {
            employmentStatus: 'ACTIVE'
          }
        },
        select: {
          id: true
        }
      });

      const recipientIds = activeAgents.map(agent => agent.id);

      // Send emergency notification through all channels
      const result = await this.sendBulkNotifications(recipientIds, {
        senderId,
        type: 'EMERGENCY_ALERT',
        title,
        message,
        data: {
          location,
          severity,
          timestamp: new Date()
        },
        channels: ['PUSH', 'SMS', 'IN_APP', 'WEBSOCKET'],
        priority: 'CRITICAL'
      });

      logger.audit('emergency_alert_sent', {
        senderId,
        recipientCount: recipientIds.length,
        severity,
        location
      });

      return result;

    } catch (error) {
      logger.error('Failed to send emergency alert:', error);
      throw error;
    }
  }

  // Helper methods

  /**
   * Get user device tokens for push notifications
   */
  async getUserDeviceTokens(userId) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          deviceTokens: true
        }
      });

      return user?.deviceTokens || [];
    } catch (error) {
      logger.error('Failed to get user device tokens:', error);
      return [];
    }
  }

  /**
   * Clean up invalid device tokens
   */
  async cleanupInvalidTokens(userId, responses, tokens) {
    try {
      const invalidTokens = [];

      responses.forEach((response, index) => {
        if (!response.success &&
            (response.error?.code === 'messaging/invalid-registration-token' ||
             response.error?.code === 'messaging/registration-token-not-registered')) {
          invalidTokens.push(tokens[index]);
        }
      });

      if (invalidTokens.length > 0) {
        // Remove invalid tokens from user record
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { deviceTokens: true }
        });

        const validTokens = (user?.deviceTokens || []).filter(
          token => !invalidTokens.includes(token)
        );

        await this.prisma.user.update({
          where: { id: userId },
          data: { deviceTokens: validTokens }
        });

        logger.info('Cleaned up invalid device tokens', {
          userId,
          removedCount: invalidTokens.length
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup invalid tokens:', error);
    }
  }

  /**
   * Generate HTML email template
   */
  generateEmailTemplate(notification) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${notification.title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
          .header { background-color: #2c3e50; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px; }
          .content { line-height: 1.6; color: #333; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${notification.title}</h1>
          </div>
          <div class="content">
            <p>${notification.message.replace(/\n/g, '<br>')}</p>
            ${notification.data?.actionUrl ? `<p><a href="${notification.data.actionUrl}" style="background-color: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View Details</a></p>` : ''}
          </div>
          <div class="footer">
            <p>This is an automated message from BahinLink Security Workforce Management System.</p>
            <p>If you have any questions, please contact support.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = NotificationService;
