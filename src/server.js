const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('express-async-errors');
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import configurations and middleware
const config = require('./config/config');
const logger = require('./config/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const { validateApiKey } = require('./middleware/auth');

// Import routes
// Note: Auth routes removed - using Clerk for authentication
const userRoutes = require('./routes/users');
const agentRoutes = require('./routes/agents');
const siteRoutes = require('./routes/sites');
const shiftRoutes = require('./routes/shifts');
const attendanceRoutes = require('./routes/attendance');
const locationRoutes = require('./routes/locations');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const messageRoutes = require('./routes/messages');
const clientRoutes = require('./routes/clients');
const mediaRoutes = require('./routes/media');
const healthRoutes = require('./routes/health');
const geofencingRoutes = require('./routes/geofencing');
const gdprRoutes = require('./routes/gdpr');
const messagingRoutes = require('./routes/messaging');
const filesRoutes = require('./routes/files');
const adminRoutes = require('./routes/admin');
const performanceRoutes = require('./routes/performance');
const integrationRoutes = require('./routes/integration');
const qrCodeRoutes = require('./routes/qrCode');
const clientPortalRoutes = require('./routes/clientPortal');
const syncRoutes = require('./routes/sync');
const routeRoutes = require('./routes/routes');
const { router: monitoringRoutes, initializeMonitoringService } = require('./routes/monitoring');
const schedulingRoutes = require('./routes/scheduling');
const workforceRoutes = require('./routes/workforce');
const intelligentSchedulingRoutes = require('./routes/intelligentScheduling');
const mobileRoutes = require('./routes/mobile');
const analyticsRoutes = require('./routes/analytics');

// Import services
const { initializeRedis } = require('./services/redis');
const { initializeSocketIO } = require('./services/socketIO');
const WebSocketService = require('./services/websocket');
const NotificationService = require('./services/notification');
const { startBackgroundJobs } = require('./services/backgroundJobs');

// Initialize Express app
const app = express();
const server = createServer(app);

// Initialize Prisma client
const prisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: config.CORS_ORIGIN,
    credentials: true,
  },
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: config.CORS_CREDENTIALS,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (config.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
}
app.use(requestLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// Trust proxy if behind load balancer
if (config.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

// Make Prisma and Socket.IO available to routes
app.locals.prisma = prisma;
app.locals.io = io;

// Health check routes (no auth required)
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

// API routes
// Note: /api/auth routes removed - using Clerk for authentication
app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/geofencing', geofencingRoutes);
app.use('/api/gdpr', gdprRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api', qrCodeRoutes);
app.use('/api/client-portal', clientPortalRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/intelligent-scheduling', intelligentSchedulingRoutes);
app.use('/api/workforce', workforceRoutes);
app.use('/api/mobile', mobileRoutes);
app.use('/api/analytics', analyticsRoutes);

// API documentation (development only)
if (config.NODE_ENV === 'development' && config.ENABLE_API_DOCS) {
  const swaggerJsdoc = require('swagger-jsdoc');
  const swaggerUi = require('swagger-ui-express');
  
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'BahinLink API',
        version: '1.0.0',
        description: 'Workforce Management Solution API',
      },
      servers: [
        {
          url: `http://localhost:${config.PORT}/api`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
    },
    apis: ['./src/routes/*.js', './src/models/*.js'],
  };

  const specs = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'BahinLink API Server',
    version: '1.0.0',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    docs: config.NODE_ENV === 'development' ? '/api-docs' : undefined,
  });
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async () => {
    logger.info('HTTP server closed.');
    
    try {
      await prisma.$disconnect();
      logger.info('Database connection closed.');
      
      // Close Redis connection if initialized
      const redis = require('./services/redis').getRedisClient();
      if (redis) {
        await redis.quit();
        logger.info('Redis connection closed.');
      }
      
      logger.info('Graceful shutdown completed.');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');
    
    // Initialize Redis
    await initializeRedis();
    logger.info('Redis initialized successfully');
    
    // Initialize WebSocket service
    const webSocketService = new WebSocketService(server, prisma);
    const notificationService = new NotificationService(prisma, webSocketService);

    // Make services available globally
    app.locals.webSocketService = webSocketService;
    app.locals.notificationService = notificationService;
    logger.info('WebSocket and Notification services initialized successfully');
    
    // Start background jobs
    if (config.NODE_ENV === 'production') {
      startBackgroundJobs(prisma);
      logger.info('Background jobs started successfully');
    }
    
    // Start HTTP server
    server.listen(config.PORT, () => {
      logger.info(`Server running on port ${config.PORT} in ${config.NODE_ENV} mode`);
      logger.info(`API documentation available at http://localhost:${config.PORT}/api-docs`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = { app, server, prisma };
