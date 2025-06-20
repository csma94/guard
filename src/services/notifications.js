const logger = require('../config/logger');
const emailService = require('./email');

class NotificationService {
  constructor(prisma, webSocketService) {
    this.prisma = prisma;
    this.webSocketService = webSocketService;
  }

  /**
   * Send notification to user(s)
   */
  async sendNotification(notification) {
    try {
      const {
        recipientId,
        recipientIds,
        type,
        title,
        message,
        data = {},
        priority = 'NORMAL',
        channels = ['IN_APP'],
        scheduledFor,
        expiresAt
      } = notification;

      const recipients = recipientIds || [recipientId];
      const notifications = [];

      for (const userId of recipients) {
        // Create notification record
        const notificationRecord = await this.prisma.notification.create({
          data: {
            recipientId: userId,
            type,
            title,
            message,
            data,
            priority,
            channels,
            status: scheduledFor ? 'SCHEDULED' : 'PENDING',
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            expiresAt: expiresAt ? new Date(expiresAt) : null
          }
        });

        notifications.push(notificationRecord);

        // Send immediately if not scheduled
        if (!scheduledFor) {
          await this.deliverNotification(notificationRecord);
        }
      }

      return notifications;
    } catch (error) {
      logger.error('Failed to send notification:', error);
      throw error;
    }
  }

