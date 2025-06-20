const logger = require('../config/logger');

/**
 * Advanced scheduling and shift management service
 */
class SchedulingService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Generate optimal shift schedule for a site
   */
  async generateOptimalSchedule(siteId, startDate, endDate, requirements = {}) {
    try {
      const {
        shiftDuration = 8, // hours
        shiftType = 'REGULAR',
        requiredSkills = [],
        minAgentsPerShift = 1,
        maxAgentsPerShift = 3,
        preferredAgents = [],
        avoidOvertime = true,
        considerAvailability = true,
      } = requirements;

      // Get site information
      const site = await this.prisma.site.findUnique({
        where: { id: siteId },
        include: {
          client: {
            select: {
              id: true,
              companyName: true,
              serviceLevel: true,
            },
          },
        },
      });

      if (!site) {
        throw new Error('Site not found');
      }

      // Get available agents with required skills
      const availableAgents = await this.getAvailableAgents(
        startDate,
        endDate,
        requiredSkills,
        preferredAgents
      );

      // Generate time slots
      const timeSlots = this.generateTimeSlots(startDate, endDate, shiftDuration);

      // Create optimal schedule using constraint satisfaction
      const schedule = await this.optimizeSchedule(
        timeSlots,
        availableAgents,
        {
          siteId,
          minAgentsPerShift,
          maxAgentsPerShift,
          shiftType,
          avoidOvertime,
          considerAvailability,
        }
      );

      // Calculate schedule metrics
      const metrics = this.calculateScheduleMetrics(schedule, availableAgents);

      return {
        siteId,
        site: {
          id: site.id,
          name: site.name,
          client: site.client,
        },
        period: {
          startDate,
          endDate,
        },
        schedule,
        metrics,
        requirements,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to generate optimal schedule:', error);
      throw error;
    }
  }

  /**
   * Auto-assign agents to unassigned shifts
   */
  async autoAssignShifts(criteria = {}) {
    try {
      const {
        siteId,
        startDate = new Date(),
        endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        prioritizeExperience = true,
        balanceWorkload = true,
        respectPreferences = true,
      } = criteria;

      // Get unassigned shifts
      const unassignedShifts = await this.prisma.shift.findMany({
        where: {
          agentId: null,
          status: 'SCHEDULED',
          startTime: { gte: startDate, lte: endDate },
          ...(siteId && { siteId }),
          deletedAt: null,
        },
        include: {
          site: {
            select: {
              id: true,
              name: true,
              coordinates: true,
            },
          },
        },
        orderBy: { startTime: 'asc' },
      });

      if (unassignedShifts.length === 0) {
        return {
          message: 'No unassigned shifts found',
          assignments: [],
        };
      }

      // Get agent availability and workload
      const agentData = await this.getAgentWorkloadData(startDate, endDate);

      const assignments = [];

      for (const shift of unassignedShifts) {
        const assignment = await this.findBestAgentForShift(
          shift,
          agentData,
          {
            prioritizeExperience,
            balanceWorkload,
            respectPreferences,
          }
        );

        if (assignment) {
          // Update shift with assigned agent
          await this.prisma.shift.update({
            where: { id: shift.id },
            data: {
              agentId: assignment.agentId,
              status: 'CONFIRMED',
            },
          });

          // Update agent workload data
          agentData[assignment.agentId].currentHours += this.calculateShiftHours(shift);
          agentData[assignment.agentId].shiftCount += 1;

          assignments.push({
            shiftId: shift.id,
            agentId: assignment.agentId,
            agent: assignment.agent,
            score: assignment.score,
            reasons: assignment.reasons,
            shift: {
              startTime: shift.startTime,
              endTime: shift.endTime,
              site: shift.site,
            },
          });

          logger.info('Auto-assigned shift', {
            shiftId: shift.id,
            agentId: assignment.agentId,
            score: assignment.score,
          });
        }
      }

      return {
        totalShifts: unassignedShifts.length,
        assignedShifts: assignments.length,
        assignments,
        criteria,
      };
    } catch (error) {
      logger.error('Failed to auto-assign shifts:', error);
      throw error;
    }
  }

  /**
   * Detect and resolve scheduling conflicts
   */
  async detectSchedulingConflicts(startDate, endDate) {
    try {
      const conflicts = [];

      // 1. Double-booked agents
      const doubleBookings = await this.prisma.$queryRaw`
        SELECT 
          s1.agent_id,
          s1.id as shift1_id,
          s2.id as shift2_id,
          s1.start_time as shift1_start,
          s1.end_time as shift1_end,
          s2.start_time as shift2_start,
          s2.end_time as shift2_end
        FROM shifts s1
        JOIN shifts s2 ON s1.agent_id = s2.agent_id AND s1.id != s2.id
        WHERE s1.agent_id IS NOT NULL
          AND s1.deleted_at IS NULL
          AND s2.deleted_at IS NULL
          AND s1.start_time >= ${startDate}
          AND s1.end_time <= ${endDate}
          AND (
            (s1.start_time < s2.end_time AND s1.end_time > s2.start_time)
          )
        ORDER BY s1.agent_id, s1.start_time
      `;

      for (const booking of doubleBookings) {
        conflicts.push({
          type: 'double_booking',
          severity: 'high',
          agentId: booking.agent_id,
          shifts: [booking.shift1_id, booking.shift2_id],
          description: 'Agent is assigned to overlapping shifts',
          suggestedResolution: 'reassign_one_shift',
        });
      }

      // 2. Overtime violations
      const overtimeViolations = await this.detectOvertimeViolations(startDate, endDate);
      conflicts.push(...overtimeViolations);

      // 3. Skill mismatches
      const skillMismatches = await this.detectSkillMismatches(startDate, endDate);
      conflicts.push(...skillMismatches);

      // 4. Understaffed shifts
      const understaffedShifts = await this.detectUnderstaffedShifts(startDate, endDate);
      conflicts.push(...understaffedShifts);

      return {
        totalConflicts: conflicts.length,
        conflicts,
        period: { startDate, endDate },
        detectedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to detect scheduling conflicts:', error);
      throw error;
    }
  }

  /**
   * Generate workforce analytics and insights
   */
  async generateWorkforceAnalytics(startDate, endDate) {
    try {
      // Get all shifts in the period
      const shifts = await this.prisma.shift.findMany({
        where: {
          startTime: { gte: startDate },
          endTime: { lte: endDate },
          deletedAt: null,
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
          attendance: true,
        },
      });

      // Calculate utilization metrics
      const utilization = this.calculateUtilizationMetrics(shifts);

      // Calculate cost metrics
      const costMetrics = this.calculateCostMetrics(shifts);

      // Calculate performance metrics
      const performance = this.calculatePerformanceMetrics(shifts);

      // Generate insights and recommendations
      const insights = this.generateInsights(shifts, utilization, performance);

      return {
        period: { startDate, endDate },
        summary: {
          totalShifts: shifts.length,
          assignedShifts: shifts.filter(s => s.agentId).length,
          completedShifts: shifts.filter(s => s.status === 'COMPLETED').length,
          totalHours: shifts.reduce((sum, s) => sum + this.calculateShiftHours(s), 0),
        },
        utilization,
        costMetrics,
        performance,
        insights,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to generate workforce analytics:', error);
      throw error;
    }
  }

  // Helper methods

  async getAvailableAgents(startDate, endDate, requiredSkills = [], preferredAgents = []) {
    const where = {
      employmentStatus: 'ACTIVE',
      deletedAt: null,
      user: {
        status: 'ACTIVE',
        deletedAt: null,
      },
    };

    if (requiredSkills.length > 0) {
      where.skills = { hasSome: requiredSkills };
    }

    if (preferredAgents.length > 0) {
      where.id = { in: preferredAgents };
    }

    return await this.prisma.agent.findMany({
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
  }

  generateTimeSlots(startDate, endDate, shiftDuration) {
    const slots = [];
    const current = new Date(startDate);
    
    while (current < endDate) {
      const slotEnd = new Date(current.getTime() + shiftDuration * 60 * 60 * 1000);
      
      slots.push({
        startTime: new Date(current),
        endTime: slotEnd,
        duration: shiftDuration,
      });
      
      current.setTime(current.getTime() + shiftDuration * 60 * 60 * 1000);
    }
    
    return slots;
  }

  async optimizeSchedule(timeSlots, agents, constraints) {
    const schedule = [];
    
    for (const slot of timeSlots) {
      const availableAgents = agents.filter(agent => 
        this.isAgentAvailable(agent, slot.startTime, slot.endTime)
      );
      
      // Score agents for this time slot
      const scoredAgents = availableAgents.map(agent => ({
        agent,
        score: this.calculateAgentScore(agent, slot, constraints),
      })).sort((a, b) => b.score - a.score);
      
      // Assign best agents up to max limit
      const assignedAgents = scoredAgents
        .slice(0, constraints.maxAgentsPerShift)
        .filter(sa => sa.score > 0.5); // Minimum score threshold
      
      if (assignedAgents.length >= constraints.minAgentsPerShift) {
        schedule.push({
          ...slot,
          agents: assignedAgents.map(sa => sa.agent),
          coverage: assignedAgents.length,
        });
      }
    }
    
    return schedule;
  }

  calculateAgentScore(agent, timeSlot, constraints) {
    let score = 1.0;
    
    // Factor in experience
    const experience = agent.performanceMetrics?.shiftsCompleted || 0;
    score += Math.min(experience / 100, 0.5); // Max 0.5 bonus for experience
    
    // Factor in current workload
    const currentHours = this.calculateAgentCurrentHours(agent, timeSlot);
    if (constraints.avoidOvertime && currentHours > 40) {
      score -= 0.3; // Penalty for overtime
    }
    
    // Factor in preferences (if available)
    const preferences = agent.user.preferences?.workSchedule;
    if (preferences) {
      const dayOfWeek = timeSlot.startTime.getDay();
      const hour = timeSlot.startTime.getHours();
      
      if (preferences.preferredDays?.includes(dayOfWeek)) {
        score += 0.2;
      }
      
      if (preferences.preferredHours?.start <= hour && hour < preferences.preferredHours?.end) {
        score += 0.2;
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }

  calculateShiftHours(shift) {
    return (shift.endTime - shift.startTime) / (1000 * 60 * 60);
  }

  isAgentAvailable(agent, startTime, endTime) {
    return !agent.shifts.some(shift => 
      (startTime < shift.endTime && endTime > shift.startTime)
    );
  }

  calculateAgentCurrentHours(agent, timeSlot) {
    const weekStart = new Date(timeSlot.startTime);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    return agent.shifts
      .filter(shift => shift.startTime >= weekStart && shift.startTime < timeSlot.startTime)
      .reduce((total, shift) => total + this.calculateShiftHours(shift), 0);
  }

  calculateScheduleMetrics(schedule, agents) {
    const totalSlots = schedule.length;
    const coveredSlots = schedule.filter(slot => slot.agents.length > 0).length;
    const averageCoverage = schedule.reduce((sum, slot) => sum + slot.coverage, 0) / totalSlots;
    
    return {
      totalTimeSlots: totalSlots,
      coveredSlots,
      coverageRate: (coveredSlots / totalSlots * 100).toFixed(1),
      averageCoverage: averageCoverage.toFixed(1),
      totalAgentsUsed: new Set(schedule.flatMap(slot => slot.agents.map(a => a.id))).size,
      availableAgents: agents.length,
    };
  }

  async getAgentWorkloadData(startDate, endDate) {
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

    const workloadData = {};
    
    agents.forEach(agent => {
      const currentHours = agent.shifts.reduce((total, shift) => 
        total + this.calculateShiftHours(shift), 0
      );
      
      workloadData[agent.id] = {
        agent,
        currentHours,
        shiftCount: agent.shifts.length,
        availability: this.calculateAvailability(agent, startDate, endDate),
      };
    });

    return workloadData;
  }

  calculateAvailability(agent, startDate, endDate) {
    const totalHours = (endDate - startDate) / (1000 * 60 * 60);
    const scheduledHours = agent.shifts.reduce((total, shift) => 
      total + this.calculateShiftHours(shift), 0
    );
    
    return Math.max(0, (totalHours - scheduledHours) / totalHours);
  }

  async findBestAgentForShift(shift, agentData, criteria) {
    const candidates = [];
    
    for (const [agentId, data] of Object.entries(agentData)) {
      // Check availability
      if (!this.isAgentAvailable(data.agent, shift.startTime, shift.endTime)) {
        continue;
      }
      
      // Calculate score
      let score = 0.5; // Base score
      
      // Experience factor
      if (criteria.prioritizeExperience) {
        const experience = data.agent.performanceMetrics?.shiftsCompleted || 0;
        score += Math.min(experience / 100, 0.3);
      }
      
      // Workload balance factor
      if (criteria.balanceWorkload) {
        const workloadFactor = Math.max(0, 1 - (data.currentHours / 40));
        score += workloadFactor * 0.2;
      }
      
      candidates.push({
        agentId,
        agent: data.agent,
        score,
        reasons: this.generateAssignmentReasons(data, shift, score),
      });
    }
    
    // Return best candidate
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  generateAssignmentReasons(agentData, shift, score) {
    const reasons = [];
    
    if (agentData.currentHours < 30) {
      reasons.push('Low current workload');
    }
    
    if (agentData.agent.performanceMetrics?.shiftsCompleted > 50) {
      reasons.push('Experienced agent');
    }
    
    if (score > 0.8) {
      reasons.push('High compatibility score');
    }
    
    return reasons;
  }

  async detectOvertimeViolations(startDate, endDate) {
    // Implementation for overtime detection
    return [];
  }

  async detectSkillMismatches(startDate, endDate) {
    // Implementation for skill mismatch detection
    return [];
  }

  async detectUnderstaffedShifts(startDate, endDate) {
    // Implementation for understaffing detection
    return [];
  }

  calculateUtilizationMetrics(shifts) {
    // Implementation for utilization calculations
    return {};
  }

  calculateCostMetrics(shifts) {
    // Implementation for cost calculations
    return {};
  }

  calculatePerformanceMetrics(shifts) {
    // Implementation for performance calculations
    return {};
  }

  generateInsights(shifts, utilization, performance) {
    // Implementation for insights generation
    return [];
  }
}

module.exports = SchedulingService;
