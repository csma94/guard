import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiClient } from './api';
import { logger } from '../utils/logger';

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  data?: any;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  category: 'SHIFT' | 'EMERGENCY' | 'REPORT' | 'SYSTEM' | 'COMMUNICATION';
  sound?: string;
  vibrate?: boolean;
  scheduledTime?: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  emergencyAlerts: boolean;
  shiftReminders: boolean;
  reportNotifications: boolean;
  systemUpdates: boolean;
  communicationMessages: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

class NotificationService {
  private static instance: NotificationService;
  private pushToken: string | null = null;
  private preferences: NotificationPreferences | null = null;
  private notificationListener: any = null;
  private responseListener: any = null;

  private constructor() {
    this.initializeNotifications();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private async initializeNotifications() {
    try {
      // Configure notification behavior
      Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
          const { priority, category } = notification.request.content.data || {};
          
          // Always show critical notifications
          if (priority === 'CRITICAL' || category === 'EMERGENCY') {
            return {
              shouldShowAlert: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
            };
          }

          // Check quiet hours for other notifications
          const isQuietHours = await this.isQuietHours();
          if (isQuietHours && priority !== 'HIGH') {
            return {
              shouldShowAlert: false,
              shouldPlaySound: false,
              shouldSetBadge: true,
            };
          }

          const prefs = await this.getPreferences();
          return {
            shouldShowAlert: prefs.enabled,
            shouldPlaySound: prefs.soundEnabled,
            shouldSetBadge: true,
          };
        },
      });

      // Set up notification listeners
      this.setupNotificationListeners();

      // Request permissions
      await this.requestPermissions();

      // Register for push notifications
      await this.registerForPushNotifications();

