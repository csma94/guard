import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
// JWT removed - using Clerk for authentication
import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface SocketUser {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  clientId?: string;
  agentId?: string;
}

export interface WebSocketMessage {
  id: string;
  type: string;
  payload: any;
  timestamp: Date;
  senderId: string;
  recipientId?: string;
  roomId?: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

export interface Room {
  id: string;
  name: string;
  type: 'private' | 'group' | 'broadcast' | 'emergency';
  participants: string[];
  metadata: Record<string, any>;
  createdAt: Date;
}

class WebSocketService {
  private io: SocketIOServer;
  private redis: Redis;
  private connectedUsers: Map<string, Socket> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private rooms: Map<string, Room> = new Map();
  private messageQueue: Map<string, WebSocketMessage[]> = new Map();

  constructor(httpServer: HTTPServer, redisClient: Redis) {
    this.redis = redisClient;
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.setupRedisSubscriptions();
    this.startCleanupTasks();

    logger.info('WebSocket service initialized');
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify Clerk session token
        const { clerkClient } = require('@clerk/backend');
        const sessionClaims = await clerkClient.verifyToken(token);

        if (!sessionClaims || !sessionClaims.sub) {
          return next(new Error('Invalid token'));
        }

        // Get user from Clerk
        const clerkUser = await clerkClient.users.getUser(sessionClaims.sub);
        const user: SocketUser = {
          id: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || '',
          role: clerkUser.publicMetadata?.role || 'USER',
          permissions: clerkUser.publicMetadata?.permissions || [],
          clientId: clerkUser.publicMetadata?.clientId,
          agentId: clerkUser.publicMetadata?.agentId,
        };

        socket.data.user = user;
        next();
      } catch (error) {
        logger.error('WebSocket authentication error:', error);
        next(new Error('Invalid authentication token'));
      }
    });

    // Rate limiting middleware
    this.io.use((socket, next) => {
      const rateLimitKey = `rate_limit:${socket.data.user.id}`;
      // Implement rate limiting logic here
      next();
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);

      socket.on('join_room', (data) => this.handleJoinRoom(socket, data));
      socket.on('leave_room', (data) => this.handleLeaveRoom(socket, data));
      socket.on('send_message', (data) => this.handleSendMessage(socket, data));
      socket.on('typing_start', (data) => this.handleTypingStart(socket, data));
      socket.on('typing_stop', (data) => this.handleTypingStop(socket, data));
      socket.on('location_update', (data) => this.handleLocationUpdate(socket, data));
      socket.on('emergency_alert', (data) => this.handleEmergencyAlert(socket, data));
      socket.on('status_update', (data) => this.handleStatusUpdate(socket, data));
      socket.on('disconnect', () => this.handleDisconnection(socket));
    });
  }

  private setupRedisSubscriptions(): void {
    const subscriber = this.redis.duplicate();
    
    subscriber.subscribe('websocket:broadcast', 'websocket:room', 'websocket:user');
    
    subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        
        switch (channel) {
          case 'websocket:broadcast':
            this.broadcastToAll(data.event, data.payload);
            break;
          case 'websocket:room':
            this.broadcastToRoom(data.roomId, data.event, data.payload);
            break;
          case 'websocket:user':
            this.sendToUser(data.userId, data.event, data.payload);
            break;
        }
      } catch (error) {
        logger.error('Redis message processing error:', error);
      }
    });
  }

  private handleConnection(socket: Socket): void {
    const user = socket.data.user as SocketUser;
    
    // Store socket connection
    this.connectedUsers.set(socket.id, socket);
    
    // Track user sockets
    if (!this.userSockets.has(user.id)) {
      this.userSockets.set(user.id, new Set());
    }
    this.userSockets.get(user.id)!.add(socket.id);

    // Join user to their personal room
    socket.join(`user:${user.id}`);
    
    // Join role-based rooms
    socket.join(`role:${user.role}`);
    
    // Join client/agent specific rooms
    if (user.clientId) {
      socket.join(`client:${user.clientId}`);
    }
    if (user.agentId) {
      socket.join(`agent:${user.agentId}`);
    }

    // Send queued messages
    this.sendQueuedMessages(user.id);

    // Broadcast user online status
    this.broadcastUserStatus(user.id, 'online');

    logger.info(`User ${user.email} connected via WebSocket`);
  }

  private handleDisconnection(socket: Socket): void {
    const user = socket.data.user as SocketUser;
    
    // Remove socket connection
    this.connectedUsers.delete(socket.id);
    
    // Update user sockets
    if (this.userSockets.has(user.id)) {
      this.userSockets.get(user.id)!.delete(socket.id);
      
      // If no more sockets for this user, mark as offline
      if (this.userSockets.get(user.id)!.size === 0) {
        this.userSockets.delete(user.id);
        this.broadcastUserStatus(user.id, 'offline');
      }
    }

    logger.info(`User ${user.email} disconnected from WebSocket`);
  }

  private handleJoinRoom(socket: Socket, data: { roomId: string }): void {
    const user = socket.data.user as SocketUser;
    
    // Validate room access
    if (!this.canAccessRoom(user, data.roomId)) {
      socket.emit('error', { message: 'Access denied to room' });
      return;
    }

    socket.join(data.roomId);
    
    // Notify room members
    socket.to(data.roomId).emit('user_joined', {
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    });

    logger.info(`User ${user.email} joined room ${data.roomId}`);
  }

  private handleLeaveRoom(socket: Socket, data: { roomId: string }): void {
    const user = socket.data.user as SocketUser;
    
    socket.leave(data.roomId);
    
    // Notify room members
    socket.to(data.roomId).emit('user_left', {
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    });

    logger.info(`User ${user.email} left room ${data.roomId}`);
  }

  private async handleSendMessage(socket: Socket, data: WebSocketMessage): Promise<void> {
    const user = socket.data.user as SocketUser;
    
    try {
      // Validate message
      if (!this.validateMessage(data)) {
        socket.emit('error', { message: 'Invalid message format' });
        return;
      }

      // Create message object
      const message: WebSocketMessage = {
        ...data,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        senderId: user.id,
        timestamp: new Date(),
      };

      // Store message in database
      await this.storeMessage(message);

      // Send message based on type
      if (message.recipientId) {
        // Private message
        this.sendToUser(message.recipientId, 'new_message', message);
        socket.emit('message_sent', { messageId: message.id });
      } else if (message.roomId) {
        // Room message
        this.broadcastToRoom(message.roomId, 'new_message', message);
        socket.emit('message_sent', { messageId: message.id });
      }

      // Handle priority messages
      if (message.priority === 'critical') {
        this.handleCriticalMessage(message);
      }

    } catch (error) {
      logger.error('Message sending error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  private handleTypingStart(socket: Socket, data: { roomId?: string; recipientId?: string }): void {
    const user = socket.data.user as SocketUser;
    
    const typingData = {
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    };

    if (data.roomId) {
      socket.to(data.roomId).emit('typing_start', typingData);
    } else if (data.recipientId) {
      this.sendToUser(data.recipientId, 'typing_start', typingData);
    }
  }

  private handleTypingStop(socket: Socket, data: { roomId?: string; recipientId?: string }): void {
    const user = socket.data.user as SocketUser;
    
    const typingData = {
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    };

    if (data.roomId) {
      socket.to(data.roomId).emit('typing_stop', typingData);
    } else if (data.recipientId) {
      this.sendToUser(data.recipientId, 'typing_stop', typingData);
    }
  }

  private handleLocationUpdate(socket: Socket, data: { latitude: number; longitude: number; accuracy?: number }): void {
    const user = socket.data.user as SocketUser;
    
    // Store location update
    this.storeLocationUpdate(user.id, data);
    
    // Broadcast to supervisors
    this.broadcastToRole('supervisor', 'location_update', {
      userId: user.id,
      agentId: user.agentId,
      location: data,
      timestamp: new Date(),
    });
  }

  private async handleEmergencyAlert(socket: Socket, data: any): Promise<void> {
    const user = socket.data.user as SocketUser;
    
    const emergencyAlert = {
      id: `emergency_${Date.now()}`,
      userId: user.id,
      agentId: user.agentId,
      type: data.type || 'general',
      location: data.location,
      description: data.description,
      timestamp: new Date(),
      status: 'active',
    };

    // Store emergency alert
    await this.storeEmergencyAlert(emergencyAlert);

    // Broadcast to all supervisors and admins
    this.broadcastToRoles(['supervisor', 'admin'], 'emergency_alert', emergencyAlert);

    // Send confirmation to sender
    socket.emit('emergency_alert_sent', { alertId: emergencyAlert.id });

    logger.warn(`Emergency alert from ${user.email}:`, emergencyAlert);
  }

  private handleStatusUpdate(socket: Socket, data: { status: string; metadata?: any }): void {
    const user = socket.data.user as SocketUser;
    
    const statusUpdate = {
      userId: user.id,
      agentId: user.agentId,
      status: data.status,
      metadata: data.metadata,
      timestamp: new Date(),
    };

    // Store status update
    this.storeStatusUpdate(statusUpdate);

    // Broadcast to supervisors
    this.broadcastToRole('supervisor', 'status_update', statusUpdate);
  }

  // Public methods for external use
  public sendToUser(userId: string, event: string, data: any): void {
    const userSockets = this.userSockets.get(userId);
    
    if (userSockets && userSockets.size > 0) {
      // User is online, send immediately
      this.io.to(`user:${userId}`).emit(event, data);
    } else {
      // User is offline, queue message
      this.queueMessage(userId, { event, data });
    }
  }

  public broadcastToRoom(roomId: string, event: string, data: any): void {
    this.io.to(roomId).emit(event, data);
  }

  public broadcastToRole(role: string, event: string, data: any): void {
    this.io.to(`role:${role}`).emit(event, data);
  }

  public broadcastToRoles(roles: string[], event: string, data: any): void {
    roles.forEach(role => this.broadcastToRole(role, event, data));
  }

  public broadcastToAll(event: string, data: any): void {
    this.io.emit(event, data);
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  public isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  // Private helper methods
  private canAccessRoom(user: SocketUser, roomId: string): boolean {
    // Implement room access control logic
    const room = this.rooms.get(roomId);
    if (!room) return false;
    
    // Check if user is participant
    if (room.participants.includes(user.id)) return true;
    
    // Check role-based access
    if (user.role === 'admin' || user.role === 'supervisor') return true;
    
    return false;
  }

  private validateMessage(message: any): boolean {
    return message && 
           typeof message.type === 'string' && 
           message.payload !== undefined &&
           (message.recipientId || message.roomId);
  }

  private async storeMessage(message: WebSocketMessage): Promise<void> {
    // Store in database
    // Implementation depends on your database setup
  }

  private async storeLocationUpdate(userId: string, location: any): Promise<void> {
    // Store location update in database
  }

  private async storeEmergencyAlert(alert: any): Promise<void> {
    // Store emergency alert in database
  }

  private storeStatusUpdate(update: any): void {
    // Store status update in database
  }

  private queueMessage(userId: string, message: any): void {
    if (!this.messageQueue.has(userId)) {
      this.messageQueue.set(userId, []);
    }
    this.messageQueue.get(userId)!.push(message);
  }

  private sendQueuedMessages(userId: string): void {
    const messages = this.messageQueue.get(userId);
    if (messages && messages.length > 0) {
      messages.forEach(msg => {
        this.sendToUser(userId, msg.event, msg.data);
      });
      this.messageQueue.delete(userId);
    }
  }

  private broadcastUserStatus(userId: string, status: 'online' | 'offline'): void {
    this.broadcastToRole('supervisor', 'user_status_change', {
      userId,
      status,
      timestamp: new Date(),
    });
  }

  private handleCriticalMessage(message: WebSocketMessage): void {
    // Handle critical priority messages with special processing
    logger.warn('Critical message received:', message);
  }

  private startCleanupTasks(): void {
    // Clean up old queued messages every hour
    setInterval(() => {
      this.cleanupMessageQueue();
    }, 60 * 60 * 1000);
  }

  private cleanupMessageQueue(): void {
    // Remove old queued messages
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    for (const [userId, messages] of this.messageQueue.entries()) {
      const recentMessages = messages.filter(msg => 
        msg.timestamp.getTime() > cutoff
      );
      
      if (recentMessages.length === 0) {
        this.messageQueue.delete(userId);
      } else {
        this.messageQueue.set(userId, recentMessages);
      }
    }
  }
}

export default WebSocketService;
