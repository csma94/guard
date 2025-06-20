const logger = require('../config/logger');

/**
 * Audit logging service for security and compliance
 */
class AuditService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Log user authentication events
   */
  async logAuthEvent(eventType, userId, details = {}) {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          eventType: 'AUTH',
          action: eventType,
          userId,
          details: {
            ...details,
            timestamp: new Date().toISOString(),
          },
          ipAddress: details.ipAddress,
          userAgent: details.userAgent,
          severity: this.getEventSeverity(eventType),
        },
      });

      logger.audit('Authentication event', {
        auditId: auditLog.id,
        eventType,
        userId,
        details,
      });

      return auditLog;
    } catch (error) {
      logger.error('Failed to log auth event:', error);
      throw error;
    }
  }

  /**
   * Log data access events
   */
  async logDataAccess(action, userId, resourceType, resourceId, details = {}) {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          eventType: 'DATA_ACCESS',
          action,
          userId,
          resourceType,
          resourceId,
          details: {
            ...details,
            timestamp: new Date().toISOString(),
          },
          ipAddress: details.ipAddress,
          userAgent: details.userAgent,
          severity: this.getDataAccessSeverity(action, resourceType),
        },
      });

      logger.audit('Data access event', {
        auditId: auditLog.id,
        action,
        userId,
        resourceType,
        resourceId,
        details,
      });

      return auditLog;
    } catch (error) {
      logger.error('Failed to log data access event:', error);
      throw error;
    }
  }

  /**
   * Log system events
   */
  async logSystemEvent(eventType, action, userId, details = {}) {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          eventType,
          action,
          userId,
          details: {
            ...details,
            timestamp: new Date().toISOString(),
          },
          ipAddress: details.ipAddress,
          userAgent: details.userAgent,
          severity: this.getSystemEventSeverity(eventType, action),
        },
      });

      logger.audit('System event', {
        auditId: auditLog.id,
        eventType,
        action,
        userId,
        details,
      });

      return auditLog;
    } catch (error) {
      logger.error('Failed to log system event:', error);
      throw error;
    }
  }

  /**
   * Log security events
   */
  async logSecurityEvent(eventType, details = {}) {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          eventType: 'SECURITY',
          action: eventType,
          details: {
            ...details,
            timestamp: new Date().toISOString(),
          },
          ipAddress: details.ipAddress,
          userAgent: details.userAgent,
          severity: 'HIGH',
        },
      });

      logger.security('Security event', {
        auditId: auditLog.id,
        eventType,
        details,
      });

      // Send immediate alerts for critical security events
      if (this.isCriticalSecurityEvent(eventType)) {
        await this.sendSecurityAlert(auditLog);
      }

      return auditLog;
    } catch (error) {
      logger.error('Failed to log security event:', error);
      throw error;
    }
  }

  /**
   * Log GDPR compliance events
   */
  async logGDPREvent(action, userId, dataSubjectId, details = {}) {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          eventType: 'GDPR',
          action,
          userId,
          details: {
            ...details,
            dataSubjectId,
            timestamp: new Date().toISOString(),
          },
          ipAddress: details.ipAddress,
          userAgent: details.userAgent,
          severity: 'MEDIUM',
        },
      });

      logger.audit('GDPR event', {
        auditId: auditLog.id,
        action,
        userId,
        dataSubjectId,
        details,
      });

      return auditLog;
    } catch (error) {
      logger.error('Failed to log GDPR event:', error);
      throw error;
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(filters = {}) {
    try {
      const {
        eventType,
        action,
        userId,
        resourceType,
        severity,
        startDate,
        endDate,
        page = 1,
        limit = 50,
      } = filters;

      const where = {
        ...(eventType && { eventType }),
        ...(action && { action }),
        ...(userId && { userId }),
        ...(resourceType && { resourceType }),
        ...(severity && { severity }),
        ...(startDate && endDate && {
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }),
      };

      const [logs, totalCount] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.auditLog.count({ where }),
      ]);

      return {
        logs,
        pagination: {
          page,
          limit,
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      throw error;
    }
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(filters = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate = new Date(),
        eventTypes = [],
      } = filters;

      const where = {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        ...(eventTypes.length > 0 && { eventType: { in: eventTypes } }),
      };

      // Get summary statistics
      const [
        totalEvents,
        eventsByType,
        eventsBySeverity,
        topUsers,
        securityEvents,
      ] = await Promise.all([
        this.prisma.auditLog.count({ where }),
        
        this.prisma.auditLog.groupBy({
          by: ['eventType'],
          where,
          _count: { eventType: true },
        }),
        
        this.prisma.auditLog.groupBy({
          by: ['severity'],
          where,
          _count: { severity: true },
        }),
        
        this.prisma.auditLog.groupBy({
          by: ['userId'],
          where: { ...where, userId: { not: null } },
          _count: { userId: true },
          orderBy: { _count: { userId: 'desc' } },
          take: 10,
        }),
        
        this.prisma.auditLog.findMany({
          where: { ...where, eventType: 'SECURITY' },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);

      return {
        period: { startDate, endDate },
        summary: {
          totalEvents,
          eventsByType: eventsByType.map(item => ({
            type: item.eventType,
            count: item._count.eventType,
          })),
          eventsBySeverity: eventsBySeverity.map(item => ({
            severity: item.severity,
            count: item._count.severity,
          })),
        },
        topUsers: topUsers.map(item => ({
          userId: item.userId,
          eventCount: item._count.userId,
        })),
        securityEvents,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to generate audit report:', error);
      throw error;
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(retentionDays = 365) {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      const result = await this.prisma.auditLog.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          severity: { not: 'CRITICAL' }, // Keep critical events longer
        },
      });

      logger.info('Audit log cleanup completed', {
        deletedCount: result.count,
        cutoffDate,
        retentionDays,
      });

      return result;
    } catch (error) {
      logger.error('Failed to cleanup audit logs:', error);
      throw error;
    }
  }

  /**
   * Export audit logs for compliance
   */
  async exportAuditLogs(filters = {}, format = 'json') {
    try {
      const logs = await this.getAuditLogs({ ...filters, limit: 10000 });
      
      const exportData = {
        exportedAt: new Date().toISOString(),
        filters,
        totalRecords: logs.pagination.total,
        logs: logs.logs.map(log => ({
          id: log.id,
          eventType: log.eventType,
          action: log.action,
          userId: log.userId,
          username: log.user?.username,
          resourceType: log.resourceType,
          resourceId: log.resourceId,
          details: log.details,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          severity: log.severity,
          createdAt: log.createdAt,
        })),
      };

      if (format === 'csv') {
        return this.convertToCSV(exportData.logs);
      }

      return exportData;
    } catch (error) {
      logger.error('Failed to export audit logs:', error);
      throw error;
    }
  }

  // Helper methods

  getEventSeverity(eventType) {
    const severityMap = {
      'LOGIN_SUCCESS': 'LOW',
      'LOGIN_FAILED': 'MEDIUM',
      'LOGOUT': 'LOW',
      'PASSWORD_CHANGED': 'MEDIUM',
      'PASSWORD_RESET': 'MEDIUM',
      'ACCOUNT_LOCKED': 'HIGH',
      'ACCOUNT_UNLOCKED': 'MEDIUM',
      'MFA_ENABLED': 'MEDIUM',
      'MFA_DISABLED': 'HIGH',
    };
    return severityMap[eventType] || 'MEDIUM';
  }

  getDataAccessSeverity(action, resourceType) {
    const sensitiveResources = ['USER', 'AGENT', 'CLIENT', 'REPORT'];
    const criticalActions = ['DELETE', 'EXPORT'];
    
    if (criticalActions.includes(action) && sensitiveResources.includes(resourceType)) {
      return 'HIGH';
    }
    if (sensitiveResources.includes(resourceType)) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  getSystemEventSeverity(eventType, action) {
    const criticalEvents = ['SYSTEM_SHUTDOWN', 'DATABASE_ERROR', 'SECURITY_BREACH'];
    const highEvents = ['CONFIG_CHANGE', 'USER_ROLE_CHANGE', 'PERMISSION_CHANGE'];
    
    if (criticalEvents.includes(eventType) || criticalEvents.includes(action)) {
      return 'CRITICAL';
    }
    if (highEvents.includes(eventType) || highEvents.includes(action)) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }

  isCriticalSecurityEvent(eventType) {
    const criticalEvents = [
      'BRUTE_FORCE_ATTACK',
      'SQL_INJECTION_ATTEMPT',
      'XSS_ATTEMPT',
      'UNAUTHORIZED_ACCESS',
      'DATA_BREACH',
      'SYSTEM_COMPROMISE',
    ];
    return criticalEvents.includes(eventType);
  }

  async sendSecurityAlert(auditLog) {
    // Implementation would send alerts via email, SMS, or other channels
    logger.critical('Critical security event detected', {
      auditId: auditLog.id,
      eventType: auditLog.action,
      details: auditLog.details,
    });
    
    // In a real implementation, this would:
    // 1. Send email alerts to security team
    // 2. Send SMS alerts for critical events
    // 3. Create tickets in security incident management system
    // 4. Trigger automated response procedures
  }

  convertToCSV(data) {
    if (!data.length) return '';
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          if (typeof value === 'object') {
            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          }
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ].join('\n');
    
    return csvContent;
  }
}

module.exports = AuditService;
