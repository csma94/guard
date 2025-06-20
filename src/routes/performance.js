const express = require('express');
const { query, body, validationResult } = require('express-validator');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const PerformanceService = require('../services/performance');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /performance/metrics:
 *   get:
 *     summary: Get performance metrics
 *     description: Get current system performance metrics and monitoring data
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance metrics retrieved successfully
 */
router.get('/metrics',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const performanceService = new PerformanceService(prisma);

    const metrics = await performanceService.monitorPerformance();

    res.json({
      success: true,
      metrics
    });
  })
);

/**
 * @swagger
 * /performance/analysis:
 *   get:
 *     summary: Get query performance analysis
 *     description: Get detailed analysis of query performance and optimization suggestions
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance analysis retrieved successfully
 */
router.get('/analysis',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const performanceService = new PerformanceService(prisma);

    const analysis = await performanceService.analyzeQueryPerformance();

    res.json({
      success: true,
      analysis
    });
  })
);

/**
 * @swagger
 * /performance/cache/clear:
 *   post:
 *     summary: Clear cache
 *     description: Clear cache entries by pattern or clear all cache
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pattern:
 *                 type: string
 *                 description: Cache key pattern to clear (optional)
 *               clearAll:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 */
router.post('/cache/clear',
  authenticate,
  authorize('ADMIN'),
  [
    body('pattern').optional().isString(),
    body('clearAll').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { pattern, clearAll = false } = req.body;
    const prisma = req.app.locals.prisma;
    const performanceService = new PerformanceService(prisma);

    let result;
    if (clearAll) {
      // Clear all cache
      result = await performanceService.clearCachePattern('*');
    } else if (pattern) {
      // Clear specific pattern
      result = await performanceService.clearCachePattern(pattern);
    } else {
      throw new ApiError(400, 'Either pattern or clearAll must be specified');
    }

    // Log cache clear operation
    logger.audit('cache_cleared', {
      clearedBy: req.user.id,
      pattern: pattern || 'ALL',
      clearAll,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Cache cleared successfully',
      pattern: pattern || 'ALL',
      result
    });
  })
);

/**
 * @swagger
 * /performance/optimize/memory:
 *   post:
 *     summary: Optimize memory usage
 *     description: Trigger memory optimization and garbage collection
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Memory optimization completed
 */
router.post('/optimize/memory',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const performanceService = new PerformanceService(prisma);

    const result = await performanceService.optimizeMemoryUsage();

    // Log memory optimization
    logger.audit('memory_optimization_triggered', {
      triggeredBy: req.user.id,
      memoryBefore: result.memoryUsage,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Memory optimization completed',
      result
    });
  })
);

/**
 * @swagger
 * /performance/database/connections:
 *   get:
 *     summary: Get database connection status
 *     description: Get current database connection pool status and optimization info
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Database connection status retrieved
 */
router.get('/database/connections',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const performanceService = new PerformanceService(prisma);

    const connectionStatus = await performanceService.optimizeConnectionPool();

    res.json({
      success: true,
      connectionStatus
    });
  })
);

/**
 * @swagger
 * /performance/cache/stats:
 *   get:
 *     summary: Get cache statistics
 *     description: Get detailed cache performance statistics
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics retrieved
 */
router.get('/cache/stats',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;
    const performanceService = new PerformanceService(prisma);

    // Get cache statistics from Redis if available
    let cacheStats = {
      available: false,
      message: 'Cache not available'
    };

    if (performanceService.redis) {
      try {
        const info = await performanceService.redis.info('memory');
        const keyspace = await performanceService.redis.info('keyspace');
        
        cacheStats = {
          available: true,
          memory: info,
          keyspace: keyspace,
          hitRate: (performanceService.performanceMetrics.cacheHits / 
                   (performanceService.performanceMetrics.cacheHits + performanceService.performanceMetrics.cacheMisses)) * 100,
          totalHits: performanceService.performanceMetrics.cacheHits,
          totalMisses: performanceService.performanceMetrics.cacheMisses
        };
      } catch (error) {
        cacheStats = {
          available: false,
          error: error.message
        };
      }
    }

    res.json({
      success: true,
      cacheStats
    });
  })
);

/**
 * @swagger
 * /performance/batch/update:
 *   post:
 *     summary: Perform batch update operation
 *     description: Perform optimized batch update operations
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - model
 *               - updates
 *             properties:
 *               model:
 *                 type: string
 *                 enum: [shift, report, user, site]
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     data:
 *                       type: object
 *     responses:
 *       200:
 *         description: Batch update completed successfully
 */
router.post('/batch/update',
  authenticate,
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('model').isIn(['shift', 'report', 'user', 'site']).withMessage('Valid model is required'),
    body('updates').isArray().withMessage('Updates must be an array'),
    body('updates.*.id').isUUID().withMessage('Each update must have a valid ID'),
    body('updates.*.data').isObject().withMessage('Each update must have data object'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { model, updates } = req.body;
    const prisma = req.app.locals.prisma;
    const performanceService = new PerformanceService(prisma);

    if (updates.length === 0) {
      throw new ApiError(400, 'At least one update is required');
    }

    if (updates.length > 1000) {
      throw new ApiError(400, 'Cannot process more than 1000 updates at once');
    }

    let results;
    switch (model) {
      case 'shift':
        results = await performanceService.batchUpdateShifts(updates);
        break;
      default:
        throw new ApiError(400, `Batch update not implemented for model: ${model}`);
    }

    // Log batch operation
    logger.audit('batch_update_performed', {
      performedBy: req.user.id,
      model,
      updateCount: updates.length,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: `Batch update completed for ${updates.length} ${model} records`,
      results: {
        processed: updates.length,
        successful: results.length
      }
    });
  })
);

/**
 * @swagger
 * /performance/paginated/{model}:
 *   get:
 *     summary: Get paginated results
 *     description: Get optimized paginated results using cursor-based pagination
 *     tags: [Performance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, shift, report, site]
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, name]
 *           default: createdAt
 *       - in: query
 *         name: orderDirection
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Paginated results retrieved successfully
 */
router.get('/paginated/:model',
  authenticate,
  [
    query('cursor').optional().isUUID(),
    query('take').optional().isInt({ min: 1, max: 100 }),
    query('orderBy').optional().isIn(['createdAt', 'updatedAt', 'name']),
    query('orderDirection').optional().isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { model } = req.params;
    const { cursor, take = 20, orderBy = 'createdAt', orderDirection = 'desc' } = req.query;

    if (!['user', 'shift', 'report', 'site'].includes(model)) {
      throw new ApiError(400, 'Invalid model specified');
    }

    const prisma = req.app.locals.prisma;
    const performanceService = new PerformanceService(prisma);

    const options = {
      cursor,
      take: parseInt(take),
      orderBy: { [orderBy]: orderDirection },
      where: { deletedAt: null } // Exclude soft-deleted records
    };

    // Add role-based filtering
    if (req.user.role === 'CLIENT' && req.user.client) {
      if (model === 'site') {
        options.where.clientId = req.user.client.id;
      } else if (model === 'shift' || model === 'report') {
        options.where.site = { clientId: req.user.client.id };
      }
    } else if (req.user.role === 'AGENT' && req.user.agent) {
      if (model === 'shift' || model === 'report') {
        options.where.agentId = req.user.agent.id;
      }
    }

    const results = await performanceService.getPaginatedResults(model, options);

    res.json({
      success: true,
      data: results.data,
      pagination: {
        hasMore: results.hasMore,
        nextCursor: results.nextCursor,
        take: parseInt(take)
      }
    });
  })
);

module.exports = router;
