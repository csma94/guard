import { logger } from '../utils/logger';
import { store } from '../store';
import { updateCurrentLocation } from '../store/slices/locationSlice';
import { addMessage } from '../store/slices/communicationSlice';
import notificationService from './notificationService';

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
  id?: string;
}

export interface ConnectionConfig {
  url: string;
  protocols?: string[];
  headers?: Record<string, string>;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private config: ConnectionConfig | null = null;
  private isConnected = false;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 5000;
  private heartbeatInterval = 30000;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private eventListeners: Map<string, Function[]> = new Map();

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public async connect(config: ConnectionConfig): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      logger.warn('WebSocket already connected or connecting');
      return;
    }

    this.config = {
      ...config,
      reconnectInterval: config.reconnectInterval || this.reconnectInterval,
      maxReconnectAttempts: config.maxReconnectAttempts || this.maxReconnectAttempts,
      heartbeatInterval: config.heartbeatInterval || this.heartbeatInterval,
    };

    return new Promise((resolve, reject) => {
      try {
        this.isConnecting = true;
        
        // Add authentication token to URL
        const token = this.getAuthToken();
        const wsUrl = `${config.url}?token=${token}`;
        
        this.ws = new WebSocket(wsUrl, config.protocols);

        this.ws.onopen = () => {
          logger.info('WebSocket connected');
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          this.startHeartbeat();
          this.processMessageQueue();
          this.emit('connected');
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = (event) => {
          logger.info('WebSocket disconnected', { code: event.code, reason: event.reason });
          this.handleDisconnection();
        };

        this.ws.onerror = (error) => {
          logger.error('WebSocket error:', error);
          this.isConnecting = false;
          this.emit('error', error);
          reject(error);
        };

        // Connection timeout
        setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            this.ws?.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

      } catch (error) {
        this.isConnecting = false;
        logger.error('Failed to create WebSocket connection:', error);
        reject(error);
      }
    });
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    }
    this.cleanup();
  }

  public send(message: WebSocketMessage): void {
    if (!this.isConnected || !this.ws) {
      logger.warn('WebSocket not connected, queuing message');
      this.messageQueue.push(message);
      return;
    }

    try {
      const messageWithId = {
        ...message,
        id: this.generateMessageId(),
        timestamp: new Date().toISOString(),
      };

      this.ws.send(JSON.stringify(messageWithId));
      logger.debug('WebSocket message sent:', messageWithId.type);
    } catch (error) {
      logger.error('Failed to send WebSocket message:', error);
      this.messageQueue.push(message);
    }
  }

  public sendLocationUpdate(location: any): void {
    this.send({
      type: 'LOCATION_UPDATE',
      payload: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        timestamp: location.timestamp,
        agentId: this.getAgentId(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  public sendStatusUpdate(status: string, data?: any): void {
    this.send({
      type: 'STATUS_UPDATE',
      payload: {
        status,
        agentId: this.getAgentId(),
        ...data,
      },
      timestamp: new Date().toISOString(),
    });
  }

  public sendChatMessage(message: string, channelId: string): void {
    this.send({
      type: 'CHAT_MESSAGE',
      payload: {
        message,
        channelId,
        agentId: this.getAgentId(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  public sendEmergencyAlert(alertData: any): void {
    this.send({
      type: 'EMERGENCY_ALERT',
      payload: {
        ...alertData,
        agentId: this.getAgentId(),
        priority: 'CRITICAL',
      },
      timestamp: new Date().toISOString(),
    });
  }

  public on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  public off(event: string, callback?: Function): void {
    if (!this.eventListeners.has(event)) return;

    if (callback) {
      const listeners = this.eventListeners.get(event)!;
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    } else {
      this.eventListeners.delete(event);
    }
  }

  private emit(event: string, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error('Error in WebSocket event listener:', error);
        }
      });
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      logger.debug('WebSocket message received:', message.type);

      switch (message.type) {
        case 'HEARTBEAT':
          this.handleHeartbeat(message);
          break;
        case 'LOCATION_REQUEST':
          this.handleLocationRequest(message);
          break;
        case 'CHAT_MESSAGE':
          this.handleChatMessage(message);
          break;
        case 'EMERGENCY_ALERT':
          this.handleEmergencyAlert(message);
          break;
        case 'SHIFT_UPDATE':
          this.handleShiftUpdate(message);
          break;
        case 'NOTIFICATION':
          this.handleNotification(message);
          break;
        case 'SYSTEM_MESSAGE':
          this.handleSystemMessage(message);
          break;
        default:
          logger.warn('Unknown WebSocket message type:', message.type);
      }

      this.emit('message', message);
    } catch (error) {
      logger.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleHeartbeat(message: WebSocketMessage): void {
    // Respond to server heartbeat
    this.send({
      type: 'HEARTBEAT_RESPONSE',
      payload: { timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  }

  private handleLocationRequest(message: WebSocketMessage): void {
    // Send current location if available
    const state = store.getState();
    const currentLocation = state.location.currentLocation;
    
    if (currentLocation) {
      this.sendLocationUpdate(currentLocation);
    }
  }

  private handleChatMessage(message: WebSocketMessage): void {
    // Dispatch to communication slice
    store.dispatch(addMessage({
      id: message.id || this.generateMessageId(),
      content: message.payload.message,
      senderId: message.payload.senderId,
      senderName: message.payload.senderName,
      channelId: message.payload.channelId,
      timestamp: message.timestamp,
      type: 'text',
    }));

    // Show notification if app is in background
    notificationService.scheduleLocalNotification({
      id: message.id || this.generateMessageId(),
      title: `Message from ${message.payload.senderName}`,
      body: message.payload.message,
      priority: 'NORMAL',
      category: 'COMMUNICATION',
      data: {
        type: 'chat_message',
        channelId: message.payload.channelId,
      },
    });
  }

  private handleEmergencyAlert(message: WebSocketMessage): void {
    // Show critical emergency notification
    notificationService.scheduleLocalNotification({
      id: message.id || this.generateMessageId(),
      title: '🚨 EMERGENCY ALERT',
      body: message.payload.message || 'Emergency situation detected',
      priority: 'CRITICAL',
      category: 'EMERGENCY',
      sound: 'emergency.wav',
      vibrate: true,
      data: {
        type: 'emergency_alert',
        alertId: message.payload.alertId,
      },
    });

    this.emit('emergency_alert', message.payload);
  }

  private handleShiftUpdate(message: WebSocketMessage): void {
    // Handle shift-related updates
    this.emit('shift_update', message.payload);
    
    notificationService.scheduleLocalNotification({
      id: message.id || this.generateMessageId(),
      title: 'Shift Update',
      body: message.payload.message || 'Your shift has been updated',
      priority: 'HIGH',
      category: 'SHIFT',
      data: {
        type: 'shift_update',
        shiftId: message.payload.shiftId,
      },
    });
  }

  private handleNotification(message: WebSocketMessage): void {
    // Handle general notifications
    notificationService.scheduleLocalNotification({
      id: message.id || this.generateMessageId(),
      title: message.payload.title,
      body: message.payload.body,
      priority: message.payload.priority || 'NORMAL',
      category: message.payload.category || 'SYSTEM',
      data: message.payload.data,
    });
  }

  private handleSystemMessage(message: WebSocketMessage): void {
    // Handle system-wide messages
    logger.info('System message received:', message.payload);
    this.emit('system_message', message.payload);
  }

  private handleDisconnection(): void {
    this.isConnected = false;
    this.stopHeartbeat();
    this.emit('disconnected');

    // Attempt reconnection if not manually disconnected
    if (this.config && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts);
    logger.info(`Scheduling WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect(this.config!).catch((error) => {
        logger.error('WebSocket reconnection failed:', error);
      });
    }, delay);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send({
          type: 'HEARTBEAT',
          payload: { timestamp: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        });
      }
    }, this.config?.heartbeatInterval || this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  private cleanup(): void {
    this.isConnected = false;
    this.isConnecting = false;
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.ws = null;
    this.messageQueue = [];
    this.eventListeners.clear();
  }

  private getAuthToken(): string {
    const state = store.getState();
    return state.auth.token || '';
  }

  private getAgentId(): string {
    const state = store.getState();
    return state.auth.user?.agent?.id || '';
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getConnectionStatus(): {
    isConnected: boolean;
    isConnecting: boolean;
    reconnectAttempts: number;
  } {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

export default WebSocketService.getInstance();
