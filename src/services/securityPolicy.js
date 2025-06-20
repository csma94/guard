const logger = require('../config/logger');

/**
 * Security Policy Management Service
 * Manages security configurations, policies, and threat detection rules
 */
class SecurityPolicyService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.policies = new Map();
    this.threatRules = new Map();
    this.blockedIPs = new Set();
    this.suspiciousIPs = new Map();
    
    // Initialize default policies
    this.initializeDefaultPolicies();
    
    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Initialize default security policies
   */
  initializeDefaultPolicies() {
    const defaultPolicies = {
      rateLimit: {
        general: { windowMs: 15 * 60 * 1000, max: 1000 },
        auth: { windowMs: 15 * 60 * 1000, max: 10 },
        api: { windowMs: 15 * 60 * 1000, max: 5000 },
        passwordReset: { windowMs: 60 * 60 * 1000, max: 3 },
      },
      
      inputValidation: {
        maxStringLength: 10000,
        maxArraySize: 1000,
        maxObjectKeys: 100,
        maxRequestSize: 10 * 1024 * 1024, // 10MB
      },
      
      threatDetection: {
        maxFailedAttempts: 5,
        blockDuration: 60 * 60 * 1000, // 1 hour
        suspiciousThreshold: 3,
        autoBlockEnabled: true,
      },
      
      contentSecurity: {
        allowedFileTypes: [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp',
          'application/pdf', 'text/plain', 'text/csv',
          'video/mp4', 'video/webm', 'video/quicktime',
        ],
        maxFileSize: 50 * 1024 * 1024, // 50MB
        scanUploads: true,
      },
      
      sessionSecurity: {
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        refreshTokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
        requireTwoFactor: false,
        maxConcurrentSessions: 5,
      },
    };

    for (const [key, policy] of Object.entries(defaultPolicies)) {
      this.policies.set(key, policy);
    }

    logger.info('Default security policies initialized');
  }

  /**
   * Get security policy by name
   */
  getPolicy(policyName) {
    return this.policies.get(policyName);
  }

  /**
   * Update security policy
   */
  async updatePolicy(policyName, policyData) {
    try {
      // Validate policy data
      this.validatePolicyData(policyName, policyData);
      
      // Update in memory
      this.policies.set(policyName, policyData);
      
      // Persist to database
      await this.prisma.systemConfiguration.upsert({
        where: { key: `SECURITY_POLICY_${policyName.toUpperCase()}` },
        update: { value: policyData },
        create: {
          key: `SECURITY_POLICY_${policyName.toUpperCase()}`,
          value: policyData,
        },
      });

      logger.info('Security policy updated', { policyName, policyData });
      return true;
    } catch (error) {
      logger.error('Failed to update security policy', {
        policyName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Validate policy data
   */
  validatePolicyData(policyName, policyData) {
    const validators = {
      rateLimit: (data) => {
        const required = ['windowMs', 'max'];
        for (const [key, config] of Object.entries(data)) {
          for (const field of required) {
            if (typeof config[field] !== 'number' || config[field] <= 0) {
              throw new Error(`Invalid ${field} in ${key} rate limit config`);
            }
          }
        }
      },
      
      inputValidation: (data) => {
        const numericFields = ['maxStringLength', 'maxArraySize', 'maxObjectKeys', 'maxRequestSize'];
        for (const field of numericFields) {
          if (typeof data[field] !== 'number' || data[field] <= 0) {
            throw new Error(`Invalid ${field} in input validation config`);
          }
        }
      },
      
      threatDetection: (data) => {
        const required = ['maxFailedAttempts', 'blockDuration', 'suspiciousThreshold'];
        for (const field of required) {
          if (typeof data[field] !== 'number' || data[field] <= 0) {
            throw new Error(`Invalid ${field} in threat detection config`);
          }
        }
      },
    };

    const validator = validators[policyName];
    if (validator) {
      validator(policyData);
    }
  }

  /**
   * Record security event
   */
  async recordSecurityEvent(eventType, details) {
    try {
      const event = {
        type: eventType,
        timestamp: new Date(),
        ip: details.ip,
        userAgent: details.userAgent,
        endpoint: details.endpoint,
        userId: details.userId,
        severity: details.severity || 'medium',
        details: details.additionalData || {},
      };

      // Store in database
      await this.prisma.auditLog.create({
        data: {
          action: eventType,
          userId: details.userId,
          details: event,
          ipAddress: details.ip,
          userAgent: details.userAgent,
        },
      });

      // Update threat tracking
      await this.updateThreatTracking(details.ip, eventType, details.severity);

      logger.info('Security event recorded', event);
    } catch (error) {
      logger.error('Failed to record security event', {
        eventType,
        error: error.message,
      });
    }
  }

  /**
   * Update threat tracking for IP addresses
   */
  async updateThreatTracking(ip, eventType, severity = 'medium') {
    if (!ip) return;

    const key = `threat:${ip}`;
    const now = Date.now();
    
    try {
      // Get current threat data
      let threatData = this.suspiciousIPs.get(ip) || {
        events: [],
        score: 0,
        firstSeen: now,
        lastSeen: now,
      };

      // Add new event
      threatData.events.push({
        type: eventType,
        timestamp: now,
        severity,
      });

      // Update score based on severity
      const severityScores = { low: 1, medium: 3, high: 5, critical: 10 };
      threatData.score += severityScores[severity] || 3;
      threatData.lastSeen = now;

      // Clean old events (keep last 24 hours)
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      threatData.events = threatData.events.filter(event => event.timestamp > oneDayAgo);

      // Update threat data
      this.suspiciousIPs.set(ip, threatData);

      // Check if IP should be blocked
      const threatPolicy = this.getPolicy('threatDetection');
      if (threatPolicy.autoBlockEnabled && threatData.score >= threatPolicy.suspiciousThreshold * 5) {
        await this.blockIP(ip, 'Automatic block due to high threat score');
      }

      // Store in Redis for persistence
      if (this.redis) {
        await this.redis.setex(key, 86400, JSON.stringify(threatData)); // 24 hours
      }

    } catch (error) {
      logger.error('Failed to update threat tracking', {
        ip,
        eventType,
        error: error.message,
      });
    }
  }

  /**
   * Block IP address
   */
  async blockIP(ip, reason) {
    try {
      this.blockedIPs.add(ip);
      
      // Store in database
      await this.prisma.systemConfiguration.upsert({
        where: { key: `BLOCKED_IP_${ip}` },
        update: { 
          value: { 
            reason, 
            blockedAt: new Date().toISOString(),
            blockedBy: 'system',
          }
        },
        create: {
          key: `BLOCKED_IP_${ip}`,
          value: { 
            reason, 
            blockedAt: new Date().toISOString(),
            blockedBy: 'system',
          },
        },
      });

      // Store in Redis for fast lookup
      if (this.redis) {
        await this.redis.setex(`blocked:${ip}`, 86400, reason);
      }

      logger.warn('IP address blocked', { ip, reason });
    } catch (error) {
      logger.error('Failed to block IP', { ip, reason, error: error.message });
    }
  }

  /**
   * Unblock IP address
   */
  async unblockIP(ip) {
    try {
      this.blockedIPs.delete(ip);
      
      // Remove from database
      await this.prisma.systemConfiguration.deleteMany({
        where: { key: `BLOCKED_IP_${ip}` },
      });

      // Remove from Redis
      if (this.redis) {
        await this.redis.del(`blocked:${ip}`);
      }

      logger.info('IP address unblocked', { ip });
    } catch (error) {
      logger.error('Failed to unblock IP', { ip, error: error.message });
    }
  }

  /**
   * Check if IP is blocked
   */
  async isIPBlocked(ip) {
    if (this.blockedIPs.has(ip)) {
      return true;
    }

    // Check Redis cache
    if (this.redis) {
      const blocked = await this.redis.get(`blocked:${ip}`);
      if (blocked) {
        this.blockedIPs.add(ip); // Update local cache
        return true;
      }
    }

    return false;
  }

  /**
   * Get threat score for IP
   */
  getThreatScore(ip) {
    const threatData = this.suspiciousIPs.get(ip);
    return threatData ? threatData.score : 0;
  }

  /**
   * Get security statistics
   */
  async getSecurityStats() {
    try {
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

      // Get recent security events
      const recentEvents = await this.prisma.auditLog.count({
        where: {
          createdAt: { gte: new Date(oneDayAgo) },
          action: { in: ['SECURITY_VIOLATION', 'FAILED_LOGIN', 'BLOCKED_REQUEST'] },
        },
      });

      const weeklyEvents = await this.prisma.auditLog.count({
        where: {
          createdAt: { gte: new Date(oneWeekAgo) },
          action: { in: ['SECURITY_VIOLATION', 'FAILED_LOGIN', 'BLOCKED_REQUEST'] },
        },
      });

      return {
        blockedIPs: this.blockedIPs.size,
        suspiciousIPs: this.suspiciousIPs.size,
        securityEvents24h: recentEvents,
        securityEvents7d: weeklyEvents,
        policies: Object.keys(this.policies.entries()),
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get security stats', { error: error.message });
      return null;
    }
  }

  /**
   * Start periodic cleanup of old data
   */
  startPeriodicCleanup() {
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000); // Run every hour
  }

  /**
   * Clean up old threat tracking data
   */
  cleanupOldData() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    // Clean up old suspicious IP data
    for (const [ip, data] of this.suspiciousIPs.entries()) {
      if (data.lastSeen < oneDayAgo) {
        this.suspiciousIPs.delete(ip);
      }
    }

    logger.info('Security data cleanup completed', {
      suspiciousIPs: this.suspiciousIPs.size,
      blockedIPs: this.blockedIPs.size,
    });
  }

  /**
   * Load policies from database
   */
  async loadPoliciesFromDatabase() {
    try {
      const configs = await this.prisma.systemConfiguration.findMany({
        where: {
          key: { startsWith: 'SECURITY_POLICY_' },
        },
      });

      for (const config of configs) {
        const policyName = config.key.replace('SECURITY_POLICY_', '').toLowerCase();
        this.policies.set(policyName, config.value);
      }

      logger.info('Security policies loaded from database', {
        count: configs.length,
      });
    } catch (error) {
      logger.error('Failed to load policies from database', {
        error: error.message,
      });
    }
  }
}

module.exports = SecurityPolicyService;
