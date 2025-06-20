import { NotificationService, NotificationData } from '../../../src/services/notificationService';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, describe, it, expect, jest } from '@jest/globals';

// Mock Prisma
jest.mock('@prisma/client');
const mockPrisma = {
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  notificationDelivery: {
    create: jest.fn(),
  },
} as any;

// Mock integration service
jest.mock('../../../src/services/integrationService', () => ({
  integrationService: {
    sendEmail: jest.fn(),
    sendSMS: jest.fn(),
    sendPushNotification: jest.fn(),
  },
}));

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockSocketIO: any;

  beforeAll(() => {
    // Replace the actual prisma instance with our mock
    (PrismaClient as any).mockImplementation(() => mockPrisma);
    notificationService = NotificationService.getInstance();
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock Socket.IO
    mockSocketIO = {
      on: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    notificationService.setSocketIO(mockSocketIO);
  });

  describe('sendNotification', () => {
    it('should create and send a notification successfully', async () => {
      const notificationData: NotificationData = {
        type: 'SECURITY',
        priority: 'HIGH',
        title: 'Security Alert',
        message: 'Unauthorized access detected',
        recipientId: 'user-123',
        senderId: 'system',
        channels: ['IN_APP', 'EMAIL'],
      };

      const mockNotification = {
        id: 'notification-123',
        ...notificationData,
        createdAt: new Date(),
        isRead: false,
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        phone: '+1234567890',
        notificationSettings: {
          emailNotifications: true,
          smsNotifications: true,
          pushNotifications: true,
        },
        deviceTokens: [
          { token: 'device-token-123' },
        ],
      };

      mockPrisma.notification.create.mockResolvedValue(mockNotification);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.notificationDelivery.create.mockResolvedValue({});

      const result = await notificationService.sendNotification(notificationData);

      expect(result).toBe('notification-123');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: notificationData.type,
          priority: notificationData.priority,
          title: notificationData.title,
          message: notificationData.message,
          recipientId: notificationData.recipientId,
          senderId: notificationData.senderId,
          isRead: false,
        }),
      });
    });

    it('should handle notification creation failure', async () => {
      const notificationData: NotificationData = {
        type: 'SYSTEM',
        priority: 'LOW',
        title: 'System Update',
        message: 'System maintenance scheduled',
        recipientId: 'user-123',
        channels: ['IN_APP'],
      };

      mockPrisma.notification.create.mockRejectedValue(new Error('Database error'));

      await expect(notificationService.sendNotification(notificationData))
        .rejects.toThrow('Failed to send notification');
    });

    it('should skip delivery channels based on user preferences', async () => {
      const notificationData: NotificationData = {
        type: 'SYSTEM',
        priority: 'LOW',
        title: 'System Update',
        message: 'System maintenance scheduled',
        recipientId: 'user-123',
        channels: ['EMAIL', 'SMS'],
      };

      const mockNotification = {
        id: 'notification-123',
        ...notificationData,
        createdAt: new Date(),
        isRead: false,
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        phone: '+1234567890',
        notificationSettings: {
          emailNotifications: false, // Email disabled
          smsNotifications: true,
          pushNotifications: true,
        },
        deviceTokens: [],
      };

      mockPrisma.notification.create.mockResolvedValue(mockNotification);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.notificationDelivery.create.mockResolvedValue({});

      await notificationService.sendNotification(notificationData);

      // Should only create delivery record for SMS (email should be skipped)
      expect(mockPrisma.notificationDelivery.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendBulkNotification', () => {
    it('should send notifications to multiple users by role', async () => {
      const notificationData = {
        type: 'SECURITY' as const,
        priority: 'URGENT' as const,
        title: 'Emergency Alert',
        message: 'Immediate action required',
        recipientRole: 'ADMIN',
        senderId: 'system',
        channels: ['IN_APP', 'EMAIL'] as const,
      };

      const mockUsers = [
        { id: 'admin-1', email: 'admin1@example.com', phone: '+1111111111' },
        { id: 'admin-2', email: 'admin2@example.com', phone: '+2222222222' },
      ];

      const mockNotifications = mockUsers.map((user, index) => ({
        id: `notification-${index + 1}`,
        ...notificationData,
        recipientId: user.id,
        createdAt: new Date(),
        isRead: false,
      }));

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.notification.create
        .mockResolvedValueOnce(mockNotifications[0])
        .mockResolvedValueOnce(mockNotifications[1]);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          ...mockUsers[0],
          notificationSettings: { emailNotifications: true },
          deviceTokens: [],
        })
        .mockResolvedValueOnce({
          ...mockUsers[1],
          notificationSettings: { emailNotifications: true },
          deviceTokens: [],
        });
      mockPrisma.notificationDelivery.create.mockResolvedValue({});

      const result = await notificationService.sendBulkNotification(notificationData);

      expect(result).toHaveLength(2);
      expect(result).toEqual(['notification-1', 'notification-2']);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { role: 'ADMIN' },
        select: { id: true, email: true, phone: true },
      });
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
    });

    it('should handle empty user list for role', async () => {
      const notificationData = {
        type: 'SYSTEM' as const,
        priority: 'LOW' as const,
        title: 'System Update',
        message: 'Maintenance scheduled',
        recipientRole: 'NONEXISTENT_ROLE',
        channels: ['IN_APP'] as const,
      };

      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await notificationService.sendBulkNotification(notificationData);

      expect(result).toHaveLength(0);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read successfully', async () => {
      const notificationId = 'notification-123';
      const updatedNotification = {
        id: notificationId,
        isRead: true,
        readAt: new Date(),
      };

      mockPrisma.notification.update.mockResolvedValue(updatedNotification);

      await notificationService.markAsRead(notificationId);

      expect(mockPrisma.notification.update).toHaveBeenCalledWith({
        where: { id: notificationId },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });
    });

    it('should handle marking non-existent notification as read', async () => {
      const notificationId = 'non-existent';

      mockPrisma.notification.update.mockRejectedValue(new Error('Notification not found'));

      await expect(notificationService.markAsRead(notificationId))
        .rejects.toThrow('Notification not found');
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read for a user', async () => {
      const userId = 'user-123';

      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      await notificationService.markAllAsRead(userId);

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          recipientId: userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });
    });
  });

  describe('getUserNotifications', () => {
    it('should return paginated notifications for a user', async () => {
      const userId = 'user-123';
      const page = 1;
      const limit = 10;

      const mockNotifications = [
        {
          id: 'notification-1',
          type: 'SYSTEM',
          title: 'System Update',
          message: 'Update available',
          createdAt: new Date(),
          sender: { id: 'system', firstName: 'System', lastName: 'Admin' },
        },
        {
          id: 'notification-2',
          type: 'SECURITY',
          title: 'Security Alert',
          message: 'Login detected',
          createdAt: new Date(),
          sender: { id: 'system', firstName: 'System', lastName: 'Admin' },
        },
      ];

      mockPrisma.notification.findMany.mockResolvedValue(mockNotifications);
      mockPrisma.notification.count.mockResolvedValue(25);

      const result = await notificationService.getUserNotifications(userId, page, limit);

      expect(result.notifications).toEqual(mockNotifications);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        pages: 3,
      });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { recipientId: userId },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    });

    it('should handle pagination correctly for different pages', async () => {
      const userId = 'user-123';
      const page = 3;
      const limit = 5;

      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(12);

      const result = await notificationService.getUserNotifications(userId, page, limit);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { recipientId: userId },
        orderBy: { createdAt: 'desc' },
        skip: 10, // (page - 1) * limit = (3 - 1) * 5 = 10
        take: 5,
        include: expect.any(Object),
      });

      expect(result.pagination.pages).toBe(3); // Math.ceil(12 / 5) = 3
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread notification count for a user', async () => {
      const userId = 'user-123';
      const unreadCount = 7;

      mockPrisma.notification.count.mockResolvedValue(unreadCount);

      const result = await notificationService.getUnreadCount(userId);

      expect(result).toBe(unreadCount);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: {
          recipientId: userId,
          isRead: false,
        },
      });
    });

    it('should return 0 when user has no unread notifications', async () => {
      const userId = 'user-123';

      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await notificationService.getUnreadCount(userId);

      expect(result).toBe(0);
    });
  });

  describe('cleanupExpiredNotifications', () => {
    it('should delete expired notifications', async () => {
      const expiredNotifications = [
        { id: 'expired-1' },
        { id: 'expired-2' },
        { id: 'expired-3' },
      ];

      mockPrisma.notification.findMany.mockResolvedValue(expiredNotifications);
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 3 });

      await notificationService.cleanupExpiredNotifications();

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date),
          },
        },
        select: { id: true },
      });

      expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['expired-1', 'expired-2', 'expired-3'],
          },
        },
      });
    });

    it('should handle case when no notifications are expired', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await notificationService.cleanupExpiredNotifications();

      expect(mockPrisma.notification.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('sendEmergencyNotification', () => {
    it('should send emergency notification to all relevant roles', async () => {
      const emergencyData = {
        type: 'INCIDENT' as const,
        priority: 'HIGH' as const,
        title: 'Emergency Incident',
        message: 'Immediate response required',
        emergencyLevel: 'CRITICAL' as const,
        channels: ['IN_APP'] as const,
      };

      const mockUsers = {
        ADMIN: [{ id: 'admin-1', email: 'admin1@example.com', phone: '+1111111111' }],
        MANAGER: [{ id: 'manager-1', email: 'manager1@example.com', phone: '+2222222222' }],
        SUPERVISOR: [{ id: 'supervisor-1', email: 'supervisor1@example.com', phone: '+3333333333' }],
      };

      // Mock user queries for each role
      mockPrisma.user.findMany
        .mockResolvedValueOnce(mockUsers.ADMIN)
        .mockResolvedValueOnce(mockUsers.MANAGER)
        .mockResolvedValueOnce(mockUsers.SUPERVISOR);

      // Mock notification creation
      mockPrisma.notification.create
        .mockResolvedValueOnce({ id: 'emergency-1' })
        .mockResolvedValueOnce({ id: 'emergency-2' })
        .mockResolvedValueOnce({ id: 'emergency-3' });

      // Mock user details for delivery
      mockPrisma.user.findUnique
        .mockResolvedValue({
          notificationSettings: { emailNotifications: true },
          deviceTokens: [],
        });

      mockPrisma.notificationDelivery.create.mockResolvedValue({});

      const result = await notificationService.sendEmergencyNotification(emergencyData);

      expect(result).toHaveLength(3);
      expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(3);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(3);

      // Verify priority was overridden to CRITICAL
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 'CRITICAL',
        }),
      });
    });
  });
});
