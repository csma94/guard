const logger = require('../config/logger');

/**
 * Advanced shift management and workforce optimization service
 */
class ShiftManagementService {
  constructor(prisma, io) {
    this.prisma = prisma;
    this.io = io;
  }

  /**
   * Create shift with intelligent validation and optimization
   */
  async createShift(shiftData, createdBy) {
    try {
      const {
        siteId,
        startTime,
        endTime,
        shiftType = 'REGULAR',
        requirements = {},
        notes,
        agentId = null,
        supervisorId = null,
        priority = 'NORMAL',
        autoAssign = false,
      } = shiftData;

      // Validate shift data
      await this.validateShiftData(shiftData);

      // Check for conflicts
      const conflicts = await this.checkShiftConflicts(siteId, startTime, endTime, agentId);
      if (conflicts.length > 0 && !shiftData.forceCreate) {
        return {
          success: false,
          conflicts,
          message: 'Shift conflicts detected. Use forceCreate to override.',
        };
      }

      // Create the shift
      const shift = await this.prisma.shift.create({
        data: {
          siteId,
          agentId,
          supervisorId,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          shiftType,
          status: agentId ? 'CONFIRMED' : 'SCHEDULED',
          requirements,
          notes,
          priority,
          createdBy,
        },
        include: {
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

      // Auto-assign if requested and no agent specified
      if (autoAssign && !agentId) {
        const assignment = await this.autoAssignSingleShift(shift.id);
        if (assignment.success) {
          shift.agentId = assignment.agentId;
          shift.agent = assignment.agent;
          shift.status = 'CONFIRMED';
        }
      }

      // Create notifications
      await this.createShiftNotifications(shift, 'created');

      // Emit real-time update
      this.emitShiftUpdate(shift, 'created');

      logger.audit('shift_created', {
        createdBy,
        shiftId: shift.id,
        siteId,
        agentId,
        autoAssigned: autoAssign && shift.agentId,
      });

      return {
        success: true,
        shift,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
      };
    } catch (error) {
      logger.error('Failed to create shift:', error);
      throw error;
    }
  }

  /**
   * Update shift with change tracking and notifications
   */
  async updateShift(shiftId, updates, updatedBy) {
    try {
      // Get current shift
      const currentShift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
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
            },
          },
        },
      });

      if (!currentShift) {
        throw new Error('Shift not found');
      }

      // Track changes
      const changes = this.trackShiftChanges(currentShift, updates);

      // Validate updates
      if (updates.startTime || updates.endTime || updates.agentId) {
        const conflicts = await this.checkShiftConflicts(
          updates.siteId || currentShift.siteId,
          updates.startTime || currentShift.startTime,
          updates.endTime || currentShift.endTime,
          updates.agentId || currentShift.agentId,
          shiftId // Exclude current shift from conflict check
        );

        if (conflicts.length > 0 && !updates.forceUpdate) {
          return {
            success: false,
            conflicts,
            message: 'Update would create conflicts. Use forceUpdate to override.',
          };
        }
      }

