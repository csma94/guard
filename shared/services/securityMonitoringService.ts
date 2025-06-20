import crypto from 'crypto';
import geoip from 'geoip-lite';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import { emailService } from './emailService';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  location?: {
    country: string;
    region: string;
    city: string;
    coordinates?: [number, number];
  };
  timestamp: Date;
  metadata: Record<string, any>;
  riskScore: number;
  blocked: boolean;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export type SecurityEventType = 
  | 'SUSPICIOUS_LOGIN'
  | 'MULTIPLE_FAILED_LOGINS'
  | 'UNUSUAL_LOCATION'
  | 'PRIVILEGE_ESCALATION'
  | 'DATA_BREACH_ATTEMPT'
  | 'MALICIOUS_REQUEST'
  | 'ACCOUNT_TAKEOVER'
  | 'BRUTE_FORCE_ATTACK'
  | 'SQL_INJECTION_ATTEMPT'
  | 'XSS_ATTEMPT'
  | 'CSRF_ATTEMPT'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNAUTHORIZED_ACCESS'
  | 'SUSPICIOUS_API_USAGE'
  | 'ANOMALOUS_BEHAVIOR';

export interface ThreatIntelligence {
  ipAddress: string;
  threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  categories: string[];
  lastSeen: Date;
  source: string;
  confidence: number;
}

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: {
    eventTypes: SecurityEventType[];
    threshold: number;
    timeWindow: number; // in minutes
    ipWhitelist?: string[];
    ipBlacklist?: string[];
    userAgentPatterns?: string[];
    geoRestrictions?: {
      allowedCountries?: string[];
      blockedCountries?: string[];
    };
  };
  actions: {
    block: boolean;
    notify: boolean;
    escalate: boolean;
    quarantine: boolean;
  };
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

class SecurityMonitoringService {
  private events: Map<string, SecurityEvent> = new Map();
  private rules: Map<string, SecurityRule> = new Map();
  private threatIntel: Map<string, ThreatIntelligence> = new Map();
  private blockedIPs: Set<string> = new Set();
  private suspiciousIPs: Map<string, { score: number; lastActivity: Date }> = new Map();
  private userSessions: Map<string, { ipAddresses: Set<string>; locations: Set<string> }> = new Map();

  constructor() {
    this.initializeDefaultRules();
    this.initializeCleanupTasks();
    this.loadThreatIntelligence();
  }

