const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const OfflineSyncService = require('../services/offlineSync');
const logger = require('../config/logger');

const router = express.Router();

/**
 * Process offline data sync from mobile app
 * POST /api/sync/upload
 */
router.post('/upload',
  authenticate,
  authorize('AGENT'),
  [
    body('attendance').optional().isArray(),
    body('locationTracking').optional().isArray(),
    body('reports').optional().isArray(),
    body('mediaFiles').optional().isArray(),
    body('lastSyncTimestamp').optional().isISO8601(),
    body('deviceInfo').optional().isObject()
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can sync data');
    }

    const syncData = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const offlineSyncService = new OfflineSyncService(prisma, io);

    try {
      const syncResults = await offlineSyncService.processOfflineSync(
        req.user.agent.id,
        syncData
      );

      logger.info('Offline sync completed', {
        agentId: req.user.agent.id,
        processed: syncResults.processed,
        errorCount: syncResults.errors.length,
        conflictCount: syncResults.conflicts.length
      });

      res.json({
        success: true,
        message: 'Sync completed successfully',
        results: syncResults
      });

    } catch (error) {
      logger.error('Offline sync failed:', {
        agentId: req.user.agent.id,
        error: error.message,
        stack: error.stack
      });

      throw new ApiError(500, 'Sync failed: ' + error.message);
    }
  })
);

/**
 * Get sync data for mobile app
 * GET /api/sync/download
 */
router.get('/download',
  authenticate,
  authorize('AGENT'),
  [
    query('lastSyncTimestamp').optional().isISO8601().withMessage('Invalid timestamp format')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can download sync data');
    }

    const { lastSyncTimestamp } = req.query;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const offlineSyncService = new OfflineSyncService(prisma, io);

    try {
      const syncData = await offlineSyncService.getSyncData(
        req.user.agent.id,
        lastSyncTimestamp
      );

      logger.info('Sync data downloaded', {
        agentId: req.user.agent.id,
        shiftsCount: syncData.shifts.length,
        templatesCount: syncData.reportTemplates.length,
        reportsCount: syncData.reports.length,
        lastSyncTimestamp
      });

      res.json({
        success: true,
        data: syncData
      });

    } catch (error) {
      logger.error('Sync data download failed:', {
        agentId: req.user.agent.id,
        error: error.message,
        stack: error.stack
      });

      throw new ApiError(500, 'Failed to get sync data: ' + error.message);
    }
  })
);

/**
 * Check sync status
 * GET /api/sync/status
 */
router.get('/status',
  authenticate,
  authorize('AGENT'),
  asyncHandler(async (req, res) => {
    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can check sync status');
    }

    const prisma = req.app.locals.prisma;

    // Get last sync information from audit logs
    const lastSync = await prisma.auditLog.findFirst({
      where: {
        userId: req.user.agent.id,
        action: 'OFFLINE_SYNC'
      },
      orderBy: { timestamp: 'desc' }
    });

    // Get pending data counts
    const now = new Date();
    const cutoffTime = lastSync ? lastSync.timestamp : new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      pendingShifts,
      pendingReports,
      pendingAttendance
    ] = await Promise.all([
      prisma.shift.count({
        where: {
          agentId: req.user.agent.id,
          updatedAt: { gte: cutoffTime },
          deletedAt: null
        }
      }),
      prisma.report.count({
        where: {
          agentId: req.user.agent.id,
          updatedAt: { gte: cutoffTime },
          deletedAt: null
        }
      }),
      prisma.attendance.count({
        where: {
          agentId: req.user.agent.id,
          updatedAt: { gte: cutoffTime }
        }
      })
    ]);

    const syncStatus = {
      lastSyncTimestamp: lastSync?.timestamp || null,
      lastSyncSuccess: lastSync ? 
        (lastSync.newValues?.syncResults?.success || false) : null,
      pendingData: {
        shifts: pendingShifts,
        reports: pendingReports,
        attendance: pendingAttendance
      },
      needsSync: pendingShifts > 0 || pendingReports > 0 || pendingAttendance > 0,
      serverTime: now.toISOString()
    };

    res.json({
      success: true,
      status: syncStatus
    });
  })
);

/**
 * Force sync for specific data types
 * POST /api/sync/force
 */
router.post('/force',
  authenticate,
  authorize('AGENT'),
  [
    body('dataTypes').isArray().withMessage('Data types must be an array'),
    body('dataTypes.*').isIn(['shifts', 'reports', 'attendance', 'templates']).withMessage('Invalid data type'),
    body('forceAll').optional().isBoolean()
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can force sync');
    }

    const { dataTypes, forceAll = false } = req.body;
    const prisma = req.app.locals.prisma;
    const io = req.app.locals.io;

    const offlineSyncService = new OfflineSyncService(prisma, io);

    try {
      // Get fresh sync data for requested types
      const syncData = await offlineSyncService.getSyncData(
        req.user.agent.id,
        forceAll ? null : new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      );

      // Filter data based on requested types
      const filteredData = {};
      
      if (dataTypes.includes('shifts')) {
        filteredData.shifts = syncData.shifts;
      }
      
      if (dataTypes.includes('reports')) {
        filteredData.reports = syncData.reports;
      }
      
      if (dataTypes.includes('templates')) {
        filteredData.reportTemplates = syncData.reportTemplates;
      }

      filteredData.syncTimestamp = syncData.syncTimestamp;

      logger.info('Force sync requested', {
        agentId: req.user.agent.id,
        dataTypes,
        forceAll
      });

      res.json({
        success: true,
        message: 'Force sync data retrieved',
        data: filteredData
      });

    } catch (error) {
      logger.error('Force sync failed:', {
        agentId: req.user.agent.id,
        error: error.message,
        stack: error.stack
      });

      throw new ApiError(500, 'Force sync failed: ' + error.message);
    }
  })
);

/**
 * Get sync conflicts for resolution
 * GET /api/sync/conflicts
 */
router.get('/conflicts',
  authenticate,
  authorize('AGENT'),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    if (!req.user.agent) {
      throw new ApiError(403, 'Only agents can view sync conflicts');
    }

    const { page = 1, limit = 20 } = req.query;
    const prisma = req.app.locals.prisma;

    // Get sync conflicts from audit logs
    const conflicts = await prisma.auditLog.findMany({
      where: {
        userId: req.user.agent.id,
        action: 'OFFLINE_SYNC',
        newValues: {
          path: ['syncResults', 'conflicts'],
          not: []
        }
      },
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: parseInt(limit)
    });

    // Extract conflict details
    const conflictDetails = conflicts.flatMap(log => {
      const syncResults = log.newValues?.syncResults;
      if (syncResults?.conflicts) {
        return syncResults.conflicts.map(conflict => ({
          syncId: log.id,
          syncTimestamp: log.timestamp,
          ...conflict
        }));
      }
      return [];
    });

    res.json({
      success: true,
      conflicts: conflictDetails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: conflictDetails.length
      }
    });
  })
);

/**
 * Health check for sync service
 * GET /api/sync/health
 */
router.get('/health',
  authenticate,
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;

      // Get sync statistics
      const recentSyncs = await prisma.auditLog.count({
        where: {
          action: 'OFFLINE_SYNC',
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      res.json({
        success: true,
        status: 'healthy',
        statistics: {
          recentSyncs,
          serverTime: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Sync health check failed:', error);
      
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        error: 'Database connection failed'
      });
    }
  })
);

module.exports = router;
