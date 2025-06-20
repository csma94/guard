const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * Intelligent Scheduling Service with AI-powered optimization
 * Implements advanced algorithms for optimal shift assignment
 */
class IntelligentSchedulingService {
  constructor(prisma, notificationService, webSocketService) {
    this.prisma = prisma;
    this.notificationService = notificationService;
    this.webSocketService = webSocketService;
    
    // Scoring weights for agent assignment
    this.scoringWeights = {
      skillMatch: 0.25,
      availability: 0.20,
      proximity: 0.15,
      performance: 0.15,
      workloadBalance: 0.10,
      preference: 0.10,
      cost: 0.05,
    };
  }

  /**
   * Intelligent bulk shift assignment with optimization
   */
  async assignShiftsIntelligently(shiftIds, options = {}) {
    try {
      const {
        optimizationGoal = 'balanced', // balanced, cost, quality, coverage
        allowPartialAssignment = true,
        notifyAgents = true,
        validateConstraints = true,
      } = options;

      logger.info(`Starting intelligent assignment for ${shiftIds.length} shifts`);

      // Load shifts with full context
      const shifts = await this.loadShiftsWithContext(shiftIds);
      
      // Load all available agents with their current workload
      const agents = await this.loadAgentsWithWorkload(shifts);
      
      // Create assignment matrix
      const assignmentMatrix = await this.createAssignmentMatrix(shifts, agents);
      
      // Run optimization algorithm
      const assignments = await this.optimizeAssignments(
        assignmentMatrix,
        optimizationGoal,
        validateConstraints
      );
      
      // Execute assignments
      const results = await this.executeAssignments(assignments, notifyAgents);
      
      // Generate assignment report
      const report = this.generateAssignmentReport(shifts, assignments, results);
      
      logger.info(`Intelligent assignment completed: ${results.successful}/${shiftIds.length} shifts assigned`);
      
      return {
        success: true,
        assignments: results.assignments,
        failed: results.failed,
        report,
        optimizationGoal,
      };
    } catch (error) {
      logger.error('Intelligent shift assignment failed:', error);
      throw error;
    }
  }

  /**
   * Load shifts with full context for optimization
   */
  async loadShiftsWithContext(shiftIds) {
    const shifts = await this.prisma.shift.findMany({
      where: {
        id: { in: shiftIds },
        deletedAt: null,
      },
      include: {
        site: {
          include: {
            client: {
              select: {
                id: true,
                companyName: true,
                serviceLevel: true,
                preferences: true,
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
                profile: true,
              },
            },
          },
        },
      },
    });

    // Enrich with additional context
    return Promise.all(shifts.map(async (shift) => {
      const context = {
        ...shift,
        requiredSkills: shift.requirements?.skills || [],
        priority: this.calculateShiftPriority(shift),
        complexity: this.calculateShiftComplexity(shift),
        urgency: this.calculateShiftUrgency(shift),
      };

      // Add historical data
      context.historicalData = await this.getShiftHistoricalData(shift.siteId, shift.shiftType);
      
      return context;
    }));
  }

