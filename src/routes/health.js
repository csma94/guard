const express = require('express');
const { PrismaClient } = require('@prisma/client');
const config = require('../config/config');
const HealthCheckService = require('../services/healthCheck');
const PerformanceMonitoringService = require('../services/performanceMonitoring');
const logger = require('../config/logger');

const router = express.Router();

/**
 * Initialize health check service
 */
const initializeHealthService = (req, res, next) => {
  if (!req.app.locals.healthCheckService) {
    req.app.locals.healthCheckService = new HealthCheckService(
      req.app.locals.prisma,
      req.app.locals.redis
    );
  }

  if (!req.app.locals.performanceMonitoringService) {
    req.app.locals.performanceMonitoringService = new PerformanceMonitoringService(
      req.app.locals.prisma,
      req.app.locals.redis
    );
  }

  next();
};

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API and its dependencies
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: Process uptime in seconds
 *                 version:
 *                   type: string
 *                 environment:
 *                   type: string
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       example: healthy
 *                     redis:
 *                       type: string
 *                       example: healthy
 *       503:
 *         description: Service is unhealthy
 */
router.get('/', initializeHealthService, async (req, res) => {
  try {
    const healthCheck = req.app.locals.healthCheckService;
    const result = await healthCheck.performHealthCheck();

    const statusCode = result.status === 'healthy' ? 200 :
                      result.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(result);
  } catch (error) {
    logger.error('Health check endpoint failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check service unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /ready:
 *   get:
 *     summary: Readiness check endpoint
 *     description: Returns whether the service is ready to accept requests
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if database is accessible
    const prisma = req.app.locals.prisma || new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /live:
 *   get:
 *     summary: Liveness check endpoint
 *     description: Returns whether the service is alive
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * @swagger
 * /version:
 *   get:
 *     summary: Version information
 *     description: Returns version and build information
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Version information
 */
router.get('/version', (req, res) => {
  res.json({
    version: process.env.npm_package_version || '1.0.0',
    name: 'BahinLink API',
    description: 'Workforce Management Solution API',
    environment: config.NODE_ENV,
    nodeVersion: process.version,
    buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    gitCommit: process.env.GIT_COMMIT || 'unknown',
  });
});

/**
 * Detailed health check endpoint
 * GET /detailed
 */
router.get('/detailed', initializeHealthService, async (req, res) => {
  try {
    const healthCheck = req.app.locals.healthCheckService;
    const performanceMonitoring = req.app.locals.performanceMonitoringService;

    const [healthResult, performanceMetrics] = await Promise.all([
      healthCheck.performHealthCheck(),
      performanceMonitoring ? performanceMonitoring.getDetailedMetrics() : {},
    ]);

    const result = {
      ...healthResult,
      performance: performanceMetrics,
    };

    const statusCode = result.status === 'healthy' ? 200 :
                      result.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(result);
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Detailed health check service unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Performance metrics endpoint
 * GET /metrics
 */
router.get('/metrics', initializeHealthService, async (req, res) => {
  try {
    const performanceMonitoring = req.app.locals.performanceMonitoringService;

    if (!performanceMonitoring) {
      return res.status(503).json({
        error: 'Performance monitoring not available',
        timestamp: new Date().toISOString(),
      });
    }

    const metrics = await performanceMonitoring.getPrometheusMetrics();

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    logger.error('Metrics endpoint failed:', error);
    res.status(500).json({
      error: 'Metrics service unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * System information endpoint
 * GET /info
 */
router.get('/info', initializeHealthService, async (req, res) => {
  try {
    const healthCheck = req.app.locals.healthCheckService;
    const metrics = await healthCheck.collectMetrics();

    const info = {
      application: {
        name: 'BahinLink Workforce Management',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        buildDate: process.env.BUILD_DATE || 'unknown',
        gitCommit: process.env.GIT_COMMIT || 'unknown',
      },
      runtime: metrics.nodejs,
      system: {
        platform: metrics.system.platform,
        arch: metrics.system.arch,
        cpus: metrics.system.cpus,
        memory: {
          total: Math.round(metrics.system.totalmem / 1024 / 1024), // MB
          free: Math.round(metrics.system.freemem / 1024 / 1024), // MB
        },
      },
      features: {
        authentication: true,
        realTimeTracking: true,
        fileUpload: true,
        notifications: true,
        clientPortal: true,
        mobileApp: true,
      },
      dependencies: {
        database: 'PostgreSQL',
        cache: 'Redis',
        fileStorage: process.env.AWS_S3_BUCKET ? 'AWS S3' : 'Local',
        notifications: {
          sms: !!process.env.TWILIO_ACCOUNT_SID,
          email: !!process.env.SENDGRID_API_KEY,
          push: !!process.env.FIREBASE_PROJECT_ID,
        },
      },
    };

    res.json(info);
  } catch (error) {
    logger.error('System info endpoint failed:', error);
    res.status(500).json({
      error: 'System info service unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
