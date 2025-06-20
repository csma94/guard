const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * GDPR Compliance Service
 * Handles data protection, privacy rights, and compliance requirements
 */
class GDPRService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Process data subject access request (Right to Access)
   */
  async processDataAccessRequest(userId, requestedBy) {
    try {
      logger.info('Processing GDPR data access request', { userId, requestedBy });

      // Get user data
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          agent: {
            include: {
              shifts: {
                include: {
                  site: {
                    select: { id: true, name: true, address: true }
                  }
                }
              },
              attendance: true,
              locationTracking: true,
              reports: {
                include: {
                  mediaFiles: true
                }
              },
              timeOffRequests: true,
              qrCodeScans: true,
              geofenceViolations: true
            }
          },
          sentMessages: true,
          receivedMessages: true,
          sentNotifications: true,
          receivedNotifications: true,
          auditLogs: true
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Anonymize sensitive data for export
      const exportData = {
        personalData: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status,
          profile: user.profile,
          preferences: user.preferences,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          twoFactorEnabled: user.twoFactorEnabled
        },
        agentData: user.agent ? {
          employeeId: user.agent.employeeId,
          hireDate: user.agent.hireDate,
          employmentStatus: user.agent.employmentStatus,
          skills: user.agent.skills,
          certifications: user.agent.certifications,
          performanceMetrics: user.agent.performanceMetrics
        } : null,
        workData: user.agent ? {
          shiftsCount: user.agent.shifts.length,
          attendanceRecords: user.agent.attendance.length,
          reportsSubmitted: user.agent.reports.length,
          locationTrackingPoints: user.agent.locationTracking.length
        } : null,
        communicationData: {
          messagesSent: user.sentMessages.length,
          messagesReceived: user.receivedMessages.length,
          notificationsSent: user.sentNotifications.length,
          notificationsReceived: user.receivedNotifications.length
        },
        auditTrail: {
          totalAuditLogs: user.auditLogs.length,
          lastActivity: user.auditLogs[0]?.timestamp || null
        }
      };

      // Log the access request
      await this.logGDPRActivity(userId, 'DATA_ACCESS_REQUEST', {
        requestedBy,
        dataExported: true,
        recordsCount: {
          shifts: user.agent?.shifts.length || 0,
          reports: user.agent?.reports.length || 0,
          messages: user.sentMessages.length + user.receivedMessages.length,
          auditLogs: user.auditLogs.length
        }
      });

      return {
        success: true,
        data: exportData,
        exportedAt: new Date().toISOString(),
        requestId: crypto.randomUUID()
      };

    } catch (error) {
      logger.error('GDPR data access request failed:', error);
      throw error;
    }
  }

  /**
   * Process data deletion request (Right to Erasure)
   */
  async processDataDeletionRequest(userId, requestedBy, options = {}) {
    try {
      const {
        deletePersonalData = true,
        deleteWorkData = false,
        deleteAuditLogs = false,
        retainForLegal = true,
        reason = 'User request'
      } = options;

      logger.info('Processing GDPR data deletion request', { 
        userId, 
        requestedBy, 
        options 
      });

      // Check if user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { agent: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const deletionResults = {
        personalDataDeleted: false,
        workDataDeleted: false,
        auditLogsDeleted: false,
        anonymizedRecords: [],
        retainedRecords: []
      };

      // Start transaction for data deletion
      await this.prisma.$transaction(async (tx) => {
        if (deletePersonalData) {
          // Anonymize personal data instead of hard delete for compliance
          await tx.user.update({
            where: { id: userId },
            data: {
              username: `deleted_user_${crypto.randomBytes(8).toString('hex')}`,
              email: `deleted_${crypto.randomBytes(8).toString('hex')}@anonymized.local`,
              passwordHash: 'DELETED',
              profile: {},
              preferences: {},
              twoFactorEnabled: false,
              twoFactorSecret: null,
              deletedAt: new Date()
            }
          });
          deletionResults.personalDataDeleted = true;
        }

        if (deleteWorkData && user.agent) {
          // Anonymize work-related data
          await tx.agent.update({
            where: { id: user.agent.id },
            data: {
              performanceMetrics: {},
              emergencyContact: null,
              deletedAt: new Date()
            }
          });

          // Anonymize location tracking data
          await tx.locationTracking.updateMany({
            where: { agentId: user.agent.id },
            data: {
              coordinates: 'POINT(0 0)', // Anonymize location
              accuracy: null,
              altitude: null,
              speed: null,
              heading: null,
              batteryLevel: null
            }
          });

          deletionResults.workDataDeleted = true;
        }

        if (deleteAuditLogs && !retainForLegal) {
          // Only delete audit logs if not required for legal compliance
          await tx.auditLog.deleteMany({
            where: { userId }
          });
          deletionResults.auditLogsDeleted = true;
        }

        // Log the deletion request
        await this.logGDPRActivity(userId, 'DATA_DELETION_REQUEST', {
          requestedBy,
          deletionOptions: options,
          results: deletionResults
        }, tx);
      });

      return {
        success: true,
        deletionResults,
        processedAt: new Date().toISOString(),
        requestId: crypto.randomUUID()
      };

    } catch (error) {
      logger.error('GDPR data deletion request failed:', error);
      throw error;
    }
  }

  /**
   * Process data portability request (Right to Data Portability)
   */
  async processDataPortabilityRequest(userId, requestedBy, format = 'json') {
    try {
      logger.info('Processing GDPR data portability request', { userId, requestedBy, format });

      // Get structured data for portability
      const portableData = await this.getPortableUserData(userId);

      // Log the portability request
      await this.logGDPRActivity(userId, 'DATA_PORTABILITY_REQUEST', {
        requestedBy,
        format,
        dataSize: JSON.stringify(portableData).length
      });

      return {
        success: true,
        data: portableData,
        format,
        exportedAt: new Date().toISOString(),
        requestId: crypto.randomUUID()
      };

    } catch (error) {
      logger.error('GDPR data portability request failed:', error);
      throw error;
    }
  }

  /**
   * Process consent withdrawal
   */
  async processConsentWithdrawal(userId, consentTypes, requestedBy) {
    try {
      logger.info('Processing consent withdrawal', { userId, consentTypes, requestedBy });

      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Update user preferences to reflect consent withdrawal
      const updatedPreferences = { ...user.preferences };
      
      consentTypes.forEach(consentType => {
        switch (consentType) {
          case 'marketing':
            updatedPreferences.marketingConsent = false;
            break;
          case 'analytics':
            updatedPreferences.analyticsConsent = false;
            break;
          case 'location_tracking':
            updatedPreferences.locationTrackingConsent = false;
            break;
          case 'data_processing':
            updatedPreferences.dataProcessingConsent = false;
            break;
        }
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: { preferences: updatedPreferences }
      });

      // Log consent withdrawal
      await this.logGDPRActivity(userId, 'CONSENT_WITHDRAWAL', {
        requestedBy,
        consentTypes,
        withdrawnAt: new Date().toISOString()
      });

      return {
        success: true,
        withdrawnConsents: consentTypes,
        processedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Consent withdrawal failed:', error);
      throw error;
    }
  }

  /**
   * Get portable user data in structured format
   */
  async getPortableUserData(userId) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        agent: {
          include: {
            shifts: {
              include: {
                site: { select: { name: true, address: true } },
                attendance: true
              }
            },
            reports: {
              include: {
                mediaFiles: { select: { filename: true, fileType: true, createdAt: true } }
              }
            },
            locationTracking: {
              select: {
                coordinates: true,
                timestamp: true,
                accuracy: true
              }
            }
          }
        }
      }
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        profile: user.profile,
        createdAt: user.createdAt
      },
      workHistory: user.agent?.shifts.map(shift => ({
        siteId: shift.siteId,
        siteName: shift.site.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        shiftType: shift.shiftType,
        status: shift.status,
        attendance: shift.attendance.map(att => ({
          clockInTime: att.clockInTime,
          clockOutTime: att.clockOutTime,
          totalHours: att.totalHours
        }))
      })) || [],
      reports: user.agent?.reports.map(report => ({
        id: report.id,
        type: report.reportType,
        title: report.title,
        submittedAt: report.submittedAt,
        status: report.status,
        mediaFilesCount: report.mediaFiles.length
      })) || [],
      locationData: user.agent?.locationTracking.map(loc => ({
        timestamp: loc.timestamp,
        accuracy: loc.accuracy
        // Note: Actual coordinates excluded for privacy
      })) || []
    };
  }

  /**
   * Log GDPR-related activities
   */
  async logGDPRActivity(userId, action, details, tx = null) {
    const prismaClient = tx || this.prisma;
    
    await prismaClient.auditLog.create({
      data: {
        userId,
        action: `GDPR_${action}`,
        tableName: 'gdpr_activities',
        recordId: userId,
        newValues: details,
        timestamp: new Date()
      }
    });
  }
}

module.exports = GDPRService;
