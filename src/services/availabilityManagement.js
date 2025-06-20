const logger = require('../config/logger');

/**
 * Advanced agent availability and preference management service
 */
class AvailabilityManagementService {
  constructor(prisma, io) {
    this.prisma = prisma;
    this.io = io;
  }

  /**
   * Set agent availability preferences
   */
  async setAgentAvailability(agentId, availabilityData, updatedBy) {
    try {
      const {
        weeklySchedule = {},
        timeOffRequests = [],
        preferredSites = [],
        maxHoursPerWeek = 40,
        maxConsecutiveDays = 5,
        minimumRestHours = 12,
        overtimePreference = false,
        emergencyAvailability = false,
        travelRadius = 50, // km
        specialRequirements = [],
      } = availabilityData;

      // Validate agent exists
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId, deletedAt: null },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: true,
            },
          },
        },
      });

      if (!agent) {
        throw new Error('Agent not found');
      }

      // Update agent preferences
      const updatedAgent = await this.prisma.agent.update({
        where: { id: agentId },
        data: {
          user: {
            update: {
              preferences: {
                ...agent.user.preferences,
                availability: {
                  weeklySchedule,
                  maxHoursPerWeek,
                  maxConsecutiveDays,
                  minimumRestHours,
                  overtimePreference,
                  emergencyAvailability,
                  travelRadius,
                  specialRequirements,
                  updatedAt: new Date(),
                  updatedBy,
                },
                preferredSites,
              },
            },
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: true,
              preferences: true,
            },
          },
        },
      });

      // Process time off requests
      if (timeOffRequests.length > 0) {
        await this.processTimeOffRequests(agentId, timeOffRequests, updatedBy);
      }

      // Emit real-time update
      this.emitAvailabilityUpdate(agentId, 'availability_updated');

      logger.audit('agent_availability_updated', {
        updatedBy,
        agentId,
        changes: availabilityData,
      });

      return {
        success: true,
        agent: updatedAgent,
        message: 'Availability preferences updated successfully',
      };
    } catch (error) {
      logger.error('Failed to set agent availability:', error);
      throw error;
    }
  }

  /**
   * Check agent availability for specific time period
   */
  async checkAgentAvailability(agentId, startTime, endTime, options = {}) {
    try {
      const {
        includePreferences = true,
        includeConflicts = true,
        includeTimeOff = true,
        includeWorkloadLimits = true,
      } = options;

      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId, deletedAt: null },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: true,
              preferences: true,
            },
          },
          shifts: {
            where: {
              startTime: { lt: endTime },
              endTime: { gt: startTime },
              status: { notIn: ['CANCELLED'] },
              deletedAt: null,
            },
          },
        },
      });

      if (!agent) {
        throw new Error('Agent not found');
      }

      const availability = {
        agentId,
        period: { startTime, endTime },
        isAvailable: true,
        conflicts: [],
        restrictions: [],
        score: 1.0, // Availability score (0-1)
      };

      // Check for scheduling conflicts
      if (includeConflicts && agent.shifts.length > 0) {
        availability.conflicts.push({
          type: 'scheduling_conflict',
          severity: 'high',
          message: `Agent has ${agent.shifts.length} conflicting shifts`,
          shifts: agent.shifts.map(s => ({
            id: s.id,
            startTime: s.startTime,
            endTime: s.endTime,
          })),
        });
        availability.isAvailable = false;
        availability.score = 0;
      }

      // Check preferences
      if (includePreferences && agent.user.preferences?.availability) {
        const prefCheck = this.checkPreferenceCompatibility(
          agent.user.preferences.availability,
          startTime,
          endTime
        );
        
        if (!prefCheck.compatible) {
          availability.restrictions.push(...prefCheck.restrictions);
          availability.score *= prefCheck.score;
        }
      }

      // Check time off requests
      if (includeTimeOff) {
        const timeOffCheck = await this.checkTimeOffConflicts(agentId, startTime, endTime);
        if (timeOffCheck.hasConflicts) {
          availability.conflicts.push(...timeOffCheck.conflicts);
          availability.isAvailable = false;
          availability.score = 0;
        }
      }

      // Check workload limits
      if (includeWorkloadLimits) {
        const workloadCheck = await this.checkWorkloadLimits(agentId, startTime, endTime);
        if (workloadCheck.exceedsLimits) {
          availability.restrictions.push(...workloadCheck.restrictions);
          availability.score *= workloadCheck.score;
        }
      }

      return availability;
    } catch (error) {
      logger.error('Failed to check agent availability:', error);
      throw error;
    }
  }

  /**
   * Find available agents for a time period
   */
  async findAvailableAgents(criteria = {}) {
    try {
      const {
        startTime,
        endTime,
        siteId,
        requiredSkills = [],
        maxDistance = null,
        minAvailabilityScore = 0.7,
        includePartiallyAvailable = false,
        sortBy = 'score', // score, distance, experience
      } = criteria;

      // Get all active agents
      let agents = await this.prisma.agent.findMany({
        where: {
          employmentStatus: 'ACTIVE',
          deletedAt: null,
          ...(requiredSkills.length > 0 && {
            skills: { hasSome: requiredSkills },
          }),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: true,
              preferences: true,
            },
          },
          shifts: {
            where: {
              startTime: { lt: endTime },
              endTime: { gt: startTime },
              status: { notIn: ['CANCELLED'] },
              deletedAt: null,
            },
          },
        },
      });

      // Check availability for each agent
      const availabilityChecks = await Promise.all(
        agents.map(async (agent) => {
          const availability = await this.checkAgentAvailability(
            agent.id,
            startTime,
            endTime,
            { includePreferences: true, includeConflicts: true, includeTimeOff: true }
          );

          return {
            agent,
            availability,
            distance: siteId ? await this.calculateDistanceToSite(agent.id, siteId) : 0,
          };
        })
      );

      // Filter based on criteria
      let availableAgents = availabilityChecks.filter(check => {
        if (!includePartiallyAvailable && !check.availability.isAvailable) {
          return false;
        }
        
        if (check.availability.score < minAvailabilityScore) {
          return false;
        }

        if (maxDistance && check.distance > maxDistance) {
          return false;
        }

        return true;
      });

      // Sort agents
      availableAgents.sort((a, b) => {
        switch (sortBy) {
          case 'distance':
            return a.distance - b.distance;
          case 'experience':
            const aExp = a.agent.performanceMetrics?.shiftsCompleted || 0;
            const bExp = b.agent.performanceMetrics?.shiftsCompleted || 0;
            return bExp - aExp;
          case 'score':
          default:
            return b.availability.score - a.availability.score;
        }
      });

      return {
        totalAgents: agents.length,
        availableAgents: availableAgents.length,
        agents: availableAgents.map(check => ({
          agent: {
            id: check.agent.id,
            user: check.agent.user,
            skills: check.agent.skills,
            performanceMetrics: check.agent.performanceMetrics,
          },
          availability: check.availability,
          distance: check.distance,
        })),
        criteria,
        searchedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to find available agents:', error);
      throw error;
    }
  }

  /**
   * Process time off requests
   */
  async processTimeOffRequests(agentId, requests, requestedBy) {
    try {
      const processedRequests = [];

      for (const request of requests) {
        const {
          startDate,
          endDate,
          type = 'VACATION', // VACATION, SICK, PERSONAL, EMERGENCY
          reason,
          isRecurring = false,
          recurrencePattern = null,
        } = request;

        // Create time off request record
        const timeOffRequest = await this.prisma.timeOffRequest.create({
          data: {
            agentId,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            type,
            reason,
            status: 'PENDING',
            isRecurring,
            recurrencePattern,
            requestedBy,
          },
        });

        // Check for conflicts with existing shifts
        const conflicts = await this.prisma.shift.findMany({
          where: {
            agentId,
            startTime: { lt: new Date(endDate) },
            endTime: { gt: new Date(startDate) },
            status: { notIn: ['CANCELLED'] },
            deletedAt: null,
          },
        });

        if (conflicts.length > 0) {
          // Create notifications for conflicts
          await this.createTimeOffConflictNotifications(timeOffRequest, conflicts);
        }

        processedRequests.push({
          id: timeOffRequest.id,
          ...request,
          status: 'PENDING',
          conflicts: conflicts.length,
        });
      }

      return {
        success: true,
        requests: processedRequests,
        message: 'Time off requests processed successfully',
      };
    } catch (error) {
      logger.error('Failed to process time off requests:', error);
      throw error;
    }
  }

  /**
   * Generate availability report for agents
   */
  async generateAvailabilityReport(startDate, endDate, filters = {}) {
    try {
      const { siteId, agentIds = [], includeMetrics = true } = filters;

      const where = {
        employmentStatus: 'ACTIVE',
        deletedAt: null,
        ...(agentIds.length > 0 && { id: { in: agentIds } }),
      };

      const agents = await this.prisma.agent.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: true,
              preferences: true,
            },
          },
          shifts: {
            where: {
              startTime: { gte: startDate },
              endTime: { lte: endDate },
              deletedAt: null,
            },
          },
        },
      });

      const report = {
        period: { startDate, endDate },
        totalAgents: agents.length,
        agentAvailability: [],
        summary: {
          totalAvailableHours: 0,
          totalScheduledHours: 0,
          averageUtilization: 0,
          topAvailableAgents: [],
          leastAvailableAgents: [],
        },
      };

      // Calculate availability for each agent
      for (const agent of agents) {
        const availability = await this.calculateAgentAvailabilityMetrics(
          agent,
          startDate,
          endDate
        );

        report.agentAvailability.push(availability);
        report.summary.totalAvailableHours += availability.availableHours;
        report.summary.totalScheduledHours += availability.scheduledHours;
      }

      // Calculate summary metrics
      if (includeMetrics) {
        report.summary.averageUtilization = report.summary.totalAvailableHours > 0 ?
          (report.summary.totalScheduledHours / report.summary.totalAvailableHours * 100).toFixed(1) : 0;

        // Sort agents by availability
        const sortedByAvailability = [...report.agentAvailability]
          .sort((a, b) => b.availabilityScore - a.availabilityScore);

        report.summary.topAvailableAgents = sortedByAvailability.slice(0, 5);
        report.summary.leastAvailableAgents = sortedByAvailability.slice(-5).reverse();
      }

      return report;
    } catch (error) {
      logger.error('Failed to generate availability report:', error);
      throw error;
    }
  }

  // Helper methods

  checkPreferenceCompatibility(preferences, startTime, endTime) {
    const result = {
      compatible: true,
      score: 1.0,
      restrictions: [],
    };

    const start = new Date(startTime);
    const end = new Date(endTime);
    const dayOfWeek = start.getDay();
    const startHour = start.getHours();
    const endHour = end.getHours();

    // Check weekly schedule preferences
    if (preferences.weeklySchedule) {
      const dayPrefs = preferences.weeklySchedule[dayOfWeek];
      if (dayPrefs && !dayPrefs.available) {
        result.restrictions.push({
          type: 'day_preference',
          message: `Agent prefers not to work on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]}`,
        });
        result.score *= 0.5;
      }

      if (dayPrefs && dayPrefs.preferredHours) {
        const prefStart = dayPrefs.preferredHours.start;
        const prefEnd = dayPrefs.preferredHours.end;
        
        if (startHour < prefStart || endHour > prefEnd) {
          result.restrictions.push({
            type: 'time_preference',
            message: `Shift time conflicts with preferred hours (${prefStart}:00 - ${prefEnd}:00)`,
          });
          result.score *= 0.7;
        }
      }
    }

    // Check maximum hours per week
    if (preferences.maxHoursPerWeek) {
      // This would require checking current week's scheduled hours
      // Implementation would go here
    }

    return result;
  }

  async checkTimeOffConflicts(agentId, startTime, endTime) {
    const timeOffRequests = await this.prisma.timeOffRequest.findMany({
      where: {
        agentId,
        status: { in: ['APPROVED', 'PENDING'] },
        startDate: { lt: endTime },
        endDate: { gt: startTime },
      },
    });

    return {
      hasConflicts: timeOffRequests.length > 0,
      conflicts: timeOffRequests.map(request => ({
        type: 'time_off_conflict',
        severity: 'high',
        message: `Agent has ${request.type.toLowerCase()} time off request`,
        request: {
          id: request.id,
          type: request.type,
          startDate: request.startDate,
          endDate: request.endDate,
          status: request.status,
        },
      })),
    };
  }

  async checkWorkloadLimits(agentId, startTime, endTime) {
    // Get agent's current workload for the week
    const weekStart = new Date(startTime);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weeklyShifts = await this.prisma.shift.findMany({
      where: {
        agentId,
        startTime: { gte: weekStart },
        endTime: { lt: weekEnd },
        status: { notIn: ['CANCELLED'] },
        deletedAt: null,
      },
    });

    const currentWeeklyHours = weeklyShifts.reduce((total, shift) => {
      return total + (shift.endTime - shift.startTime) / (1000 * 60 * 60);
    }, 0);

    const shiftHours = (endTime - startTime) / (1000 * 60 * 60);
    const totalHours = currentWeeklyHours + shiftHours;

    const result = {
      exceedsLimits: false,
      score: 1.0,
      restrictions: [],
    };

    // Check against 40-hour work week (could be configurable)
    if (totalHours > 40) {
      result.exceedsLimits = true;
      result.score = 0.3;
      result.restrictions.push({
        type: 'overtime_limit',
        message: `Would exceed weekly hour limit (${totalHours.toFixed(1)} hours)`,
        currentHours: currentWeeklyHours,
        proposedHours: shiftHours,
        totalHours,
      });
    } else if (totalHours > 35) {
      result.score = 0.7;
      result.restrictions.push({
        type: 'approaching_limit',
        message: `Approaching weekly hour limit (${totalHours.toFixed(1)} hours)`,
      });
    }

    return result;
  }

  async calculateDistanceToSite(agentId, siteId) {
    // This would calculate distance between agent location and site
    // For now, return a placeholder value
    return Math.random() * 50; // Random distance up to 50km
  }

  async calculateAgentAvailabilityMetrics(agent, startDate, endDate) {
    const totalHours = (endDate - startDate) / (1000 * 60 * 60);
    const scheduledHours = agent.shifts.reduce((total, shift) => {
      return total + (shift.endTime - shift.startTime) / (1000 * 60 * 60);
    }, 0);

    const availableHours = Math.max(0, totalHours - scheduledHours);
    const utilizationRate = totalHours > 0 ? (scheduledHours / totalHours * 100).toFixed(1) : 0;
    const availabilityScore = totalHours > 0 ? (availableHours / totalHours).toFixed(2) : 0;

    return {
      agentId: agent.id,
      agentName: `${agent.user.profile?.firstName || ''} ${agent.user.profile?.lastName || ''}`.trim(),
      totalHours: Math.round(totalHours),
      scheduledHours: Math.round(scheduledHours),
      availableHours: Math.round(availableHours),
      utilizationRate: parseFloat(utilizationRate),
      availabilityScore: parseFloat(availabilityScore),
      shiftsCount: agent.shifts.length,
    };
  }

  async createTimeOffConflictNotifications(timeOffRequest, conflicts) {
    // Create notifications for time off conflicts
    // Implementation would go here
  }

  emitAvailabilityUpdate(agentId, action) {
    if (this.io) {
      this.io.to('role:supervisor').to('role:admin').emit('availability_update', {
        agentId,
        action,
        timestamp: new Date(),
      });

      this.io.to(`user:${agentId}`).emit('my_availability_update', {
        action,
        timestamp: new Date(),
      });
    }
  }
}

module.exports = AvailabilityManagementService;