  /**
   * Load agents with current workload and performance metrics
   */
  async loadAgentsWithWorkload(shifts) {
    const timeRange = this.getTimeRangeFromShifts(shifts);
    
    const agents = await this.prisma.agent.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        deletedAt: null,
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
            startTime: { gte: timeRange.start },
            endTime: { lte: timeRange.end },
            status: { notIn: ['CANCELLED'] },
            deletedAt: null,
          },
        },
        // performanceMetrics and certifications are JSON fields, not relations
        // availability will be calculated from shifts and time-off requests
      },
    });

    // Calculate workload and performance metrics
    return agents.map(agent => {
      const workload = this.calculateAgentWorkload(agent, timeRange);
      const performance = this.calculateAgentPerformance(agent);
      const availability = this.calculateAgentAvailability(agent, timeRange);
      
      return {
        ...agent,
        workload,
        performance,
        availability,
        skills: agent.skills || [],
        hourlyRate: agent.hourlyRate || 0,
      };
    });
  }

  /**
   * Create assignment matrix with scores for each shift-agent combination
   */
  async createAssignmentMatrix(shifts, agents) {
    const matrix = [];
    
    for (const shift of shifts) {
      const shiftAssignments = [];
      
      for (const agent of agents) {
        const score = await this.calculateAssignmentScore(shift, agent);
        const constraints = await this.checkAssignmentConstraints(shift, agent);
        
        shiftAssignments.push({
          shiftId: shift.id,
          agentId: agent.id,
          score,
          constraints,
          feasible: constraints.every(c => !c.blocking),
          cost: this.calculateAssignmentCost(shift, agent),
        });
      }
      
      // Sort by score descending
      shiftAssignments.sort((a, b) => b.score - a.score);
      matrix.push({
        shift,
        assignments: shiftAssignments,
      });
    }
    
    return matrix;
  }

  /**
   * Calculate comprehensive assignment score
   */
  async calculateAssignmentScore(shift, agent) {
    let totalScore = 0;
    
    // Skill matching score
    const skillScore = this.calculateSkillMatchScore(shift.requiredSkills, agent.skills);
    totalScore += skillScore * this.scoringWeights.skillMatch;
    
    // Availability score
    const availabilityScore = this.calculateAvailabilityScore(shift, agent);
    totalScore += availabilityScore * this.scoringWeights.availability;
    
    // Proximity score
    const proximityScore = await this.calculateProximityScore(shift, agent);
    totalScore += proximityScore * this.scoringWeights.proximity;
    
    // Performance score
    const performanceScore = this.calculatePerformanceScore(agent);
    totalScore += performanceScore * this.scoringWeights.performance;
    
    // Workload balance score
    const workloadScore = this.calculateWorkloadBalanceScore(agent);
    totalScore += workloadScore * this.scoringWeights.workloadBalance;
    
    // Preference score
    const preferenceScore = this.calculatePreferenceScore(shift, agent);
    totalScore += preferenceScore * this.scoringWeights.preference;
    
    // Cost efficiency score
    const costScore = this.calculateCostEfficiencyScore(shift, agent);
    totalScore += costScore * this.scoringWeights.cost;
    
    return Math.min(Math.max(totalScore, 0), 1); // Normalize to 0-1
  }

  /**
   * Optimize assignments using constraint satisfaction and genetic algorithm
   */
  async optimizeAssignments(matrix, goal, validateConstraints) {
    // Initial greedy assignment
    let assignments = this.greedyAssignment(matrix);
    
    // Apply optimization based on goal
    switch (goal) {
      case 'cost':
        assignments = this.optimizeForCost(matrix, assignments);
        break;
      case 'quality':
        assignments = this.optimizeForQuality(matrix, assignments);
        break;
      case 'coverage':
        assignments = this.optimizeForCoverage(matrix, assignments);
        break;
      default:
        assignments = this.optimizeForBalance(matrix, assignments);
    }
    
    // Validate constraints if required
    if (validateConstraints) {
      assignments = await this.validateAndFixConstraints(assignments, matrix);
    }
    
    return assignments;
  }

  /**
   * Greedy assignment algorithm
   */
  greedyAssignment(matrix) {
    const assignments = [];
    const assignedAgents = new Set();
    
    // Sort shifts by priority and urgency
    const sortedMatrix = matrix.sort((a, b) => {
      const priorityDiff = b.shift.priority - a.shift.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return b.shift.urgency - a.shift.urgency;
    });
    
    for (const shiftData of sortedMatrix) {
      const availableAssignments = shiftData.assignments.filter(
        a => a.feasible && !assignedAgents.has(a.agentId)
      );
      
      if (availableAssignments.length > 0) {
        const bestAssignment = availableAssignments[0];
        assignments.push(bestAssignment);
        assignedAgents.add(bestAssignment.agentId);
      }
    }
    
    return assignments;
  }

  /**
   * Execute the assignments in the database
   */
  async executeAssignments(assignments, notifyAgents) {
    const results = {
      successful: 0,
      failed: 0,
      assignments: [],
      errors: [],
    };
    
    for (const assignment of assignments) {
      try {
        // Update shift with agent assignment
        const updatedShift = await this.prisma.shift.update({
          where: { id: assignment.shiftId },
          data: {
            agentId: assignment.agentId,
            status: 'CONFIRMED',
            assignedAt: new Date(),
            assignmentScore: assignment.score,
            assignmentMethod: 'INTELLIGENT_AUTO',
          },
          include: {
            agent: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profile: true,
                  },
                },
              },
            },
            site: {
              select: {
                id: true,
                name: true,
                client: {
                  select: {
                    id: true,
                    companyName: true,
                  },
                },
              },
            },
          },
        });
        
        // Create assignment record for tracking
        await this.prisma.shiftAssignment.create({
          data: {
            id: uuidv4(),
            shiftId: assignment.shiftId,
            agentId: assignment.agentId,
            assignmentScore: assignment.score,
            assignmentMethod: 'INTELLIGENT_AUTO',
            assignmentReason: this.generateAssignmentReason(assignment),
            constraints: assignment.constraints,
          },
        });
        
        // Send notification to agent if requested
        if (notifyAgents) {
          await this.notifyAgentOfAssignment(updatedShift);
        }
        
        // Emit real-time update
        this.webSocketService.emitToUser(assignment.agentId, 'shift_assigned', {
          shift: updatedShift,
          assignmentScore: assignment.score,
        });
        
        results.assignments.push({
          shiftId: assignment.shiftId,
          agentId: assignment.agentId,
          score: assignment.score,
          shift: updatedShift,
        });
        
        results.successful++;
        
      } catch (error) {
        logger.error(`Failed to assign shift ${assignment.shiftId}:`, error);
        results.errors.push({
          shiftId: assignment.shiftId,
          agentId: assignment.agentId,
          error: error.message,
        });
        results.failed++;
      }
    }
    
    return results;
  }

  /**
   * Calculate skill match score
   */
  calculateSkillMatchScore(requiredSkills, agentSkills) {
    if (requiredSkills.length === 0) return 1.0;
    
    const matchedSkills = requiredSkills.filter(skill => 
      agentSkills.includes(skill)
    );
    
    return matchedSkills.length / requiredSkills.length;
  }

  /**
   * Calculate availability score
   */
  calculateAvailabilityScore(shift, agent) {
    // Check for conflicts
    const hasConflicts = agent.shifts.some(existingShift => 
      existingShift.startTime < shift.endTime && 
      existingShift.endTime > shift.startTime
    );
    
    if (hasConflicts) return 0;
    
    // Check availability preferences
    const shiftDay = new Date(shift.startTime).getDay();
    const shiftHour = new Date(shift.startTime).getHours();
    
    const preferences = agent.user.preferences || {};
    const availableDays = preferences.availableDays || [0, 1, 2, 3, 4, 5, 6];
    const preferredHours = preferences.preferredHours || { start: 0, end: 23 };
    
    let score = 1.0;
    
    if (!availableDays.includes(shiftDay)) {
      score *= 0.5; // Penalty for non-preferred day
    }
    
    if (shiftHour < preferredHours.start || shiftHour > preferredHours.end) {
      score *= 0.7; // Penalty for non-preferred hours
    }
    
    return score;
  }

  /**
   * Calculate proximity score based on distance to site
   */
  async calculateProximityScore(shift, agent) {
    try {
      // Get agent's home location or last known location
      const agentLocation = agent.user.profile?.address || agent.lastKnownLocation;
      const siteLocation = shift.site.coordinates;
      
      if (!agentLocation || !siteLocation) return 0.5; // Neutral score if no location data
      
      const distance = this.calculateDistance(agentLocation, siteLocation);
      
      // Score decreases with distance (max 50km for full score)
      return Math.max(0, 1 - (distance / 50));
    } catch (error) {
      logger.warn('Failed to calculate proximity score:', error);
      return 0.5;
    }
  }

  /**
   * Calculate performance score based on historical data
   */
  calculatePerformanceScore(agent) {
    const metrics = agent.performanceMetrics;
    if (!metrics) return 0.5;
    
    const factors = [
      metrics.attendanceRate || 0.5,
      metrics.punctualityRate || 0.5,
      metrics.qualityScore || 0.5,
      metrics.clientSatisfaction || 0.5,
    ];
    
    return factors.reduce((sum, factor) => sum + factor, 0) / factors.length;
  }

  /**
   * Calculate workload balance score
   */
  calculateWorkloadBalanceScore(agent) {
    const currentHours = agent.workload?.weeklyHours || 0;
    const maxHours = agent.maxWeeklyHours || 40;
    
    // Optimal range is 70-90% of max hours
    const utilization = currentHours / maxHours;
    
    if (utilization < 0.7) return 1.0; // Underutilized, good for assignment
    if (utilization < 0.9) return 0.8; // Good utilization
    if (utilization < 1.0) return 0.5; // High utilization
    return 0.1; // Overutilized
  }

  /**
   * Generate assignment reason for tracking
   */
  generateAssignmentReason(assignment) {
    const reasons = [];
    
    if (assignment.score > 0.9) reasons.push('Excellent match');
    if (assignment.score > 0.8) reasons.push('High skill compatibility');
    if (assignment.score > 0.7) reasons.push('Good availability');
    
    return reasons.join(', ') || 'Automated assignment';
  }

  /**
   * Notify agent of new assignment
   */
  async notifyAgentOfAssignment(shift) {
    try {
      await this.notificationService.sendNotification({
        recipientId: shift.agentId,
        type: 'SHIFT_ASSIGNMENT',
        title: 'New Shift Assignment',
        message: `You have been assigned to a shift at ${shift.site.name}`,
        data: {
          shiftId: shift.id,
          siteName: shift.site.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
        },
        channels: ['PUSH', 'EMAIL'],
        priority: 'HIGH',
      });
    } catch (error) {
      logger.error('Failed to notify agent of assignment:', error);
    }
  }

  /**
   * Calculate distance between two coordinates
   */
  calculateDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(coord2.lat - coord1.lat);
    const dLon = this.toRad(coord2.lng - coord1.lng);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(coord1.lat)) * Math.cos(this.toRad(coord2.lat)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }
}

module.exports = IntelligentSchedulingService;