      logger.info('Notification service initialized');
    } catch (error) {
      logger.error('Failed to initialize notifications:', error);
    }
  }

  private setupNotificationListeners() {
    // Listen for notifications received while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        logger.info('Notification received:', notification);
        this.handleNotificationReceived(notification);
      }
    );

    // Listen for user interactions with notifications
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        logger.info('Notification response:', response);
        this.handleNotificationResponse(response);
      }
    );
  }

  private async handleNotificationReceived(notification: Notifications.Notification) {
    const { data } = notification.request.content;
    
    // Handle different notification types
    switch (data?.category) {
      case 'EMERGENCY':
        await this.handleEmergencyNotification(data);
        break;
      case 'SHIFT':
        await this.handleShiftNotification(data);
        break;
      case 'REPORT':
        await this.handleReportNotification(data);
        break;
      case 'COMMUNICATION':
        await this.handleCommunicationNotification(data);
        break;
      default:
        logger.info('Unhandled notification category:', data?.category);
    }
  }

  private async handleNotificationResponse(response: Notifications.NotificationResponse) {
    const { data } = response.notification.request.content;
    const { actionIdentifier } = response;

    // Handle notification actions
    switch (actionIdentifier) {
      case 'EMERGENCY_RESPOND':
        // Navigate to emergency response screen
        break;
      case 'SHIFT_ACCEPT':
        // Accept shift assignment
        break;
      case 'REPORT_VIEW':
        // Navigate to report details
        break;
      default:
        // Default action - open app to relevant screen
        this.handleDefaultAction(data);
    }
  }

  private async handleEmergencyNotification(data: any) {
    // Play emergency sound and vibration
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚨 EMERGENCY ALERT',
        body: data.message || 'Emergency situation requires immediate attention',
        sound: 'emergency.wav',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250],
      },
      trigger: null,
    });
  }

  private async handleShiftNotification(data: any) {
    // Handle shift-related notifications
    logger.info('Handling shift notification:', data);
  }

  private async handleReportNotification(data: any) {
    // Handle report-related notifications
    logger.info('Handling report notification:', data);
  }

  private async handleCommunicationNotification(data: any) {
    // Handle communication notifications
    logger.info('Handling communication notification:', data);
  }

  private handleDefaultAction(data: any) {
    // Navigate to appropriate screen based on notification data
    logger.info('Handling default notification action:', data);
  }

  public async requestPermissions(): Promise<boolean> {
    try {
      if (!Device.isDevice) {
        logger.warn('Push notifications only work on physical devices');
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        logger.warn('Push notification permission denied');
        return false;
      }

      // Configure notification channels for Android
      if (Platform.OS === 'android') {
        await this.setupAndroidChannels();
      }

      return true;
    } catch (error) {
      logger.error('Failed to request notification permissions:', error);
      return false;
    }
  }

  private async setupAndroidChannels() {
    await Notifications.setNotificationChannelAsync('emergency', {
      name: 'Emergency Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF0000',
      sound: 'emergency.wav',
    });

    await Notifications.setNotificationChannelAsync('shift', {
      name: 'Shift Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });

    await Notifications.setNotificationChannelAsync('report', {
      name: 'Report Notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
    });

    await Notifications.setNotificationChannelAsync('communication', {
      name: 'Communication',
      importance: Notifications.AndroidImportance.HIGH,
    });

    await Notifications.setNotificationChannelAsync('system', {
      name: 'System Updates',
      importance: Notifications.AndroidImportance.LOW,
    });
  }

  public async registerForPushNotifications(): Promise<string | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;
      this.pushToken = token;

      // Register token with backend
      await this.registerTokenWithBackend(token);

      logger.info('Push token registered:', token);
      return token;
    } catch (error) {
      logger.error('Failed to register for push notifications:', error);
      return null;
    }
  }

  private async registerTokenWithBackend(token: string) {
    try {
      await apiClient.post('/mobile/notifications/register-token', {
        token,
        platform: Platform.OS,
        deviceInfo: {
          deviceId: await Device.getDeviceTypeAsync(),
          osVersion: Device.osVersion,
          appVersion: '1.0.0', // Get from app config
        },
      });
    } catch (error) {
      logger.error('Failed to register token with backend:', error);
    }
  }

  public async scheduleLocalNotification(notification: NotificationData): Promise<string> {
    try {
      const channelId = this.getChannelId(notification.category);
      
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data,
          sound: notification.sound || 'default',
          priority: this.getAndroidPriority(notification.priority),
          vibrate: notification.vibrate ? [0, 250, 250, 250] : undefined,
          channelId,
        },
        trigger: notification.scheduledTime 
          ? { date: new Date(notification.scheduledTime) }
          : null,
      });

      logger.info('Local notification scheduled:', notificationId);
      return notificationId;
    } catch (error) {
      logger.error('Failed to schedule local notification:', error);
      throw error;
    }
  }

  public async cancelNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      logger.info('Notification cancelled:', notificationId);
    } catch (error) {
      logger.error('Failed to cancel notification:', error);
    }
  }

  public async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      logger.info('All notifications cancelled');
    } catch (error) {
      logger.error('Failed to cancel all notifications:', error);
    }
  }

  public async getPreferences(): Promise<NotificationPreferences> {
    if (this.preferences) {
      return this.preferences;
    }

    try {
      const stored = await AsyncStorage.getItem('notification_preferences');
      if (stored) {
        this.preferences = JSON.parse(stored);
        return this.preferences!;
      }
    } catch (error) {
      logger.error('Failed to load notification preferences:', error);
    }

    // Return default preferences
    this.preferences = {
      enabled: true,
      emergencyAlerts: true,
      shiftReminders: true,
      reportNotifications: true,
      systemUpdates: true,
      communicationMessages: true,
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '07:00',
      },
      soundEnabled: true,
      vibrationEnabled: true,
    };

    return this.preferences;
  }

  public async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<void> {
    try {
      const current = await this.getPreferences();
      this.preferences = { ...current, ...preferences };
      
      await AsyncStorage.setItem(
        'notification_preferences',
        JSON.stringify(this.preferences)
      );

      // Sync with backend
      await apiClient.put('/mobile/notifications/preferences', this.preferences);

      logger.info('Notification preferences updated');
    } catch (error) {
      logger.error('Failed to update notification preferences:', error);
    }
  }

  private async isQuietHours(): Promise<boolean> {
    const prefs = await this.getPreferences();
    if (!prefs.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = prefs.quietHours.startTime.split(':').map(Number);
    const [endHour, endMin] = prefs.quietHours.endTime.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // Quiet hours span midnight
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  private getChannelId(category: string): string {
    switch (category) {
      case 'EMERGENCY': return 'emergency';
      case 'SHIFT': return 'shift';
      case 'REPORT': return 'report';
      case 'COMMUNICATION': return 'communication';
      case 'SYSTEM': return 'system';
      default: return 'default';
    }
  }

  private getAndroidPriority(priority: string): Notifications.AndroidNotificationPriority {
    switch (priority) {
      case 'CRITICAL': return Notifications.AndroidNotificationPriority.MAX;
      case 'HIGH': return Notifications.AndroidNotificationPriority.HIGH;
      case 'NORMAL': return Notifications.AndroidNotificationPriority.DEFAULT;
      case 'LOW': return Notifications.AndroidNotificationPriority.LOW;
      default: return Notifications.AndroidNotificationPriority.DEFAULT;
    }
  }

  public getPushToken(): string | null {
    return this.pushToken;
  }

  public cleanup(): void {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
  }
}

export default NotificationService.getInstance();
