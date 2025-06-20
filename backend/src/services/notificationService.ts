import { PrismaClient } from '@prisma/client';
import { Server as SocketIOServer } from 'socket.io';
import { integrationService } from './integrationService';
import { EventEmitter } from 'events';

const prisma = new PrismaClient();

export interface NotificationData {
  type: 'SYSTEM' | 'SECURITY' | 'INCIDENT' | 'SHIFT' | 'TRAINING' | 'MAINTENANCE' | 'BILLING';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'CRITICAL';
  title: string;
  message: string;
  recipientId?: string;
  recipientRole?: string;
  senderId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionUrl?: string;
  expiresAt?: Date;
  channels: ('EMAIL' | 'SMS' | 'PUSH' | 'IN_APP')[];
  metadata?: any;
}

export class NotificationService extends EventEmitter {
  private static instance: NotificationService;
  private io: SocketIOServer | null = null;
  private connectedUsers: Map<string, string[]> = new Map(); // userId -> socketIds

  private constructor() {
    super();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public setSocketIO(io: SocketIOServer) {
    this.io = io;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('authenticate', (data) => {
        const { userId, token } = data;
        // Verify token and associate socket with user
        this.associateUserSocket(userId, socket.id);
        socket.join(`user:${userId}`);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        this.removeUserSocket(socket.id);
      });

      socket.on('mark_notification_read', async (notificationId) => {
        try {
          await this.markAsRead(notificationId);
          socket.emit('notification_marked_read', { notificationId });
        } catch (error) {
          socket.emit('error', { message: 'Failed to mark notification as read' });
        }
      });
    });
  }

  private associateUserSocket(userId: string, socketId: string) {
    const userSockets = this.connectedUsers.get(userId) || [];
    userSockets.push(socketId);
    this.connectedUsers.set(userId, userSockets);
  }

  private removeUserSocket(socketId: string) {
    for (const [userId, socketIds] of this.connectedUsers.entries()) {
      const index = socketIds.indexOf(socketId);
      if (index !== -1) {
        socketIds.splice(index, 1);
        if (socketIds.length === 0) {
          this.connectedUsers.delete(userId);
        } else {
          this.connectedUsers.set(userId, socketIds);
        }
        break;
      }
    }
  }

  // Send notification to specific user
  public async sendNotification(data: NotificationData): Promise<string> {
    try {
      // Create notification record
      const notification = await prisma.notification.create({
        data: {
          type: data.type,
          priority: data.priority,
          title: data.title,
          message: data.message,
          recipientId: data.recipientId,
          senderId: data.senderId,
          relatedEntityType: data.relatedEntityType,
          relatedEntityId: data.relatedEntityId,
          actionUrl: data.actionUrl,
          expiresAt: data.expiresAt,
          isRead: false,
          metadata: data.metadata,
        },
      });

      // Send through various channels
      await this.deliverNotification(notification, data.channels);

      this.emit('notification.sent', { notificationId: notification.id, data });
      return notification.id;
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw new Error('Failed to send notification');
    }
  }

  // Send notification to multiple users by role
  public async sendBulkNotification(data: NotificationData & { recipientRole: string }): Promise<string[]> {
    try {
      // Get users by role
      const users = await prisma.user.findMany({
        where: { role: data.recipientRole },
        select: { id: true, email: true, phone: true },
      });

      const notificationIds: string[] = [];

      for (const user of users) {
        const notification = await prisma.notification.create({
          data: {
            type: data.type,
            priority: data.priority,
            title: data.title,
            message: data.message,
            recipientId: user.id,
            senderId: data.senderId,
            relatedEntityType: data.relatedEntityType,
            relatedEntityId: data.relatedEntityId,
            actionUrl: data.actionUrl,
            expiresAt: data.expiresAt,
            isRead: false,
            metadata: data.metadata,
          },
        });

        notificationIds.push(notification.id);
        await this.deliverNotification(notification, data.channels);
      }

      this.emit('bulk_notification.sent', { notificationIds, data });
      return notificationIds;
    } catch (error) {
      console.error('Failed to send bulk notification:', error);
      throw new Error('Failed to send bulk notification');
    }
  }

  // Deliver notification through specified channels
  private async deliverNotification(notification: any, channels: string[]) {
    const deliveryPromises: Promise<any>[] = [];

    // Get recipient details
    const recipient = await prisma.user.findUnique({
      where: { id: notification.recipientId },
      include: {
        notificationSettings: true,
        deviceTokens: true,
      },
    });

    if (!recipient) {
      console.error('Recipient not found:', notification.recipientId);
      return;
    }

    // In-app notification (real-time)
    if (channels.includes('IN_APP')) {
      deliveryPromises.push(this.sendInAppNotification(notification));
    }

    // Email notification
    if (channels.includes('EMAIL') && recipient.notificationSettings?.emailNotifications) {
      deliveryPromises.push(this.sendEmailNotification(notification, recipient));
    }

    // SMS notification
    if (channels.includes('SMS') && recipient.notificationSettings?.smsNotifications && recipient.phone) {
      deliveryPromises.push(this.sendSMSNotification(notification, recipient));
    }

    // Push notification
    if (channels.includes('PUSH') && recipient.notificationSettings?.pushNotifications) {
      const deviceTokens = recipient.deviceTokens?.map(dt => dt.token) || [];
      if (deviceTokens.length > 0) {
        deliveryPromises.push(this.sendPushNotification(notification, deviceTokens));
      }
    }

    // Execute all deliveries
    const results = await Promise.allSettled(deliveryPromises);
    
    // Log delivery results
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Notification delivery failed for channel ${channels[index]}:`, result.reason);
      }
    });
  }

  // Send in-app notification via WebSocket
  private async sendInAppNotification(notification: any) {
    if (!this.io) return;

    const payload = {
      id: notification.id,
      type: notification.type,
      priority: notification.priority,
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl,
      timestamp: notification.createdAt,
      metadata: notification.metadata,
    };

    // Send to specific user
    this.io.to(`user:${notification.recipientId}`).emit('notification', payload);

    // Update delivery status
    await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: 'IN_APP',
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });
  }

  // Send email notification
  private async sendEmailNotification(notification: any, recipient: any) {
    try {
      const emailContent = this.generateEmailContent(notification);
      
      await integrationService.sendEmail(
        recipient.email,
        notification.title,
        emailContent,
        true
      );

      await prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'EMAIL',
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });
    } catch (error) {
      await prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'EMAIL',
          status: 'FAILED',
          error: error.message,
          attemptedAt: new Date(),
        },
      });
      throw error;
    }
  }

  // Send SMS notification
  private async sendSMSNotification(notification: any, recipient: any) {
    try {
      const smsContent = `${notification.title}: ${notification.message}`;
      
      await integrationService.sendSMS(recipient.phone, smsContent);

      await prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'SMS',
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });
    } catch (error) {
      await prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'SMS',
          status: 'FAILED',
          error: error.message,
          attemptedAt: new Date(),
        },
      });
      throw error;
    }
  }

  // Send push notification
  private async sendPushNotification(notification: any, deviceTokens: string[]) {
    try {
      await integrationService.sendPushNotification(
        deviceTokens,
        notification.title,
        notification.message,
        {
          notificationId: notification.id,
          type: notification.type,
          actionUrl: notification.actionUrl,
        }
      );

      await prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'PUSH',
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });
    } catch (error) {
      await prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'PUSH',
          status: 'FAILED',
          error: error.message,
          attemptedAt: new Date(),
        },
      });
      throw error;
    }
  }

  // Generate email content
  private generateEmailContent(notification: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; }
          .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f5f5f5; }
          .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
          .priority-${notification.priority.toLowerCase()} { border-left: 4px solid #f44336; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>BahinLink Security</h1>
          </div>
          <div class="content priority-${notification.priority.toLowerCase()}">
            <h2>${notification.title}</h2>
            <p>${notification.message}</p>
            <p><strong>Priority:</strong> ${notification.priority}</p>
            <p><strong>Time:</strong> ${new Date(notification.createdAt).toLocaleString()}</p>
            ${notification.actionUrl ? `<p><a href="${notification.actionUrl}" style="background-color: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View Details</a></p>` : ''}
          </div>
          <div class="footer">
            <p>This is an automated message from BahinLink Security System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Mark notification as read
  public async markAsRead(notificationId: string): Promise<void> {
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    this.emit('notification.read', { notificationId });
  }

  // Mark all notifications as read for a user
  public async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    this.emit('notifications.all_read', { userId });
  }

  // Get notifications for a user
  public async getUserNotifications(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { recipientId: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.notification.count({
        where: { recipientId: userId },
      }),
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // Get unread count for a user
  public async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        recipientId: userId,
        isRead: false,
      },
    });
  }

  // Clean up expired notifications
  public async cleanupExpiredNotifications(): Promise<void> {
    const expiredNotifications = await prisma.notification.findMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
      select: { id: true },
    });

    if (expiredNotifications.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          id: {
            in: expiredNotifications.map(n => n.id),
          },
        },
      });

      console.log(`Cleaned up ${expiredNotifications.length} expired notifications`);
    }
  }

  // Emergency notification
  public async sendEmergencyNotification(data: NotificationData & { emergencyLevel: 'CRITICAL' | 'HIGH' }) {
    // Override priority for emergency notifications
    data.priority = 'CRITICAL';
    data.channels = ['IN_APP', 'EMAIL', 'SMS', 'PUSH'];

    // Send to all relevant users
    const roles = ['ADMIN', 'MANAGER', 'SUPERVISOR'];
    const notificationIds: string[] = [];

    for (const role of roles) {
      const ids = await this.sendBulkNotification({
        ...data,
        recipientRole: role,
      });
      notificationIds.push(...ids);
    }

    // Also trigger external emergency protocols
    await integrationService.notifyEmergencyServices({
      type: data.type,
      title: data.title,
      message: data.message,
      timestamp: new Date().toISOString(),
      emergencyLevel: data.emergencyLevel,
    });

    this.emit('emergency_notification.sent', { notificationIds, data });
    return notificationIds;
  }
}

export const notificationService = NotificationService.getInstance();
