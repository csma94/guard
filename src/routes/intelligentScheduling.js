const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const IntelligentSchedulingService = require('../services/intelligentScheduling');
const NotificationService = require('../services/notification');
const WebSocketService = require('../services/websocket');
const logger = require('../config/logger');

const router = express.Router();
const prisma = new PrismaClient();

// Initialize services
const notificationService = new NotificationService(prisma);
const webSocketService = new WebSocketService();
const intelligentSchedulingService = new IntelligentSchedulingService(
  prisma,
  notificationService,
  webSocketService
);

/**
 * Intelligent bulk shift assignment
 * POST /api/intelligent-scheduling/assign-shifts
 */
router.post('/assign-shifts',
  authenticate,
  authorize(['ADMIN', 'SUPERVISOR']),
  [
    body('shiftIds').isArray({ min: 1 }).withMessage('At least one shift ID is required'),
    body('shiftIds.*').isUUID().withMessage('Each shift ID must be a valid UUID'),
    body('optimizationGoal').optional().isIn(['balanced', 'cost', 'quality', 'coverage']).withMessage('Invalid optimization goal'),
    body('allowPartialAssignment').optional().isBoolean(),
    body('notifyAgents').optional().isBoolean(),
    body('validateConstraints').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const {
        shiftIds,
        optimizationGoal = 'balanced',
        allowPartialAssignment = true,
        notifyAgents = true,
        validateConstraints = true,
      } = req.body;

      logger.info(`Starting intelligent assignment for ${shiftIds.length} shifts`, {
        userId: req.user.id,
        optimizationGoal,
        shiftIds,
      });

      const result = await intelligentSchedulingService.assignShiftsIntelligently(shiftIds, {
        optimizationGoal,
        allowPartialAssignment,
        notifyAgents,
        validateConstraints,
      });

      // Log the assignment results
      logger.audit('intelligent_shift_assignment', {
        userId: req.user.id,
        shiftIds,
        successful: result.assignments.length,
        failed: result.failed.length,
        optimizationGoal,
      });

      res.json({
        success: true,
        message: `Successfully assigned ${result.assignments.length} out of ${shiftIds.length} shifts`,
        data: result,
      });
    } catch (error) {
      logger.error('Intelligent shift assignment failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign shifts intelligently',
        error: error.message,
      });
    }
  }
);

/**
 * Get assignment recommendations for a shift
 * GET /api/intelligent-scheduling/recommendations/:shiftId
 */
router.get('/recommendations/:shiftId',
  authenticate,
  authorize(['ADMIN', 'SUPERVISOR']),
  [
    param('shiftId').isUUID().withMessage('Valid shift ID is required'),
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
    query('includeUnavailable').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { shiftId } = req.params;
      const { limit = 10, includeUnavailable = false } = req.query;

      // Load shift with context
      const shifts = await intelligentSchedulingService.loadShiftsWithContext([shiftId]);
      if (shifts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Shift not found',
        });
      }

      const shift = shifts[0];

      // Load agents with workload
      const agents = await intelligentSchedulingService.loadAgentsWithWorkload([shift]);

      // Create assignment matrix for this shift
      const matrix = await intelligentSchedulingService.createAssignmentMatrix([shift], agents);
      
      if (matrix.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No assignment data available',
        });
      }

      const shiftMatrix = matrix[0];
      let recommendations = shiftMatrix.assignments;

      // Filter out unavailable agents if requested
      if (!includeUnavailable) {
        recommendations = recommendations.filter(rec => rec.feasible);
      }

      // Limit results
      recommendations = recommendations.slice(0, parseInt(limit));

      // Enrich with agent details
      const enrichedRecommendations = recommendations.map(rec => {
        const agent = agents.find(a => a.id === rec.agentId);
        return {
          ...rec,
          agent: {
            id: agent.id,
            user: agent.user,
            skills: agent.skills,
            performance: agent.performance,
            workload: agent.workload,
            availability: agent.availability,
          },
        };
      });

      res.json({
        success: true,
        data: {
          shift: {
            id: shift.id,
            siteId: shift.siteId,
            siteName: shift.site.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            requiredSkills: shift.requiredSkills,
            priority: shift.priority,
          },
          recommendations: enrichedRecommendations,
          totalAgents: agents.length,
          availableAgents: recommendations.filter(r => r.feasible).length,
        },
      });
    } catch (error) {
      logger.error('Failed to get assignment recommendations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get assignment recommendations',
        error: error.message,
      });
    }
  }
);

/**
 * Optimize existing schedule
 * POST /api/intelligent-scheduling/optimize-schedule
 */