      // Update shift
      const updatedShift = await this.prisma.shift.update({
        where: { id: shiftId },
        data: {
          ...updates,
          startTime: updates.startTime ? new Date(updates.startTime) : undefined,
          endTime: updates.endTime ? new Date(updates.endTime) : undefined,
        },
        include: {
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

      // Create change notifications
      if (changes.length > 0) {
        await this.createChangeNotifications(updatedShift, changes, updatedBy);
      }

      // Emit real-time update
      this.emitShiftUpdate(updatedShift, 'updated', changes);

      logger.audit('shift_updated', {
        updatedBy,
        shiftId,
        changes,
      });

      return {
        success: true,
        shift: updatedShift,
        changes,
      };
    } catch (error) {
      logger.error('Failed to update shift:', error);
      throw error;
    }
  }

  /**
   * Cancel shift with proper notifications and cleanup
   */
  async cancelShift(shiftId, reason, cancelledBy) {
    try {
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
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
            },
          },
          attendance: true,
        },
      });

      if (!shift) {
        throw new Error('Shift not found');
      }

      // Check if shift can be cancelled
      if (shift.status === 'IN_PROGRESS') {
        throw new Error('Cannot cancel shift that is in progress');
      }

      if (shift.status === 'COMPLETED') {
        throw new Error('Cannot cancel completed shift');
      }

      // Update shift status
      const cancelledShift = await this.prisma.shift.update({
        where: { id: shiftId },
        data: {
          status: 'CANCELLED',
          notes: shift.notes ? `${shift.notes}\n\nCancelled: ${reason}` : `Cancelled: ${reason}`,
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
            },
          },
        },
      });

      // Create cancellation notifications
      await this.createCancellationNotifications(cancelledShift, reason, cancelledBy);

      // Emit real-time update
      this.emitShiftUpdate(cancelledShift, 'cancelled', [{ field: 'status', oldValue: shift.status, newValue: 'CANCELLED', reason }]);

      logger.audit('shift_cancelled', {
        cancelledBy,
        shiftId,
        reason,
        originalStatus: shift.status,
      });

      return {
        success: true,
        shift: cancelledShift,
        reason,
      };
    } catch (error) {
      logger.error('Failed to cancel shift:', error);
      throw error;
    }
  }

  /**
   * Handle shift status transitions with business logic
   */
  async updateShiftStatus(shiftId, newStatus, metadata = {}) {
    try {
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
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
          site: true,
          attendance: true,
        },
      });

      if (!shift) {
        throw new Error('Shift not found');
      }

      // Validate status transition
      const isValidTransition = this.validateStatusTransition(shift.status, newStatus);
      if (!isValidTransition) {
        throw new Error(`Invalid status transition from ${shift.status} to ${newStatus}`);
      }

      // Handle specific status transitions
      let updateData = { status: newStatus };

      switch (newStatus) {
        case 'IN_PROGRESS':
          updateData.actualStartTime = new Date();
          break;
        case 'COMPLETED':
          updateData.actualEndTime = new Date();
          // Calculate actual hours if attendance data exists
          if (shift.attendance.length > 0) {
            const attendance = shift.attendance[0];
            if (attendance.clockInTime && attendance.clockOutTime) {
              updateData.actualHours = (attendance.clockOutTime - attendance.clockInTime) / (1000 * 60 * 60);
            }
          }
          break;
        case 'NO_SHOW':
          // Create incident report for no-show
          await this.createNoShowIncident(shift);
          break;
      }

      // Update shift
      const updatedShift = await this.prisma.shift.update({
        where: { id: shiftId },
        data: updateData,
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
          site: true,
        },
      });

      // Create status change notifications
      await this.createStatusChangeNotifications(updatedShift, shift.status, newStatus, metadata);

      // Emit real-time update
      this.emitShiftUpdate(updatedShift, 'status_changed', [
        { field: 'status', oldValue: shift.status, newValue: newStatus }
      ]);

      logger.audit('shift_status_updated', {
        shiftId,
        oldStatus: shift.status,
        newStatus,
        metadata,
      });

      return {
        success: true,
        shift: updatedShift,
        statusChange: {
          from: shift.status,
          to: newStatus,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      logger.error('Failed to update shift status:', error);
      throw error;
    }
  }

  /**
   * Get shift recommendations for optimization
   */
  async getShiftRecommendations(criteria = {}) {
    try {
      const {
        siteId,
        startDate = new Date(),
        endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        includeOptimization = true,
        includeStaffing = true,
        includeCost = true,
      } = criteria;

      const recommendations = [];

      if (includeOptimization) {
        const optimizationRecs = await this.getOptimizationRecommendations(siteId, startDate, endDate);
        recommendations.push(...optimizationRecs);
      }

      if (includeStaffing) {
        const staffingRecs = await this.getStaffingRecommendations(siteId, startDate, endDate);
        recommendations.push(...staffingRecs);
      }

      if (includeCost) {
        const costRecs = await this.getCostOptimizationRecommendations(siteId, startDate, endDate);
        recommendations.push(...costRecs);
      }

      // Prioritize recommendations
      recommendations.sort((a, b) => b.priority - a.priority);

      return {
        totalRecommendations: recommendations.length,
        recommendations,
        criteria,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to get shift recommendations:', error);
      throw error;
    }
  }

  // Helper methods

  async validateShiftData(shiftData) {
    const { siteId, startTime, endTime, agentId } = shiftData;

    // Validate site exists
    const site = await this.prisma.site.findUnique({
      where: { id: siteId, deletedAt: null },
    });
    if (!site) {
      throw new Error('Site not found');
    }

    // Validate time range
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end) {
      throw new Error('End time must be after start time');
    }

    // Validate agent if specified
    if (agentId) {
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId, deletedAt: null },
      });
      if (!agent) {
        throw new Error('Agent not found');
      }
      if (agent.employmentStatus !== 'ACTIVE') {
        throw new Error('Agent is not active');
      }
    }
  }

  async checkShiftConflicts(siteId, startTime, endTime, agentId, excludeShiftId = null) {
    const conflicts = [];

    if (agentId) {
      // Check agent double-booking
      const agentConflicts = await this.prisma.shift.findMany({
        where: {
          agentId,
          ...(excludeShiftId && { id: { not: excludeShiftId } }),
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
          OR: [
            {
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          ],
        },
        include: {
          site: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      conflicts.push(...agentConflicts.map(shift => ({
        type: 'agent_double_booking',
        severity: 'high',
        message: `Agent is already assigned to another shift`,
        conflictingShift: {
          id: shift.id,
          site: shift.site,
          startTime: shift.startTime,
          endTime: shift.endTime,
        },
      })));
    }

    // Check site capacity (if applicable)
    // This would depend on site-specific capacity rules

    return conflicts;
  }

  trackShiftChanges(currentShift, updates) {
    const changes = [];
    const fieldsToTrack = ['agentId', 'startTime', 'endTime', 'status', 'priority', 'requirements'];

    fieldsToTrack.forEach(field => {
      if (updates[field] !== undefined) {
        const oldValue = currentShift[field];
        const newValue = updates[field];
        
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push({
            field,
            oldValue,
            newValue,
            timestamp: new Date(),
          });
        }
      }
    });

    return changes;
  }

  validateStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      'SCHEDULED': ['CONFIRMED', 'CANCELLED'],
      'CONFIRMED': ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
      'IN_PROGRESS': ['COMPLETED', 'CANCELLED'],
      'COMPLETED': [], // No transitions from completed
      'CANCELLED': [], // No transitions from cancelled
      'NO_SHOW': [], // No transitions from no-show
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  async createShiftNotifications(shift, action) {
    const notifications = [];

    // Notify assigned agent
    if (shift.agentId) {
      notifications.push({
        recipientId: shift.agent.user.id,
        type: 'INFO',
        title: 'New Shift Assignment',
        message: `You have been assigned to a shift at ${shift.site.name}`,
        data: {
          shiftId: shift.id,
          action,
          site: shift.site,
          startTime: shift.startTime,
          endTime: shift.endTime,
        },
        channels: ['PUSH', 'EMAIL'],
      });
    }

    // Notify supervisors
    // Implementation would depend on supervisor assignment logic

    // Create notifications in database
    for (const notification of notifications) {
      await this.prisma.notification.create({
        data: {
          ...notification,
          status: 'PENDING',
        },
      });
    }
  }

  async createChangeNotifications(shift, changes, updatedBy) {
    try {
      const notifications = [];

      // Notify assigned agent if shift details changed
      if (shift.agentId) {
        notifications.push({
          userId: shift.agent.userId,
          type: 'SHIFT_UPDATED',
          title: 'Shift Updated',
          message: `Your shift at ${shift.site?.name} has been updated`,
          priority: 'NORMAL',
          data: {
            shiftId: shift.id,
            changes: changes.map(c => `${c.field}: ${c.oldValue} → ${c.newValue}`),
          },
        });
      }

      // Notify supervisor if assigned
      if (shift.supervisorId && shift.supervisorId !== updatedBy) {
        notifications.push({
          userId: shift.supervisorId,
          type: 'SHIFT_UPDATED',
          title: 'Shift Updated',
          message: `Shift at ${shift.site?.name} has been updated`,
          priority: 'NORMAL',
          data: {
            shiftId: shift.id,
            changes: changes.map(c => `${c.field}: ${c.oldValue} → ${c.newValue}`),
          },
        });
      }

      // Create notifications in batch
      if (notifications.length > 0) {
        await this.prisma.notification.createMany({
          data: notifications,
        });
      }
    } catch (error) {
      logger.error('Failed to create change notifications:', error);
    }
  }

  async createCancellationNotifications(shift, reason, cancelledBy) {
    try {
      const notifications = [];

      // Notify assigned agent
      if (shift.agentId) {
        notifications.push({
          userId: shift.agent.userId,
          type: 'SHIFT_CANCELLED',
          title: 'Shift Cancelled',
          message: `Your shift at ${shift.site?.name} has been cancelled`,
          priority: 'HIGH',
          data: {
            shiftId: shift.id,
            reason,
            cancelledBy,
          },
        });
      }

      // Notify supervisor
      if (shift.supervisorId && shift.supervisorId !== cancelledBy) {
        notifications.push({
          userId: shift.supervisorId,
          type: 'SHIFT_CANCELLED',
          title: 'Shift Cancelled',
          message: `Shift at ${shift.site?.name} has been cancelled`,
          priority: 'HIGH',
          data: {
            shiftId: shift.id,
            reason,
            cancelledBy,
          },
        });
      }

      // Create notifications in batch
      if (notifications.length > 0) {
        await this.prisma.notification.createMany({
          data: notifications,
        });
      }
    } catch (error) {
      logger.error('Failed to create cancellation notifications:', error);
    }
  }

  async createStatusChangeNotifications(shift, oldStatus, newStatus, metadata) {
    try {
      const notifications = [];

      // Determine notification priority based on status change
      let priority = 'NORMAL';
      if (newStatus === 'NO_SHOW' || newStatus === 'CANCELLED') {
        priority = 'HIGH';
      }

      // Notify assigned agent
      if (shift.agentId) {
        notifications.push({
          userId: shift.agent.userId,
          type: 'SHIFT_STATUS_CHANGED',
          title: 'Shift Status Updated',
          message: `Your shift status changed from ${oldStatus} to ${newStatus}`,
          priority,
          data: {
            shiftId: shift.id,
            oldStatus,
            newStatus,
            metadata,
          },
        });
      }

      // Notify supervisor
      if (shift.supervisorId) {
        notifications.push({
          userId: shift.supervisorId,
          type: 'SHIFT_STATUS_CHANGED',
          title: 'Shift Status Updated',
          message: `Shift at ${shift.site?.name} status changed to ${newStatus}`,
          priority,
          data: {
            shiftId: shift.id,
            oldStatus,
            newStatus,
            metadata,
          },
        });
      }

      // Create notifications in batch
      if (notifications.length > 0) {
        await this.prisma.notification.createMany({
          data: notifications,
        });
      }
    } catch (error) {
      logger.error('Failed to create status change notifications:', error);
    }
  }

  async createNoShowIncident(shift) {
    // Create incident report for no-show
    await this.prisma.report.create({
      data: {
        shiftId: shift.id,
        siteId: shift.siteId,
        agentId: shift.agentId,
        reportType: 'INCIDENT',
        title: 'Agent No-Show',
        content: {
          type: 'no_show',
          scheduledStartTime: shift.startTime,
          description: 'Agent failed to show up for scheduled shift',
        },
        priority: 'HIGH',
        status: 'SUBMITTED',
      },
    });
  }

  emitShiftUpdate(shift, action, changes = []) {
    if (this.io) {
      this.io.to('role:supervisor').to('role:admin').emit('shift_update', {
        action,
        shift: {
          id: shift.id,
          siteId: shift.siteId,
          siteName: shift.site?.name,
          agentId: shift.agentId,
          agentName: shift.agent?.user?.profile?.firstName + ' ' + shift.agent?.user?.profile?.lastName,
          startTime: shift.startTime,
          endTime: shift.endTime,
          status: shift.status,
        },
        changes,
        timestamp: new Date(),
      });

      // Notify the assigned agent
      if (shift.agentId) {
        this.io.to(`user:${shift.agent.user.id}`).emit('my_shift_update', {
          action,
          shift,
          changes,
          timestamp: new Date(),
        });
      }
    }
  }

  async autoAssignSingleShift(shiftId) {
    try {
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          site: {
            select: {
              id: true,
              name: true,
              coordinates: true,
              requirements: true,
            },
          },
        },
      });

      if (!shift) {
        throw new Error('Shift not found');
      }

      if (shift.agentId) {
        return { success: false, message: 'Shift already has an assigned agent' };
      }

      // Get available agents for this shift
      const availableAgents = await this.getAvailableAgentsForShift(
        shift.startTime,
        shift.endTime,
        shift.site.requirements?.skills || [],
        shift.siteId
      );

      if (availableAgents.length === 0) {
        return { success: false, message: 'No available agents found for this shift' };
      }

      // Score and rank agents
      const scoredAgents = availableAgents.map(agent => ({
        agent,
        score: this.calculateAgentScore(agent, shift),
      })).sort((a, b) => b.score - a.score);

      const bestAgent = scoredAgents[0].agent;

      // Assign the best agent
      const updatedShift = await this.prisma.shift.update({
        where: { id: shiftId },
        data: {
          agentId: bestAgent.id,
          status: 'CONFIRMED',
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
        },
      });

      // Create notification for assigned agent
      await this.createAssignmentNotification(updatedShift, bestAgent);

      // Emit real-time update
      this.emitShiftUpdate(updatedShift, 'assigned', [
        { field: 'agentId', oldValue: null, newValue: bestAgent.id }
      ]);

      logger.audit('shift_auto_assigned', {
        shiftId,
        agentId: bestAgent.id,
        score: scoredAgents[0].score,
      });

      return {
        success: true,
        agentId: bestAgent.id,
        agent: bestAgent,
        score: scoredAgents[0].score,
      };
    } catch (error) {
      logger.error('Failed to auto-assign single shift:', error);
      throw error;
    }
  }

  async getAvailableAgentsForShift(startTime, endTime, requiredSkills = [], siteId) {
    try {
      const agents = await this.prisma.agent.findMany({
        where: {
          status: 'ACTIVE',
          user: {
            status: 'ACTIVE',
          },
          // Check if agent has required skills
          ...(requiredSkills.length > 0 && {
            skills: {
              hasSome: requiredSkills,
            },
          }),
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
              startTime: { lt: endTime },
              endTime: { gt: startTime },
              status: { notIn: ['CANCELLED', 'COMPLETED'] },
              deletedAt: null,
            },
          },
        },
      });

      // Filter out agents who have conflicting shifts
      return agents.filter(agent => agent.shifts.length === 0);
    } catch (error) {
      logger.error('Failed to get available agents for shift:', error);
      throw error;
    }
  }

  calculateAgentScore(agent, shift) {
    let score = 0.5; // Base score

    // Experience factor (0-0.3)
    const experienceYears = agent.experienceYears || 0;
    score += Math.min(experienceYears * 0.05, 0.3);

    // Skills match factor (0-0.2)
    const requiredSkills = shift.site?.requirements?.skills || [];
    const agentSkills = agent.skills || [];
    const skillsMatch = requiredSkills.filter(skill => agentSkills.includes(skill)).length;
    if (requiredSkills.length > 0) {
      score += (skillsMatch / requiredSkills.length) * 0.2;
    }

    // Performance rating factor (0-0.2)
    const rating = agent.performanceMetrics?.rating || 3;
    score += ((rating - 1) / 4) * 0.2;

    // Proximity factor (0-0.1) - if agent has location data
    if (agent.lastKnownLocation && shift.site?.coordinates) {
      const distance = this.calculateDistance(
        agent.lastKnownLocation,
        shift.site.coordinates
      );
      // Closer agents get higher scores (within 50km)
      score += Math.max(0, (50 - distance) / 50) * 0.1;
    }

    // Availability preference factor (0-0.1)
    if (agent.preferences?.preferredShiftTypes?.includes(shift.shiftType)) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  calculateDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in km
    const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
    const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  async createAssignmentNotification(shift, agent) {
    try {
      await this.prisma.notification.create({
        data: {
          userId: agent.userId,
          type: 'SHIFT_ASSIGNED',
          title: 'New Shift Assigned',
          message: `You have been assigned to a shift at ${shift.site?.name}`,
          priority: 'NORMAL',
          data: {
            shiftId: shift.id,
            siteId: shift.siteId,
            startTime: shift.startTime,
            endTime: shift.endTime,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to create assignment notification:', error);
    }
  }

  async getOptimizationRecommendations(siteId, startDate, endDate) {
    try {
      const shifts = await this.prisma.shift.findMany({
        where: {
          siteId,
          startTime: { gte: startDate },
          endTime: { lte: endDate },
          deletedAt: null,
        },
        include: {
          agent: true,
          attendance: true,
        },
      });

      const recommendations = [];

      // Analyze shift patterns and suggest optimizations
      const unassignedShifts = shifts.filter(s => !s.agentId);
      if (unassignedShifts.length > 0) {
        recommendations.push({
          type: 'UNASSIGNED_SHIFTS',
          priority: 'HIGH',
          message: `${unassignedShifts.length} shifts need agent assignment`,
          action: 'auto_assign',
          data: { shiftIds: unassignedShifts.map(s => s.id) },
        });
      }

      // Check for overtime patterns
      const agentHours = {};
      shifts.forEach(shift => {
        if (shift.agentId && shift.attendance?.length > 0) {
          const hours = shift.attendance[0].totalHours || 0;
          agentHours[shift.agentId] = (agentHours[shift.agentId] || 0) + hours;
        }
      });

      Object.entries(agentHours).forEach(([agentId, hours]) => {
        if (hours > 40) {
          recommendations.push({
            type: 'OVERTIME_WARNING',
            priority: 'MEDIUM',
            message: `Agent ${agentId} has ${hours} hours scheduled (overtime)`,
            action: 'redistribute_shifts',
            data: { agentId, hours },
          });
        }
      });

      return recommendations;
    } catch (error) {
      logger.error('Failed to get optimization recommendations:', error);
      return [];
    }
  }

  async getStaffingRecommendations(siteId, startDate, endDate) {
    try {
      const site = await this.prisma.site.findUnique({
        where: { id: siteId },
        include: {
          shifts: {
            where: {
              startTime: { gte: startDate },
              endTime: { lte: endDate },
              deletedAt: null,
            },
          },
        },
      });

      const recommendations = [];
      const totalShifts = site.shifts.length;
      const assignedShifts = site.shifts.filter(s => s.agentId).length;
      const coverageRate = totalShifts > 0 ? (assignedShifts / totalShifts) * 100 : 0;

      if (coverageRate < 80) {
        recommendations.push({
          type: 'LOW_COVERAGE',
          priority: 'HIGH',
          message: `Site coverage is only ${coverageRate.toFixed(1)}%`,
          action: 'hire_more_agents',
          data: { currentCoverage: coverageRate, targetCoverage: 95 },
        });
      }

      return recommendations;
    } catch (error) {
      logger.error('Failed to get staffing recommendations:', error);
      return [];
    }
  }

  async getCostOptimizationRecommendations(siteId, startDate, endDate) {
    try {
      const shifts = await this.prisma.shift.findMany({
        where: {
          siteId,
          startTime: { gte: startDate },
          endTime: { lte: endDate },
          deletedAt: null,
        },
        include: {
          agent: true,
          attendance: true,
        },
      });

      const recommendations = [];
      let totalCost = 0;
      let overtimeCost = 0;

      shifts.forEach(shift => {
        if (shift.attendance?.length > 0) {
          const hours = shift.attendance[0].totalHours || 0;
          const hourlyRate = shift.agent?.hourlyRate || 25; // Default rate
          const regularHours = Math.min(hours, 8);
          const overtimeHours = Math.max(0, hours - 8);

          totalCost += regularHours * hourlyRate;
          overtimeCost += overtimeHours * hourlyRate * 1.5;
        }
      });

      if (overtimeCost > totalCost * 0.1) {
        recommendations.push({
          type: 'HIGH_OVERTIME_COST',
          priority: 'MEDIUM',
          message: `Overtime costs are ${((overtimeCost / totalCost) * 100).toFixed(1)}% of total labor costs`,
          action: 'optimize_scheduling',
          data: { totalCost, overtimeCost },
        });
      }

      return recommendations;
    } catch (error) {
      logger.error('Failed to get cost optimization recommendations:', error);
      return [];
    }
  }
}

module.exports = ShiftManagementService;