  /**
   * Deliver notification through specified channels
   */
  async deliverNotification(notification) {
    try {
      const deliveryResults = {};

      for (const channel of notification.channels) {
        try {
          switch (channel) {
            case 'IN_APP':
              await this.deliverInAppNotification(notification);
              deliveryResults[channel] = 'SUCCESS';
              break;
            
            case 'EMAIL':
              await this.deliverEmailNotification(notification);
              deliveryResults[channel] = 'SUCCESS';
              break;
            
            case 'SMS':
              await this.deliverSMSNotification(notification);
              deliveryResults[channel] = 'SUCCESS';
              break;
            
            case 'PUSH':
              await this.deliverPushNotification(notification);
              deliveryResults[channel] = 'SUCCESS';
              break;
            
            default:
              deliveryResults[channel] = 'UNSUPPORTED';
          }
        } catch (error) {
          logger.error(`Failed to deliver notification via ${channel}:`, error);
          deliveryResults[channel] = 'FAILED';
        }
      }

      // Update notification status
      const hasSuccess = Object.values(deliveryResults).includes('SUCCESS');
      const allFailed = Object.values(deliveryResults).every(result => result === 'FAILED');

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: allFailed ? 'FAILED' : hasSuccess ? 'DELIVERED' : 'PARTIAL',
          deliveredAt: hasSuccess ? new Date() : null,
          deliveryResults
        }
      });

      return deliveryResults;
    } catch (error) {
      logger.error('Failed to deliver notification:', error);
      throw error;
    }
  }

  /**
   * Deliver in-app notification via WebSocket
   */
  async deliverInAppNotification(notification) {
    if (!this.webSocketService) {
      throw new Error('WebSocket service not available');
    }

    const notificationData = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      priority: notification.priority,
      timestamp: notification.createdAt.toISOString()
    };

    this.webSocketService.sendToUser(notification.recipientId, 'notification', notificationData);
  }

  /**
   * Deliver email notification
   */
  async deliverEmailNotification(notification) {
    const user = await this.prisma.user.findUnique({
      where: { id: notification.recipientId },
      select: { email: true, profile: true }
    });

    if (!user?.email) {
      throw new Error('User email not found');
    }

    const emailData = {
      to: user.email,
      subject: notification.title,
      template: this.getEmailTemplate(notification.type),
      data: {
        name: user.profile?.firstName || 'User',
        title: notification.title,
        message: notification.message,
        ...notification.data
      }
    };

    await emailService.sendEmail(emailData);
  }

  /**
   * Deliver SMS notification
   */
  async deliverSMSNotification(notification) {
    const user = await this.prisma.user.findUnique({
      where: { id: notification.recipientId },
      select: { profile: true }
    });

    const phoneNumber = user?.profile?.phoneNumber;
    if (!phoneNumber) {
      throw new Error('User phone number not found');
    }

    // SMS implementation would go here
    // For now, we'll just log it
    logger.info('SMS notification:', {
      to: phoneNumber,
      message: `${notification.title}: ${notification.message}`
    });
  }

  /**
   * Deliver push notification
   */
  async deliverPushNotification(notification) {
    // Get user's device tokens
    const deviceTokens = await this.prisma.deviceToken.findMany({
      where: {
        userId: notification.recipientId,
        isActive: true
      }
    });

    if (deviceTokens.length === 0) {
      throw new Error('No active device tokens found');
    }

    // Push notification implementation would go here
    // For now, we'll just log it
    logger.info('Push notification:', {
      tokens: deviceTokens.map(t => t.token),
      title: notification.title,
      body: notification.message,
      data: notification.data
    });
  }

  /**
   * Get email template for notification type
   */
  getEmailTemplate(type) {
    const templates = {
      'SHIFT_ASSIGNED': 'shift-assigned',
      'SHIFT_REMINDER': 'shift-reminder',
      'SHIFT_CANCELLED': 'shift-cancelled',
      'REPORT_SUBMITTED': 'report-submitted',
      'REPORT_APPROVED': 'report-approved',
      'EMERGENCY_ALERT': 'emergency-alert',
      'SYSTEM_MAINTENANCE': 'system-maintenance',
      'PASSWORD_RESET': 'password-reset',
      'ACCOUNT_CREATED': 'account-created'
    };

    return templates[type] || 'default';
  }

  /**
   * Send shift-related notifications
   */
  async sendShiftNotification(shiftId, type, additionalData = {}) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        agent: { include: { user: true } },
        site: { include: { client: true } },
        supervisor: { include: { user: true } }
      }
    });

    if (!shift) {
      throw new Error('Shift not found');
    }

    const notifications = [];

    switch (type) {
      case 'SHIFT_ASSIGNED':
        notifications.push({
          recipientId: shift.agent.userId,
          type: 'SHIFT_ASSIGNED',
          title: 'New Shift Assigned',
          message: `You have been assigned to a shift at ${shift.site.name}`,
          data: {
            shiftId: shift.id,
            siteName: shift.site.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            ...additionalData
          },
          channels: ['IN_APP', 'EMAIL', 'PUSH']
        });
        break;

      case 'SHIFT_REMINDER':
        notifications.push({
          recipientId: shift.agent.userId,
          type: 'SHIFT_REMINDER',
          title: 'Shift Reminder',
          message: `Your shift at ${shift.site.name} starts in 1 hour`,
          data: {
            shiftId: shift.id,
            siteName: shift.site.name,
            startTime: shift.startTime,
            ...additionalData
          },
          channels: ['IN_APP', 'PUSH']
        });
        break;

      case 'SHIFT_STARTED':
        // Notify supervisors and client
        if (shift.supervisor) {
          notifications.push({
            recipientId: shift.supervisor.userId,
            type: 'SHIFT_STARTED',
            title: 'Shift Started',
            message: `${shift.agent.user.profile?.firstName} has started their shift at ${shift.site.name}`,
            data: {
              shiftId: shift.id,
              agentName: `${shift.agent.user.profile?.firstName} ${shift.agent.user.profile?.lastName}`,
              siteName: shift.site.name,
              ...additionalData
            },
            channels: ['IN_APP']
          });
        }
        break;

      case 'SHIFT_COMPLETED':
        // Notify supervisors and client
        const recipients = [];
        if (shift.supervisor) recipients.push(shift.supervisor.userId);
        
        notifications.push({
          recipientIds: recipients,
          type: 'SHIFT_COMPLETED',
          title: 'Shift Completed',
          message: `Shift at ${shift.site.name} has been completed`,
          data: {
            shiftId: shift.id,
            agentName: `${shift.agent.user.profile?.firstName} ${shift.agent.user.profile?.lastName}`,
            siteName: shift.site.name,
            ...additionalData
          },
          channels: ['IN_APP', 'EMAIL']
        });
        break;
    }

    // Send all notifications
    for (const notification of notifications) {
      await this.sendNotification(notification);
    }

    return notifications;
  }

  /**
   * Send report-related notifications
   */
  async sendReportNotification(reportId, type, additionalData = {}) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        agent: { include: { user: true } },
        site: { include: { client: true } },
        shift: { include: { supervisor: { include: { user: true } } } }
      }
    });

    if (!report) {
      throw new Error('Report not found');
    }

    const notifications = [];

    switch (type) {
      case 'REPORT_SUBMITTED':
        // Notify supervisors
        if (report.shift?.supervisor) {
          notifications.push({
            recipientId: report.shift.supervisor.userId,
            type: 'REPORT_SUBMITTED',
            title: 'New Report Submitted',
            message: `${report.agent.user.profile?.firstName} submitted a ${report.reportType} report`,
            data: {
              reportId: report.id,
              reportType: report.reportType,
              agentName: `${report.agent.user.profile?.firstName} ${report.agent.user.profile?.lastName}`,
              siteName: report.site.name,
              ...additionalData
            },
            channels: ['IN_APP', 'EMAIL']
          });
        }
        break;

      case 'REPORT_APPROVED':
        notifications.push({
          recipientId: report.agent.userId,
          type: 'REPORT_APPROVED',
          title: 'Report Approved',
          message: `Your ${report.reportType} report has been approved`,
          data: {
            reportId: report.id,
            reportType: report.reportType,
            siteName: report.site.name,
            ...additionalData
          },
          channels: ['IN_APP']
        });
        break;

      case 'REPORT_REJECTED':
        notifications.push({
          recipientId: report.agent.userId,
          type: 'REPORT_REJECTED',
          title: 'Report Requires Changes',
          message: `Your ${report.reportType} report needs revision`,
          data: {
            reportId: report.id,
            reportType: report.reportType,
            siteName: report.site.name,
            reviewerNotes: additionalData.reviewerNotes,
            ...additionalData
          },
          channels: ['IN_APP', 'EMAIL']
        });
        break;
    }

    // Send all notifications
    for (const notification of notifications) {
      await this.sendNotification(notification);
    }

    return notifications;
  }

  /**
   * Send emergency alert notifications
   */
  async sendEmergencyAlert(alertData) {
    // Get all supervisors and admins
    const supervisorsAndAdmins = await this.prisma.user.findMany({
      where: {
        role: { in: ['SUPERVISOR', 'ADMIN'] },
        isActive: true
      }
    });

    const notifications = [];

    for (const user of supervisorsAndAdmins) {
      notifications.push({
        recipientId: user.id,
        type: 'EMERGENCY_ALERT',
        title: 'EMERGENCY ALERT',
        message: alertData.message,
        data: {
          alertId: alertData.id,
          agentName: alertData.agentName,
          location: alertData.location,
          severity: alertData.severity,
          timestamp: alertData.timestamp
        },
        priority: 'CRITICAL',
        channels: ['IN_APP', 'EMAIL', 'SMS', 'PUSH']
      });
    }

    // Send all notifications
    for (const notification of notifications) {
      await this.sendNotification(notification);
    }

    return notifications;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    const notification = await this.prisma.notification.update({
      where: {
        id: notificationId,
        recipientId: userId
      },
      data: {
        readAt: new Date(),
        status: 'READ'
      }
    });

    return notification;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientId: userId,
        readAt: null
      },
      data: {
        readAt: new Date(),
        status: 'READ'
      }
    });

    return result;
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      unreadOnly = false,
      type,
      priority
    } = options;

    const where = {
      recipientId: userId,
      ...(unreadOnly && { readAt: null }),
      ...(type && { type }),
      ...(priority && { priority })
    };

    const [notifications, totalCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.notification.count({ where })
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId) {
    const count = await this.prisma.notification.count({
      where: {
        recipientId: userId,
        readAt: null
      }
    });

    return count;
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId, userId) {
    const notification = await this.prisma.notification.delete({
      where: {
        id: notificationId,
        recipientId: userId
      }
    });

    return notification;
  }

  /**
   * Process scheduled notifications
   */
  async processScheduledNotifications() {
    const now = new Date();
    
    const scheduledNotifications = await this.prisma.notification.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledFor: { lte: now }
      }
    });

    for (const notification of scheduledNotifications) {
      try {
        await this.deliverNotification(notification);
      } catch (error) {
        logger.error(`Failed to deliver scheduled notification ${notification.id}:`, error);
      }
    }

    return scheduledNotifications.length;
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpiredNotifications() {
    const now = new Date();
    
    const result = await this.prisma.notification.deleteMany({
      where: {
        expiresAt: { lt: now }
      }
    });

    return result.count;
  }
}

module.exports = NotificationService;
