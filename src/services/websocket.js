const { Server } = require('socket.io');
const logger = require('../config/logger');

class WebSocketService {
  constructor(server, prisma) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });
    
    this.prisma = prisma;
    this.connectedUsers = new Map(); // userId -> socket mapping
    this.userRooms = new Map(); // userId -> Set of rooms
    
    this.setupMiddleware();
    this.setupEventHandlers();
    
    logger.info('WebSocket service initialized');
  }

  setupMiddleware() {
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

        if (!clerkUser) {
          return next(new Error('User not found'));
        }

        // Create user object compatible with existing code
        const user = {
          id: clerkUser.id,
          username: clerkUser.username || clerkUser.emailAddresses[0]?.emailAddress?.split('@')[0],
          email: clerkUser.emailAddresses[0]?.emailAddress,
          role: clerkUser.publicMetadata?.role || 'USER',
          isActive: true, // Clerk users are active by default
          clerkUser: clerkUser,
        };

        socket.userId = user.id;
        socket.user = user;
        socket.userRole = user.role;
        
        next();
      } catch (error) {
        logger.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  handleConnection(socket) {
    const userId = socket.userId;
    const user = socket.user;
    
    logger.info(`User connected: ${user.username} (${userId})`);
    
    // Store connection
    this.connectedUsers.set(userId, socket);
    this.userRooms.set(userId, new Set());
    
    // Join user-specific room
    socket.join(`user:${userId}`);
    this.addUserToRoom(userId, `user:${userId}`);
    
    // Join role-based rooms
    socket.join(`role:${user.role}`);
    this.addUserToRoom(userId, `role:${user.role}`);
    
    // Join organization-specific rooms based on role
    if (user.agent) {
      socket.join('agents');
      this.addUserToRoom(userId, 'agents');
    }
    
    if (user.supervisor) {
      socket.join('supervisors');
      this.addUserToRoom(userId, 'supervisors');
    }
    
    if (user.client) {
      socket.join(`client:${user.client.id}`);
      this.addUserToRoom(userId, `client:${user.client.id}`);
    }

    // Send initial connection confirmation
    socket.emit('connected', {
      userId,
      timestamp: new Date().toISOString(),
      rooms: Array.from(this.userRooms.get(userId) || [])
    });

    // Set up event handlers
    this.setupSocketEventHandlers(socket);
    
    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  setupSocketEventHandlers(socket) {
    const userId = socket.userId;
    
    // Join specific rooms
    socket.on('join_room', (roomName) => {
      if (this.canJoinRoom(socket, roomName)) {
        socket.join(roomName);
        this.addUserToRoom(userId, roomName);
        socket.emit('room_joined', { room: roomName });
        logger.info(`User ${userId} joined room: ${roomName}`);
      } else {
        socket.emit('error', { message: 'Cannot join room', room: roomName });
      }
    });

    // Leave specific rooms
    socket.on('leave_room', (roomName) => {
      socket.leave(roomName);
      this.removeUserFromRoom(userId, roomName);
      socket.emit('room_left', { room: roomName });
      logger.info(`User ${userId} left room: ${roomName}`);
    });

    // Handle location updates
    socket.on('location_update', async (data) => {
      try {
        await this.handleLocationUpdate(socket, data);
      } catch (error) {
        logger.error('Location update error:', error);
        socket.emit('error', { message: 'Failed to update location' });
      }
    });

    // Handle shift status updates
    socket.on('shift_status_update', async (data) => {
      try {
        await this.handleShiftStatusUpdate(socket, data);
      } catch (error) {
        logger.error('Shift status update error:', error);
        socket.emit('error', { message: 'Failed to update shift status' });
      }
    });

    // Handle chat messages
    socket.on('send_message', async (data) => {
      try {
        await this.handleChatMessage(socket, data);
      } catch (error) {
        logger.error('Chat message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      this.handleTypingIndicator(socket, data, true);
    });

    socket.on('typing_stop', (data) => {
      this.handleTypingIndicator(socket, data, false);
    });

    // Handle emergency alerts
    socket.on('emergency_alert', async (data) => {
      try {
        await this.handleEmergencyAlert(socket, data);
      } catch (error) {
        logger.error('Emergency alert error:', error);
        socket.emit('error', { message: 'Failed to send emergency alert' });
      }
    });

    // Handle status updates
    socket.on('status_update', (status) => {
      this.handleStatusUpdate(socket, status);
    });
  }

  handleDisconnection(socket) {
    const userId = socket.userId;
    const user = socket.user;
    
    logger.info(`User disconnected: ${user?.username} (${userId})`);
    
    // Clean up connections
    this.connectedUsers.delete(userId);
    this.userRooms.delete(userId);
    
    // Notify relevant users about disconnection
    this.broadcastToRole('SUPERVISOR', 'user_disconnected', {
      userId,
      username: user?.username,
      role: user?.role,
      timestamp: new Date().toISOString()
    });
  }

  async handleLocationUpdate(socket, data) {
    const { latitude, longitude, accuracy, timestamp, shiftId } = data;
    const userId = socket.userId;

    // Validate location data
    if (!latitude || !longitude || !timestamp) {
      throw new Error('Invalid location data');
    }

    // Store location in database
    const locationRecord = await this.prisma.locationTracking.create({
      data: {
        agentId: socket.user.agent?.id,
        coordinates: `POINT(${longitude} ${latitude})`,
        accuracy: accuracy || 0,
        timestamp: new Date(timestamp),
        shiftId,
        metadata: {
          source: 'websocket',
          userAgent: socket.handshake.headers['user-agent']
        }
      }
    });

    // Broadcast location update to supervisors and relevant clients
    const locationUpdate = {
      userId,
      agentId: socket.user.agent?.id,
      latitude,
      longitude,
      accuracy,
      timestamp,
      shiftId
    };

    this.broadcastToRole('SUPERVISOR', 'location_update', locationUpdate);
    
    // If agent is on a shift, notify the client
    if (shiftId) {
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
        include: { site: { include: { client: true } } }
      });
      
      if (shift?.site?.client) {
        this.broadcastToClient(shift.site.client.id, 'agent_location_update', locationUpdate);
      }
    }

    socket.emit('location_update_confirmed', { id: locationRecord.id });
  }

  async handleShiftStatusUpdate(socket, data) {
    const { shiftId, status, metadata } = data;
    const userId = socket.userId;

    // Update shift status in database
    const updatedShift = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        status,
        metadata: metadata || {},
        updatedAt: new Date()
      },
      include: {
        agent: { include: { user: true } },
        site: { include: { client: true } }
      }
    });

    const statusUpdate = {
      shiftId,
      status,
      agentId: updatedShift.agentId,
      agentName: `${updatedShift.agent.user.profile?.firstName || ''} ${updatedShift.agent.user.profile?.lastName || ''}`.trim(),
      siteName: updatedShift.site.name,
      timestamp: new Date().toISOString(),
      metadata
    };

    // Broadcast to supervisors
    this.broadcastToRole('SUPERVISOR', 'shift_status_update', statusUpdate);
    
    // Broadcast to client
    if (updatedShift.site.client) {
      this.broadcastToClient(updatedShift.site.client.id, 'shift_status_update', statusUpdate);
    }

    socket.emit('shift_status_update_confirmed', statusUpdate);
  }

  async handleChatMessage(socket, data) {
    const { recipientId, message, messageType = 'text', roomId } = data;
    const senderId = socket.userId;

    // Create message record
    const messageRecord = await this.prisma.message.create({
      data: {
        senderId,
        recipientId,
        content: message,
        messageType,
        roomId,
        status: 'SENT'
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            profile: true
          }
        }
      }
    });

    const messageData = {
      id: messageRecord.id,
      senderId,
      senderName: `${messageRecord.sender.profile?.firstName || ''} ${messageRecord.sender.profile?.lastName || ''}`.trim() || messageRecord.sender.username,
      recipientId,
      message,
      messageType,
      timestamp: messageRecord.createdAt.toISOString(),
      roomId
    };

    // Send to recipient
    if (recipientId) {
      this.sendToUser(recipientId, 'new_message', messageData);
    }

    // Send to room if specified
    if (roomId) {
      socket.to(roomId).emit('new_message', messageData);
    }

    socket.emit('message_sent', { messageId: messageRecord.id });
  }

  handleTypingIndicator(socket, data, isTyping) {
    const { recipientId, roomId } = data;
    const userId = socket.userId;
    const user = socket.user;

    const typingData = {
      userId,
      username: user.username,
      isTyping,
      timestamp: new Date().toISOString()
    };

    if (recipientId) {
      this.sendToUser(recipientId, 'typing_indicator', typingData);
    }

    if (roomId) {
      socket.to(roomId).emit('typing_indicator', typingData);
    }
  }

  async handleEmergencyAlert(socket, data) {
    const { message, location, severity = 'HIGH' } = data;
    const userId = socket.userId;
    const user = socket.user;

    // Create emergency alert record
    const alertRecord = await this.prisma.emergencyAlert.create({
      data: {
        userId,
        message,
        location: location ? `POINT(${location.longitude} ${location.latitude})` : null,
        severity,
        status: 'ACTIVE'
      }
    });

    const alertData = {
      id: alertRecord.id,
      userId,
      username: user.username,
      agentName: `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim(),
      message,
      location,
      severity,
      timestamp: alertRecord.createdAt.toISOString()
    };

    // Broadcast emergency alert to all supervisors and admins
    this.broadcastToRole('SUPERVISOR', 'emergency_alert', alertData);
    this.broadcastToRole('ADMIN', 'emergency_alert', alertData);

    // Send push notifications
    await this.sendEmergencyNotifications(alertData);

    socket.emit('emergency_alert_sent', { alertId: alertRecord.id });
  }

  handleStatusUpdate(socket, status) {
    const userId = socket.userId;
    const user = socket.user;

    const statusData = {
      userId,
      username: user.username,
      status,
      timestamp: new Date().toISOString()
    };

    // Broadcast status update to supervisors
    this.broadcastToRole('SUPERVISOR', 'user_status_update', statusData);
  }

  // Utility methods
  canJoinRoom(socket, roomName) {
    const user = socket.user;
    
    // Define room access rules
    if (roomName.startsWith('client:')) {
      const clientId = roomName.split(':')[1];
      return user.role === 'ADMIN' || 
             (user.client && user.client.id === clientId) ||
             (user.role === 'SUPERVISOR');
    }
    
    if (roomName.startsWith('site:')) {
      return user.role === 'ADMIN' || 
             user.role === 'SUPERVISOR' ||
             user.role === 'AGENT';
    }
    
    if (roomName.startsWith('shift:')) {
      return user.role === 'ADMIN' || 
             user.role === 'SUPERVISOR' ||
             user.role === 'AGENT';
    }
    
    // Default: allow joining
    return true;
  }

  addUserToRoom(userId, roomName) {
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId).add(roomName);
  }

  removeUserFromRoom(userId, roomName) {
    if (this.userRooms.has(userId)) {
      this.userRooms.get(userId).delete(roomName);
    }
  }

  sendToUser(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  broadcastToRole(role, event, data) {
    this.io.to(`role:${role}`).emit(event, data);
  }

  broadcastToClient(clientId, event, data) {
    this.io.to(`client:${clientId}`).emit(event, data);
  }

  broadcastToRoom(roomName, event, data) {
    this.io.to(roomName).emit(event, data);
  }

  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }

  async sendEmergencyNotifications(alertData) {
    // This would integrate with push notification services
    // For now, we'll just log the alert
    logger.warn('Emergency Alert:', alertData);
    
    // In a real implementation, you would:
    // 1. Send push notifications to mobile devices
    // 2. Send SMS alerts to supervisors
    // 3. Send email notifications
    // 4. Trigger automated response systems
  }

  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  getUserRooms(userId) {
    return Array.from(this.userRooms.get(userId) || []);
  }

  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  disconnectUser(userId) {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.disconnect();
    }
  }
}

module.exports = WebSocketService;
