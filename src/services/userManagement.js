const { v4: uuidv4 } = require('uuid');
// Note: bcrypt removed - authentication now handled by Clerk
const logger = require('../config/logger');
const config = require('../config/config');

/**
 * User Management Service
 * Handles complex user operations, role management, and user lifecycle
 */
class UserManagementService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Create user with role-specific setup
   */
  async createUserWithRole(userData, createdBy) {
    const {
      username,
      email,
      password,
      role,
      profile = {},
      agentDetails = {},
      clientDetails = {},
      supervisorDetails = {},
    } = userData;

    try {
      // Note: Password hashing is now handled by Clerk
      // Users are created through Clerk authentication system

      const result = await this.prisma.$transaction(async (tx) => {
        // Create base user
        const user = await tx.user.create({
          data: {
            id: uuidv4(),
            username,
            email,
            // passwordHash removed - handled by Clerk
            role,
            status: 'ACTIVE',
            profile,
            preferences: this.getDefaultPreferences(role),
          },
        });

        // Create role-specific records
        switch (role) {
          case 'AGENT':
            await this.createAgentProfile(tx, user.id, agentDetails);
            break;
          case 'CLIENT':
            await this.createClientProfile(tx, user.id, clientDetails);
            break;
          case 'SUPERVISOR':
            await this.createSupervisorProfile(tx, user.id, supervisorDetails);
            break;
        }

        return user;
      });

      // Log user creation
      logger.audit('user_created', {
        createdBy,
        userId: result.id,
        role,
        username,
        email,
      });

      return result;
    } catch (error) {
      logger.error('Failed to create user:', error);
      throw error;
    }
  }

  /**
   * Create agent profile
   */
  async createAgentProfile(tx, userId, agentDetails) {
    const {
      employeeId,
      hireDate,
      skills = [],
      certifications = [],
      emergencyContact,
      performanceMetrics = {},
    } = agentDetails;

    return await tx.agent.create({
      data: {
        id: uuidv4(),
        userId,
        employeeId: employeeId || `EMP${Date.now()}`,
        hireDate: hireDate ? new Date(hireDate) : new Date(),
        employmentStatus: 'ACTIVE',
        skills,
        certifications,
        emergencyContact,
        performanceMetrics,
      },
    });
  }

  /**
   * Create client profile
   */
  async createClientProfile(tx, userId, clientDetails) {
    const {
      companyName,
      contactPerson,
      billingAddress,
      contractDetails = {},
      serviceLevel = 'STANDARD',
    } = clientDetails;

    return await tx.client.create({
      data: {
        id: uuidv4(),
        userId,
        companyName,
        contactPerson,
        billingAddress,
        contractDetails,
        serviceLevel,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Create supervisor profile
   */
  async createSupervisorProfile(tx, userId, supervisorDetails) {
    const {
      department,
      managedSites = [],
      permissions = {},
    } = supervisorDetails;

    return await tx.supervisor.create({
      data: {
        id: uuidv4(),
        userId,
        department,
        managedSites,
        permissions,
        isActive: true,
      },
    });
  }

  /**
   * Get default preferences for role
   */
  getDefaultPreferences(role) {
    const basePreferences = {
      language: 'en',
      timezone: 'UTC',
      notifications: {
        pushEnabled: true,
        emailEnabled: true,
        smsEnabled: false,
      },
    };

    switch (role) {
      case 'AGENT':
        return {
          ...basePreferences,
          locationTracking: {
            enabled: true,
            frequency: 30, // seconds
            accuracy: 'HIGH',
          },
          reporting: {
            autoSave: true,
            photoRequired: true,
          },
        };

      case 'SUPERVISOR':
        return {
          ...basePreferences,
          dashboard: {
            defaultView: 'OVERVIEW',
            refreshInterval: 60, // seconds
          },
          alerts: {
            geofenceViolations: true,
            emergencyReports: true,
            agentOffline: true,
          },
        };

      case 'CLIENT':
        return {
          ...basePreferences,
          reports: {
            frequency: 'DAILY',
            format: 'PDF',
            includePhotos: true,
          },
          notifications: {
            ...basePreferences.notifications,
            reportDelivery: true,
            incidentAlerts: true,
          },
        };

      default:
        return basePreferences;
    }
  }

  /**
   * Update user role with proper migration
   */
  async updateUserRole(userId, newRole, updatedBy) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          agent: true,
          client: true,
          supervisor: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.role === newRole) {
        throw new Error('User already has this role');
      }

      const result = await this.prisma.$transaction(async (tx) => {
        // Archive old role-specific data
        await this.archiveRoleData(tx, user);

        // Update user role
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            role: newRole,
            preferences: this.getDefaultPreferences(newRole),
            updatedAt: new Date(),
          },
        });

        // Create new role-specific data if needed
        switch (newRole) {
          case 'AGENT':
            await this.createAgentProfile(tx, userId, {});
            break;
          case 'CLIENT':
            await this.createClientProfile(tx, userId, {});
            break;
          case 'SUPERVISOR':
            await this.createSupervisorProfile(tx, userId, {});
            break;
        }

        return updatedUser;
      });

      // Log role change
      logger.audit('user_role_changed', {
        updatedBy,
        userId,
        oldRole: user.role,
        newRole,
      });

      return result;
    } catch (error) {
      logger.error('Failed to update user role:', error);
      throw error;
    }
  }

  /**
   * Archive role-specific data when changing roles
   */
  async archiveRoleData(tx, user) {
    const archiveData = {
      userId: user.id,
      oldRole: user.role,
      archivedAt: new Date(),
      data: {},
    };

    if (user.agent) {
      archiveData.data.agent = user.agent;
      await tx.agent.update({
        where: { id: user.agent.id },
        data: { deletedAt: new Date() },
      });
    }

    if (user.client) {
      archiveData.data.client = user.client;
      await tx.client.update({
        where: { id: user.client.id },
        data: { deletedAt: new Date() },
      });
    }

    if (user.supervisor) {
      archiveData.data.supervisor = user.supervisor;
      await tx.supervisor.update({
        where: { id: user.supervisor.id },
        data: { deletedAt: new Date() },
      });
    }

    // Store archive record
    await tx.userRoleArchive.create({
      data: {
        id: uuidv4(),
        ...archiveData,
      },
    });
  }

  /**
   * Bulk user operations
   */
  async bulkUpdateUsers(userIds, updates, updatedBy) {
    try {
      const validUpdates = {};
      
      // Only allow specific fields to be bulk updated
      const allowedFields = ['status', 'preferences'];
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          validUpdates[field] = updates[field];
        }
      });

      if (Object.keys(validUpdates).length === 0) {
        throw new Error('No valid fields to update');
      }

      validUpdates.updatedAt = new Date();

      const result = await this.prisma.user.updateMany({
        where: {
          id: { in: userIds },
          deletedAt: null,
        },
        data: validUpdates,
      });

      // Log bulk update
      logger.audit('bulk_user_update', {
        updatedBy,
        userIds,
        updates: validUpdates,
        affectedCount: result.count,
      });

      return result;
    } catch (error) {
      logger.error('Failed to bulk update users:', error);
      throw error;
    }
  }

  /**
   * Get user activity summary
   */
  async getUserActivitySummary(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          agent: {
            include: {
              shifts: {
                where: {
                  startTime: { gte: startDate },
                },
              },
              reports: {
                where: {
                  createdAt: { gte: startDate },
                },
              },
              attendance: {
                where: {
                  clockInTime: { gte: startDate },
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const summary = {
        userId,
        period: `${days} days`,
        lastLogin: user.lastLoginAt,
        activity: {
          shiftsWorked: user.agent?.shifts.length || 0,
          reportsSubmitted: user.agent?.reports.length || 0,
          attendanceRecords: user.agent?.attendance.length || 0,
        },
      };

      if (user.agent) {
        // Calculate total hours worked
        const totalHours = user.agent.attendance.reduce((sum, record) => {
          return sum + (record.totalHours || 0);
        }, 0);

        summary.activity.totalHoursWorked = totalHours;
        summary.activity.averageHoursPerShift = user.agent.shifts.length > 0 
          ? totalHours / user.agent.shifts.length 
          : 0;
      }

      return summary;
    } catch (error) {
      logger.error('Failed to get user activity summary:', error);
      throw error;
    }
  }

  /**
   * Deactivate user and cleanup
   */
  async deactivateUser(userId, reason, deactivatedBy) {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Update user status
        const user = await tx.user.update({
          where: { id: userId },
          data: {
            status: 'INACTIVE',
            updatedAt: new Date(),
          },
        });

        // Cancel active shifts
        await tx.shift.updateMany({
          where: {
            agentId: userId,
            status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          },
          data: {
            status: 'CANCELLED',
            updatedAt: new Date(),
          },
        });

        // Log deactivation
        await tx.auditLog.create({
          data: {
            userId: deactivatedBy,
            action: 'USER_DEACTIVATED',
            tableName: 'users',
            recordId: userId,
            newValues: {
              reason,
              deactivatedBy,
              deactivatedAt: new Date(),
            },
          },
        });

        return user;
      });

      logger.audit('user_deactivated', {
        deactivatedBy,
        userId,
        reason,
      });

      return result;
    } catch (error) {
      logger.error('Failed to deactivate user:', error);
      throw error;
    }
  }
}

module.exports = UserManagementService;
