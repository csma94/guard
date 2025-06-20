const jwt = require('jsonwebtoken');
const config = require('../config/config');
const logger = require('../config/logger');

/**
 * Initialize Socket.IO server with authentication and event handlers
 */
const initializeSocketIO = (io, prisma) => {
  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, config.JWT_SECRET);
      
      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          username: true,
          role: true,
          status: true,
          agent: {
            select: {
              id: true,
              employeeId: true,
            },
          },
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        return next(new Error('User not found or inactive'));
      }

      socket.userId = user.id;
      socket.userRole = user.role;
      socket.agentId = user.agent?.id;
      
      logger.info('Socket.IO user connected', {
        userId: user.id,
        username: user.username,
        role: user.role,
        socketId: socket.id,
      });

      next();
    } catch (error) {
      logger.error('Socket.IO authentication failed', {
        error: error.message,
        socketId: socket.id,
      });
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info('Socket.IO client connected', {
      userId: socket.userId,
      role: socket.userRole,
      socketId: socket.id,
    });

    // Join user to their personal room
    socket.join(`user:${socket.userId}`);
    
    // Join role-based rooms
    socket.join(`role:${socket.userRole.toLowerCase()}`);
    
    // Join agent-specific room if user is an agent
    if (socket.agentId) {
      socket.join(`agent:${socket.agentId}`);
    }

    // Handle location updates from agents
    socket.on('location_update', async (data) => {
      try {
        if (socket.userRole !== 'AGENT' || !socket.agentId) {
          socket.emit('error', { message: 'Only agents can send location updates' });
          return;
        }

        const { latitude, longitude, accuracy, timestamp, batteryLevel } = data;

        // Validate location data
        if (!latitude || !longitude || !timestamp) {
          socket.emit('error', { message: 'Invalid location data' });
          return;
        }

        // Store location in database
        await prisma.locationTracking.create({
          data: {
            agentId: socket.agentId,
            coordinates: `POINT(${longitude} ${latitude})`,
            accuracy: accuracy || null,
            timestamp: new Date(timestamp),
            batteryLevel: batteryLevel || null,
            isMockLocation: false, // TODO: Implement mock location detection
          },
        });

        // Broadcast location to supervisors and admins
        socket.to('role:supervisor').to('role:admin').emit('agent_location_update', {
          agentId: socket.agentId,
          latitude,
          longitude,
          accuracy,
          timestamp,
          batteryLevel,
        });

        logger.info('Location update received', {
          agentId: socket.agentId,
          latitude,
          longitude,
          accuracy,
          timestamp,
        });

      } catch (error) {
        logger.error('Error processing location update', {
          error: error.message,
          agentId: socket.agentId,
          data,
        });
        socket.emit('error', { message: 'Failed to process location update' });
      }
    });

    // Handle shift status updates
    socket.on('shift_status_update', async (data) => {
      try {
        const { shiftId, status, location } = data;

        // Validate shift access
        const shift = await prisma.shift.findFirst({
          where: {
            id: shiftId,
            agentId: socket.agentId,
          },
        });

        if (!shift) {
          socket.emit('error', { message: 'Shift not found or access denied' });
          return;
        }

        // Update shift status
        await prisma.shift.update({
          where: { id: shiftId },
          data: { status },
        });

        // Broadcast to supervisors
        io.to('role:supervisor').to('role:admin').emit('shift_status_changed', {
          shiftId,
          agentId: socket.agentId,
          status,
          timestamp: new Date(),
        });

        socket.emit('shift_status_updated', { shiftId, status });

        logger.info('Shift status updated', {
          shiftId,
          agentId: socket.agentId,
          status,
        });

      } catch (error) {
        logger.error('Error updating shift status', {
          error: error.message,
          agentId: socket.agentId,
          data,
        });
        socket.emit('error', { message: 'Failed to update shift status' });
      }
    });

    // Handle emergency alerts
    socket.on('emergency_alert', async (data) => {
      try {
        if (socket.userRole !== 'AGENT' || !socket.agentId) {
          socket.emit('error', { message: 'Only agents can send emergency alerts' });
          return;
        }

        const { type, description, location } = data;

        // Create emergency notification
        const notification = await prisma.notification.create({
          data: {
            recipientId: socket.userId, // Will be updated to broadcast to supervisors
            type: 'EMERGENCY',
            title: 'Emergency Alert',
            message: `Emergency alert from agent: ${description}`,
            data: {
              agentId: socket.agentId,
              emergencyType: type,
              location,
              timestamp: new Date(),
            },
            channels: ['PUSH', 'EMAIL', 'SMS'],
          },
        });

        // Broadcast emergency alert to all supervisors and admins
        io.to('role:supervisor').to('role:admin').emit('emergency_alert', {
          id: notification.id,
          agentId: socket.agentId,
          type,
          description,
          location,
          timestamp: new Date(),
        });

        socket.emit('emergency_alert_sent', { alertId: notification.id });

        logger.security('Emergency alert sent', {
          agentId: socket.agentId,
          type,
          description,
          location,
        });

      } catch (error) {
        logger.error('Error processing emergency alert', {
          error: error.message,
          agentId: socket.agentId,
          data,
        });
        socket.emit('error', { message: 'Failed to send emergency alert' });
      }
    });

    // Handle chat messages
    socket.on('send_message', async (data) => {
      try {
        const { recipientId, message, type = 'TEXT' } = data;

        // Create message in database
        const newMessage = await prisma.message.create({
          data: {
            senderId: socket.userId,
            recipientId,
            message,
            messageType: type,
            status: 'SENT',
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

        // Send message to recipient
        io.to(`user:${recipientId}`).emit('new_message', {
          id: newMessage.id,
          senderId: socket.userId,
          sender: newMessage.sender,
          message,
          type,
          timestamp: newMessage.createdAt,
        });

        // Confirm message sent to sender
        socket.emit('message_sent', {
          id: newMessage.id,
          recipientId,
          timestamp: newMessage.createdAt,
        });

        logger.info('Message sent', {
          messageId: newMessage.id,
          senderId: socket.userId,
          recipientId,
        });

      } catch (error) {
        logger.error('Error sending message', {
          error: error.message,
          senderId: socket.userId,
          data,
        });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { recipientId } = data;
      io.to(`user:${recipientId}`).emit('user_typing', {
        userId: socket.userId,
        typing: true,
      });
    });

    socket.on('typing_stop', (data) => {
      const { recipientId } = data;
      io.to(`user:${recipientId}`).emit('user_typing', {
        userId: socket.userId,
        typing: false,
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info('Socket.IO client disconnected', {
        userId: socket.userId,
        role: socket.userRole,
        socketId: socket.id,
        reason,
      });
    });

    // Handle connection errors
    socket.on('error', (error) => {
      logger.error('Socket.IO error', {
        userId: socket.userId,
        socketId: socket.id,
        error: error.message,
      });
    });
  });

  // Helper functions for broadcasting
  const broadcast = {
    /**
     * Send notification to specific user
     */
    toUser: (userId, event, data) => {
      io.to(`user:${userId}`).emit(event, data);
    },

    /**
     * Send notification to all users with specific role
     */
    toRole: (role, event, data) => {
      io.to(`role:${role.toLowerCase()}`).emit(event, data);
    },

    /**
     * Send notification to all supervisors and admins
     */
    toManagement: (event, data) => {
      io.to('role:supervisor').to('role:admin').emit(event, data);
    },

    /**
     * Send notification to all connected clients
     */
    toAll: (event, data) => {
      io.emit(event, data);
    },
  };

  return { io, broadcast };
};

module.exports = {
  initializeSocketIO,
};