router.post('/optimize-schedule',
  authenticate,
  authorize(['ADMIN', 'SUPERVISOR']),
  [
    body('siteId').optional().isUUID().withMessage('Valid site ID required'),
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
    body('optimizationGoal').optional().isIn(['balanced', 'cost', 'quality', 'coverage']),
    body('preserveExistingAssignments').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const {
        siteId,
        startDate,
        endDate,
        optimizationGoal = 'balanced',
        preserveExistingAssignments = true,
      } = req.body;

      // Get shifts in the specified period
      const whereClause = {
        startTime: { gte: new Date(startDate) },
        endTime: { lte: new Date(endDate) },
        deletedAt: null,
        ...(siteId && { siteId }),
      };

      const shifts = await prisma.shift.findMany({
        where: whereClause,
        select: { id: true },
      });

      if (shifts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No shifts found in the specified period',
        });
      }

      const shiftIds = shifts.map(s => s.id);

      // If preserving existing assignments, only optimize unassigned shifts
      let targetShiftIds = shiftIds;
      if (preserveExistingAssignments) {
        const unassignedShifts = await prisma.shift.findMany({
          where: {
            id: { in: shiftIds },
            agentId: null,
          },
          select: { id: true },
        });
        targetShiftIds = unassignedShifts.map(s => s.id);
      }

      if (targetShiftIds.length === 0) {
        return res.json({
          success: true,
          message: 'All shifts in the period are already assigned',
          data: {
            totalShifts: shiftIds.length,
            optimizedShifts: 0,
            assignments: [],
          },
        });
      }

      // Run intelligent assignment
      const result = await intelligentSchedulingService.assignShiftsIntelligently(targetShiftIds, {
        optimizationGoal,
        allowPartialAssignment: true,
        notifyAgents: true,
        validateConstraints: true,
      });

      logger.audit('schedule_optimization', {
        userId: req.user.id,
        siteId,
        startDate,
        endDate,
        totalShifts: shiftIds.length,
        optimizedShifts: targetShiftIds.length,
        successful: result.assignments.length,
        optimizationGoal,
      });

      res.json({
        success: true,
        message: `Optimized ${result.assignments.length} out of ${targetShiftIds.length} shifts`,
        data: {
          totalShifts: shiftIds.length,
          optimizedShifts: targetShiftIds.length,
          successful: result.assignments.length,
          failed: result.failed.length,
          assignments: result.assignments,
          report: result.report,
        },
      });
    } catch (error) {
      logger.error('Schedule optimization failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to optimize schedule',
        error: error.message,
      });
    }
  }
);

/**
 * Get assignment analytics
 * GET /api/intelligent-scheduling/analytics
 */
router.get('/analytics',
  authenticate,
  authorize(['ADMIN', 'SUPERVISOR']),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('siteId').optional().isUUID(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate = new Date().toISOString(),
        siteId,
      } = req.query;

      const whereClause = {
        assignedAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        ...(siteId && {
          shift: { siteId },
        }),
      };

      // Get assignment statistics
      const assignments = await prisma.shiftAssignment.findMany({
        where: whereClause,
        include: {
          shift: {
            include: {
              site: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          agent: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
        },
      });

      // Calculate analytics
      const analytics = {
        totalAssignments: assignments.length,
        assignmentMethods: {},
        averageScore: 0,
        scoreDistribution: {
          excellent: 0, // 0.9+
          good: 0,      // 0.7-0.89
          fair: 0,      // 0.5-0.69
          poor: 0,      // <0.5
        },
        topPerformingAgents: {},
        siteStatistics: {},
      };

      if (assignments.length > 0) {
        // Assignment methods breakdown
        assignments.forEach(assignment => {
          const method = assignment.assignmentMethod;
          analytics.assignmentMethods[method] = (analytics.assignmentMethods[method] || 0) + 1;
        });

        // Average score
        const totalScore = assignments.reduce((sum, a) => sum + a.assignmentScore, 0);
        analytics.averageScore = totalScore / assignments.length;

        // Score distribution
        assignments.forEach(assignment => {
          const score = assignment.assignmentScore;
          if (score >= 0.9) analytics.scoreDistribution.excellent++;
          else if (score >= 0.7) analytics.scoreDistribution.good++;
          else if (score >= 0.5) analytics.scoreDistribution.fair++;
          else analytics.scoreDistribution.poor++;
        });

        // Top performing agents
        assignments.forEach(assignment => {
          const agentId = assignment.agentId;
          if (!analytics.topPerformingAgents[agentId]) {
            analytics.topPerformingAgents[agentId] = {
              agent: assignment.agent,
              assignments: 0,
              averageScore: 0,
              totalScore: 0,
            };
          }
          analytics.topPerformingAgents[agentId].assignments++;
          analytics.topPerformingAgents[agentId].totalScore += assignment.assignmentScore;
          analytics.topPerformingAgents[agentId].averageScore = 
            analytics.topPerformingAgents[agentId].totalScore / 
            analytics.topPerformingAgents[agentId].assignments;
        });

        // Convert to array and sort
        analytics.topPerformingAgents = Object.values(analytics.topPerformingAgents)
          .sort((a, b) => b.averageScore - a.averageScore)
          .slice(0, 10);

        // Site statistics
        assignments.forEach(assignment => {
          const siteId = assignment.shift.siteId;
          const siteName = assignment.shift.site.name;
          if (!analytics.siteStatistics[siteId]) {
            analytics.siteStatistics[siteId] = {
              siteId,
              siteName,
              assignments: 0,
              averageScore: 0,
              totalScore: 0,
            };
          }
          analytics.siteStatistics[siteId].assignments++;
          analytics.siteStatistics[siteId].totalScore += assignment.assignmentScore;
          analytics.siteStatistics[siteId].averageScore = 
            analytics.siteStatistics[siteId].totalScore / 
            analytics.siteStatistics[siteId].assignments;
        });

        analytics.siteStatistics = Object.values(analytics.siteStatistics);
      }

      res.json({
        success: true,
        data: {
          period: { startDate, endDate },
          analytics,
        },
      });
    } catch (error) {
      logger.error('Failed to get assignment analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get assignment analytics',
        error: error.message,
      });
    }
  }
);

module.exports = router;