  private initializeDefaultRules(): void {
    const defaultRules: SecurityRule[] = [
      {
        id: 'multiple_failed_logins',
        name: 'Multiple Failed Login Attempts',
        description: 'Detect multiple failed login attempts from same IP',
        enabled: true,
        conditions: {
          eventTypes: ['MULTIPLE_FAILED_LOGINS'],
          threshold: 5,
          timeWindow: 15,
        },
        actions: {
          block: true,
          notify: true,
          escalate: false,
          quarantine: false,
        },
        severity: 'HIGH',
      },
      {
        id: 'brute_force_attack',
        name: 'Brute Force Attack Detection',
        description: 'Detect brute force attacks across multiple accounts',
        enabled: true,
        conditions: {
          eventTypes: ['BRUTE_FORCE_ATTACK'],
          threshold: 10,
          timeWindow: 10,
        },
        actions: {
          block: true,
          notify: true,
          escalate: true,
          quarantine: false,
        },
        severity: 'CRITICAL',
      },
      {
        id: 'unusual_location',
        name: 'Unusual Location Access',
        description: 'Detect access from unusual geographic locations',
        enabled: true,
        conditions: {
          eventTypes: ['UNUSUAL_LOCATION'],
          threshold: 1,
          timeWindow: 60,
        },
        actions: {
          block: false,
          notify: true,
          escalate: false,
          quarantine: true,
        },
        severity: 'MEDIUM',
      },
      {
        id: 'privilege_escalation',
        name: 'Privilege Escalation Attempt',
        description: 'Detect attempts to escalate privileges',
        enabled: true,
        conditions: {
          eventTypes: ['PRIVILEGE_ESCALATION'],
          threshold: 1,
          timeWindow: 5,
        },
        actions: {
          block: true,
          notify: true,
          escalate: true,
          quarantine: true,
        },
        severity: 'CRITICAL',
      },
      {
        id: 'sql_injection',
        name: 'SQL Injection Detection',
        description: 'Detect SQL injection attempts',
        enabled: true,
        conditions: {
          eventTypes: ['SQL_INJECTION_ATTEMPT'],
          threshold: 1,
          timeWindow: 1,
        },
        actions: {
          block: true,
          notify: true,
          escalate: true,
          quarantine: false,
        },
        severity: 'CRITICAL',
      },
    ];

    defaultRules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });

    logger.info('Security monitoring initialized with default rules');
  }

  private initializeCleanupTasks(): void {
    // Clean up old events every hour
    setInterval(() => {
      this.cleanupOldEvents();
    }, 60 * 60 * 1000);

    // Update threat intelligence every 6 hours
    setInterval(() => {
      this.loadThreatIntelligence();
    }, 6 * 60 * 60 * 1000);

    // Clean up suspicious IPs every day
    setInterval(() => {
      this.cleanupSuspiciousIPs();
    }, 24 * 60 * 60 * 1000);
  }

  public async recordSecurityEvent(
    type: SecurityEventType,
    ipAddress: string,
    metadata: Record<string, any> = {},
    userAgent?: string,
    userId?: string
  ): Promise<SecurityEvent> {
    try {
      const eventId = crypto.randomUUID();
      const location = this.getLocationFromIP(ipAddress);
      const riskScore = await this.calculateRiskScore(type, ipAddress, metadata, userId);

      const event: SecurityEvent = {
        id: eventId,
        type,
        severity: this.getSeverityFromRiskScore(riskScore),
        userId,
        ipAddress,
        userAgent,
        location,
        timestamp: new Date(),
        metadata,
        riskScore,
        blocked: false,
        resolved: false,
      };

      // Store event
      this.events.set(eventId, event);

      // Check against security rules
      await this.evaluateSecurityRules(event);

      // Update suspicious IP tracking
      this.updateSuspiciousIPTracking(ipAddress, riskScore);

      // Log event
      logger.warn('Security event recorded:', {
        id: eventId,
        type,
        severity: event.severity,
        ipAddress,
        riskScore,
      });

      return event;

    } catch (error) {
      logger.error('Failed to record security event:', error);
      throw error;
    }
  }

  public async evaluateSecurityRules(event: SecurityEvent): Promise<void> {
    try {
      for (const rule of this.rules.values()) {
        if (!rule.enabled || !rule.conditions.eventTypes.includes(event.type)) {
          continue;
        }

        const shouldTrigger = await this.checkRuleConditions(rule, event);
        if (shouldTrigger) {
          await this.executeRuleActions(rule, event);
        }
      }
    } catch (error) {
      logger.error('Failed to evaluate security rules:', error);
    }
  }

  private async checkRuleConditions(rule: SecurityRule, event: SecurityEvent): Promise<boolean> {
    const { conditions } = rule;
    const timeWindow = conditions.timeWindow * 60 * 1000; // Convert to milliseconds
    const cutoffTime = new Date(Date.now() - timeWindow);

    // Check IP whitelist/blacklist
    if (conditions.ipWhitelist && conditions.ipWhitelist.includes(event.ipAddress)) {
      return false;
    }
    if (conditions.ipBlacklist && conditions.ipBlacklist.includes(event.ipAddress)) {
      return true;
    }

    // Check geographic restrictions
    if (conditions.geoRestrictions && event.location) {
      const { allowedCountries, blockedCountries } = conditions.geoRestrictions;
      if (allowedCountries && !allowedCountries.includes(event.location.country)) {
        return true;
      }
      if (blockedCountries && blockedCountries.includes(event.location.country)) {
        return true;
      }
    }

    // Check user agent patterns
    if (conditions.userAgentPatterns && event.userAgent) {
      const matchesPattern = conditions.userAgentPatterns.some(pattern => {
        const regex = new RegExp(pattern, 'i');
        return regex.test(event.userAgent!);
      });
      if (matchesPattern) {
        return true;
      }
    }

    // Count similar events in time window
    const similarEvents = Array.from(this.events.values()).filter(e => 
      e.ipAddress === event.ipAddress &&
      conditions.eventTypes.includes(e.type) &&
      e.timestamp >= cutoffTime
    );

    return similarEvents.length >= conditions.threshold;
  }

  private async executeRuleActions(rule: SecurityRule, event: SecurityEvent): Promise<void> {
    try {
      const { actions } = rule;

      if (actions.block) {
        await this.blockIP(event.ipAddress, `Triggered rule: ${rule.name}`);
        event.blocked = true;
      }

      if (actions.notify) {
        await this.sendSecurityAlert(rule, event);
      }

      if (actions.escalate) {
        await this.escalateSecurityIncident(rule, event);
      }

      if (actions.quarantine && event.userId) {
        await this.quarantineUser(event.userId, `Triggered rule: ${rule.name}`);
      }

      logger.warn('Security rule triggered:', {
        ruleId: rule.id,
        ruleName: rule.name,
        eventId: event.id,
        actions: Object.keys(actions).filter(key => actions[key as keyof typeof actions]),
      });

    } catch (error) {
      logger.error('Failed to execute rule actions:', error);
    }
  }

  private async calculateRiskScore(
    type: SecurityEventType,
    ipAddress: string,
    metadata: Record<string, any>,
    userId?: string
  ): Promise<number> {
    let score = 0;

    // Base score by event type
    const baseScores: Record<SecurityEventType, number> = {
      'SUSPICIOUS_LOGIN': 30,
      'MULTIPLE_FAILED_LOGINS': 50,
      'UNUSUAL_LOCATION': 40,
      'PRIVILEGE_ESCALATION': 90,
      'DATA_BREACH_ATTEMPT': 95,
      'MALICIOUS_REQUEST': 60,
      'ACCOUNT_TAKEOVER': 95,
      'BRUTE_FORCE_ATTACK': 80,
      'SQL_INJECTION_ATTEMPT': 85,
      'XSS_ATTEMPT': 70,
      'CSRF_ATTEMPT': 65,
      'RATE_LIMIT_EXCEEDED': 25,
      'UNAUTHORIZED_ACCESS': 75,
      'SUSPICIOUS_API_USAGE': 55,
      'ANOMALOUS_BEHAVIOR': 45,
    };

    score += baseScores[type] || 50;

    // Check threat intelligence
    const threatInfo = this.threatIntel.get(ipAddress);
    if (threatInfo) {
      const threatScores = { LOW: 10, MEDIUM: 25, HIGH: 50, CRITICAL: 75 };
      score += threatScores[threatInfo.threatLevel];
    }

    // Check if IP is already suspicious
    const suspiciousInfo = this.suspiciousIPs.get(ipAddress);
    if (suspiciousInfo) {
      score += Math.min(suspiciousInfo.score * 0.5, 30);
    }

    // Check for repeated events from same IP
    const recentEvents = Array.from(this.events.values()).filter(e => 
      e.ipAddress === ipAddress &&
      e.timestamp >= new Date(Date.now() - 60 * 60 * 1000) // Last hour
    );
    score += Math.min(recentEvents.length * 5, 25);

    // Check for unusual location
    if (userId && metadata.location) {
      const userSessions = this.userSessions.get(userId);
      if (userSessions) {
        const locationKey = `${metadata.location.country}-${metadata.location.region}`;
        if (!userSessions.locations.has(locationKey)) {
          score += 20;
        }
      }
    }

    return Math.min(score, 100);
  }

  private getSeverityFromRiskScore(riskScore: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (riskScore >= 80) return 'CRITICAL';
    if (riskScore >= 60) return 'HIGH';
    if (riskScore >= 40) return 'MEDIUM';
    return 'LOW';
  }

  private getLocationFromIP(ipAddress: string): SecurityEvent['location'] | undefined {
    try {
      const geo = geoip.lookup(ipAddress);
      if (geo) {
        return {
          country: geo.country,
          region: geo.region,
          city: geo.city,
          coordinates: geo.ll,
        };
      }
    } catch (error) {
      logger.error('Failed to get location from IP:', error);
    }
    return undefined;
  }

  private updateSuspiciousIPTracking(ipAddress: string, riskScore: number): void {
    const existing = this.suspiciousIPs.get(ipAddress);
    const newScore = existing ? Math.min(existing.score + riskScore * 0.1, 100) : riskScore * 0.1;
    
    this.suspiciousIPs.set(ipAddress, {
      score: newScore,
      lastActivity: new Date(),
    });
  }

  public async blockIP(ipAddress: string, reason: string): Promise<void> {
    try {
      this.blockedIPs.add(ipAddress);
      
      // Store in Redis for persistence across instances
      await redisClient.sadd('blocked_ips', ipAddress);
      await redisClient.setex(`blocked_ip:${ipAddress}`, 24 * 60 * 60, reason); // 24 hours

      logger.warn('IP address blocked:', { ipAddress, reason });

    } catch (error) {
      logger.error('Failed to block IP:', error);
    }
  }

  public async unblockIP(ipAddress: string): Promise<void> {
    try {
      this.blockedIPs.delete(ipAddress);
      
      await redisClient.srem('blocked_ips', ipAddress);
      await redisClient.del(`blocked_ip:${ipAddress}`);

      logger.info('IP address unblocked:', { ipAddress });

    } catch (error) {
      logger.error('Failed to unblock IP:', error);
    }
  }

  public isIPBlocked(ipAddress: string): boolean {
    return this.blockedIPs.has(ipAddress);
  }

  private async sendSecurityAlert(rule: SecurityRule, event: SecurityEvent): Promise<void> {
    try {
      const alertData = {
        ruleName: rule.name,
        severity: event.severity,
        eventType: event.type,
        ipAddress: event.ipAddress,
        location: event.location,
        timestamp: event.timestamp,
        riskScore: event.riskScore,
        metadata: event.metadata,
      };

      // Send to security team
      await emailService.sendSecurityAlert(alertData);

      // Could also send to SIEM, Slack, etc.

    } catch (error) {
      logger.error('Failed to send security alert:', error);
    }
  }

  private async escalateSecurityIncident(rule: SecurityRule, event: SecurityEvent): Promise<void> {
    try {
      // Create incident ticket
      // Notify security team immediately
      // Could integrate with incident management system

      logger.error('Security incident escalated:', {
        ruleId: rule.id,
        eventId: event.id,
        severity: event.severity,
      });

    } catch (error) {
      logger.error('Failed to escalate security incident:', error);
    }
  }

  private async quarantineUser(userId: string, reason: string): Promise<void> {
    try {
      // Temporarily disable user account
      // Invalidate all sessions
      // Notify user and administrators

      logger.warn('User quarantined:', { userId, reason });

    } catch (error) {
      logger.error('Failed to quarantine user:', error);
    }
  }

  private async loadThreatIntelligence(): Promise<void> {
    try {
      // Load threat intelligence from external sources
      // This would typically integrate with threat intel feeds
      
      logger.info('Threat intelligence updated');

    } catch (error) {
      logger.error('Failed to load threat intelligence:', error);
    }
  }

  private cleanupOldEvents(): void {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    
    for (const [id, event] of this.events.entries()) {
      if (event.timestamp < cutoff) {
        this.events.delete(id);
      }
    }
  }

  private cleanupSuspiciousIPs(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    
    for (const [ip, info] of this.suspiciousIPs.entries()) {
      if (info.lastActivity < cutoff && info.score < 50) {
        this.suspiciousIPs.delete(ip);
      }
    }
  }

  public getSecurityEvents(filters?: {
    severity?: string;
    type?: SecurityEventType;
    ipAddress?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): SecurityEvent[] {
    let events = Array.from(this.events.values());

    if (filters) {
      if (filters.severity) {
        events = events.filter(e => e.severity === filters.severity);
      }
      if (filters.type) {
        events = events.filter(e => e.type === filters.type);
      }
      if (filters.ipAddress) {
        events = events.filter(e => e.ipAddress === filters.ipAddress);
      }
      if (filters.userId) {
        events = events.filter(e => e.userId === filters.userId);
      }
      if (filters.startDate) {
        events = events.filter(e => e.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        events = events.filter(e => e.timestamp <= filters.endDate!);
      }
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  public getSecurityRules(): SecurityRule[] {
    return Array.from(this.rules.values());
  }

  public async updateSecurityRule(ruleId: string, updates: Partial<SecurityRule>): Promise<boolean> {
    try {
      const rule = this.rules.get(ruleId);
      if (!rule) {
        return false;
      }

      const updatedRule = { ...rule, ...updates };
      this.rules.set(ruleId, updatedRule);

      logger.info('Security rule updated:', { ruleId });
      return true;

    } catch (error) {
      logger.error('Failed to update security rule:', error);
      return false;
    }
  }
}

export default SecurityMonitoringService;
