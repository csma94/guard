const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * Emergency Alert & Escalation System
 * Handles critical emergency situations with automatic escalation
 */
class EmergencyAlertSystem {
  constructor(prisma, webSocketService, notificationService, smsService, emailService) {
    this.prisma = prisma;
    this.webSocketService = webSocketService;
    this.notificationService = notificationService;
    this.smsService = smsService;
    this.emailService = emailService;
    
    // Active emergency tracking
    this.activeEmergencies = new Map();
    this.escalationTimers = new Map();
    this.responseTracking = new Map();
    
    // Emergency response teams
    this.emergencyContacts = new Map();
    this.loadEmergencyContacts();
  }

  /**
   * Trigger emergency alert
   */
  async triggerEmergencyAlert(alertData) {
    try {
      const {
        agentId,
        alertType,
        severity = 'CRITICAL',
        location,
        description,
        metadata = {},
        requiresImmedateResponse = true,
      } = alertData;

      // Create emergency alert record
      const emergencyAlert = await this.prisma.emergencyAlert.create({
        data: {
          id: uuidv4(),
          agentId,
          alertType,
          severity,
          location: location ? `POINT(${location.longitude} ${location.latitude})` : null,
          description,
          metadata,
          status: 'ACTIVE',
          triggeredAt: new Date(),
        },
        include: {
          agent: {
            include: {
              user: {
                select: { id: true, username: true, profile: true },
              },
              shifts: {
                where: {
                  status: 'IN_PROGRESS',
                  startTime: { lte: new Date() },
                  endTime: { gte: new Date() },
                },
                include: {
                  site: {
                    select: { id: true, name: true, address: true },
                  },
                },
                take: 1,
              },
            },
          },
        },
      });

      // Add to active tracking
      this.activeEmergencies.set(emergencyAlert.id, {
        alert: emergencyAlert,
        escalationLevel: 0,
        responseTeam: [],
        acknowledgedBy: [],
        startTime: new Date(),
      });

      // Immediate response actions
      await this.executeImmediateResponse(emergencyAlert);

      // Setup escalation chain
      if (requiresImmedateResponse) {
        this.setupEscalationChain(emergencyAlert);
      }

      // Broadcast emergency alert
      await this.broadcastEmergencyAlert(emergencyAlert);

      logger.critical('Emergency alert triggered', {
        alertId: emergencyAlert.id,
        agentId,
        alertType,
        severity,
        location,
      });

      return emergencyAlert;
    } catch (error) {
      logger.error('Failed to trigger emergency alert:', error);
      throw error;
    }
  }

  /**
   * Execute immediate response actions
   */
  async executeImmediateResponse(emergencyAlert) {
    const responseActions = [];

    try {
      // 1. Notify all supervisors immediately
      const supervisors = await this.getActiveSupervisors();
      for (const supervisor of supervisors) {
        await this.sendEmergencyNotification(supervisor.id, emergencyAlert, 'SUPERVISOR');
        responseActions.push(`Notified supervisor: ${supervisor.username}`);
      }

      // 2. Notify security operations center
      const securityTeam = await this.getSecurityOperationsTeam();
      for (const member of securityTeam) {
        await this.sendEmergencyNotification(member.id, emergencyAlert, 'SECURITY_OPS');
        responseActions.push(`Notified security ops: ${member.username}`);
      }

      // 3. Alert nearby agents if location available
      if (emergencyAlert.location) {
        const nearbyAgents = await this.getNearbyAgents(emergencyAlert.location, 5000); // 5km radius
        for (const agent of nearbyAgents) {
          await this.sendEmergencyNotification(agent.id, emergencyAlert, 'NEARBY_AGENT');
          responseActions.push(`Alerted nearby agent: ${agent.username}`);
        }
      }

      // 4. Auto-contact emergency services for critical alerts
      if (emergencyAlert.severity === 'CRITICAL' && this.shouldContactEmergencyServices(emergencyAlert.alertType)) {
        await this.contactEmergencyServices(emergencyAlert);
        responseActions.push('Emergency services contacted');
      }

      // 5. Activate emergency protocols
      await this.activateEmergencyProtocols(emergencyAlert);
      responseActions.push('Emergency protocols activated');

      // Log response actions
      await this.prisma.emergencyResponse.create({
        data: {
          id: uuidv4(),
          emergencyAlertId: emergencyAlert.id,
          responseType: 'IMMEDIATE',
          actions: responseActions,
          timestamp: new Date(),
        },
      });

    } catch (error) {
      logger.error('Failed to execute immediate response:', error);
    }
  }

  /**
   * Setup escalation chain with timers
   */
  setupEscalationChain(emergencyAlert) {
    const escalationLevels = [
      { delay: 2 * 60 * 1000, level: 1, description: 'Management Team' },      // 2 minutes
      { delay: 5 * 60 * 1000, level: 2, description: 'Executive Team' },       // 5 minutes
      { delay: 10 * 60 * 1000, level: 3, description: 'External Authorities' }, // 10 minutes
    ];

    for (const escalation of escalationLevels) {
      const timer = setTimeout(async () => {
        await this.executeEscalation(emergencyAlert.id, escalation.level);
      }, escalation.delay);

      const timerId = `${emergencyAlert.id}-${escalation.level}`;
      this.escalationTimers.set(timerId, timer);
    }
  }

  /**
   * Execute escalation level
   */
  async executeEscalation(alertId, escalationLevel) {
    try {
      const emergencyData = this.activeEmergencies.get(alertId);
      if (!emergencyData || emergencyData.alert.status !== 'ACTIVE') {
        return; // Emergency resolved or no longer active
      }

      const alert = emergencyData.alert;
      let escalationActions = [];

      switch (escalationLevel) {
        case 1:
          // Management Team
          const managers = await this.getManagementTeam();
          for (const manager of managers) {
            await this.sendEscalationNotification(manager.id, alert, 'MANAGEMENT', escalationLevel);
            escalationActions.push(`Escalated to manager: ${manager.username}`);
          }
          break;

        case 2:
          // Executive Team
          const executives = await this.getExecutiveTeam();
          for (const executive of executives) {
            await this.sendEscalationNotification(executive.id, alert, 'EXECUTIVE', escalationLevel);
            escalationActions.push(`Escalated to executive: ${executive.username}`);
          }
          break;

        case 3:
          // External Authorities
          await this.contactExternalAuthorities(alert);
          escalationActions.push('External authorities contacted');
          break;
      }

      // Update escalation level
      emergencyData.escalationLevel = escalationLevel;
      this.activeEmergencies.set(alertId, emergencyData);

      // Log escalation
      await this.prisma.emergencyResponse.create({
        data: {
          id: uuidv4(),
          emergencyAlertId: alertId,
          responseType: 'ESCALATION',
          escalationLevel,
          actions: escalationActions,
          timestamp: new Date(),
        },
      });

      // Update alert record
      await this.prisma.emergencyAlert.update({
        where: { id: alertId },
        data: {
          escalationLevel,
          lastEscalatedAt: new Date(),
        },
      });

      logger.warn('Emergency escalated', {
        alertId,
        escalationLevel,
        actions: escalationActions.length,
      });

    } catch (error) {
      logger.error('Failed to execute escalation:', error);
    }
  }

  /**
   * Acknowledge emergency alert
   */
  async acknowledgeEmergencyAlert(alertId, acknowledgedBy, responseData = {}) {
    try {
      const {
        estimatedResponseTime,
        responseTeam = [],
        notes,
      } = responseData;

      const emergencyData = this.activeEmergencies.get(alertId);
      if (!emergencyData) {
        throw new Error('Emergency alert not found');
      }

      // Add to acknowledged list
      emergencyData.acknowledgedBy.push({
        userId: acknowledgedBy,
        timestamp: new Date(),
        estimatedResponseTime,
        notes,
      });

      // Update response team
      if (responseTeam.length > 0) {
        emergencyData.responseTeam.push(...responseTeam);
      }

      this.activeEmergencies.set(alertId, emergencyData);

      // Update database
      await this.prisma.emergencyAlert.update({
        where: { id: alertId },
        data: {
          acknowledgedBy,
          acknowledgedAt: new Date(),
          estimatedResponseTime,
          responseTeam,
          status: 'ACKNOWLEDGED',
        },
      });

      // Notify all stakeholders of acknowledgment
      await this.broadcastAcknowledgment(alertId, acknowledgedBy, responseData);

      logger.info('Emergency alert acknowledged', {
        alertId,
        acknowledgedBy,
        estimatedResponseTime,
        responseTeamSize: responseTeam.length,
      });

      return emergencyData;
    } catch (error) {
      logger.error('Failed to acknowledge emergency alert:', error);
      throw error;
    }
  }

  /**
   * Resolve emergency alert
   */
  async resolveEmergencyAlert(alertId, resolvedBy, resolutionData) {
    try {
      const {
        resolution,
        outcome,
        notes,
        followUpRequired = false,
        incidentReportId,
      } = resolutionData;

      // Clear escalation timers
      this.clearEscalationTimers(alertId);

      // Update alert status
      const resolvedAlert = await this.prisma.emergencyAlert.update({
        where: { id: alertId },
        data: {
          status: 'RESOLVED',
          resolvedBy,
          resolvedAt: new Date(),
          resolution,
          outcome,
          resolutionNotes: notes,
          followUpRequired,
          incidentReportId,
        },
        include: {
          agent: {
            include: {
              user: {
                select: { id: true, username: true },
              },
            },
          },
        },
      });

      // Remove from active tracking
      this.activeEmergencies.delete(alertId);

      // Broadcast resolution
      await this.broadcastResolution(resolvedAlert, resolutionData);

      // Generate post-incident report if required
      if (followUpRequired) {
        await this.generatePostIncidentReport(resolvedAlert);
      }

      logger.info('Emergency alert resolved', {
        alertId,
        resolvedBy,
        resolution,
        outcome,
        followUpRequired,
      });

      return resolvedAlert;
    } catch (error) {
      logger.error('Failed to resolve emergency alert:', error);
      throw error;
    }
  }

  /**
   * Send emergency notification
   */
  async sendEmergencyNotification(recipientId, emergencyAlert, recipientType) {
    const urgentChannels = ['PUSH', 'SMS', 'EMAIL'];
    
    let title, message;
    switch (emergencyAlert.alertType) {
      case 'PANIC_BUTTON':
        title = '🚨 EMERGENCY: Panic Button Activated';
        message = `Agent ${emergencyAlert.agent.user.username} has activated panic button`;
        break;
      case 'MEDICAL_EMERGENCY':
        title = '🚨 MEDICAL EMERGENCY';
        message = `Medical emergency reported by ${emergencyAlert.agent.user.username}`;
        break;
      case 'SECURITY_BREACH':
        title = '🚨 SECURITY BREACH';
        message = `Security breach reported at ${emergencyAlert.agent.shifts[0]?.site.name || 'unknown location'}`;
        break;
      case 'FIRE_EMERGENCY':
        title = '🚨 FIRE EMERGENCY';
        message = `Fire emergency reported by ${emergencyAlert.agent.user.username}`;
        break;
      default:
        title = '🚨 EMERGENCY ALERT';
        message = `Emergency situation reported by ${emergencyAlert.agent.user.username}`;
    }

    await this.notificationService.sendNotification({
      recipientId,
      type: 'EMERGENCY_ALERT',
      title,
      message: `${message}\n\nLocation: ${emergencyAlert.agent.shifts[0]?.site.name || 'Unknown'}\nDescription: ${emergencyAlert.description}`,
      data: {
        emergencyAlertId: emergencyAlert.id,
        alertType: emergencyAlert.alertType,
        severity: emergencyAlert.severity,
        agentId: emergencyAlert.agentId,
        location: emergencyAlert.location,
        recipientType,
      },
      channels: urgentChannels,
      priority: 'URGENT',
    });
  }

  /**
   * Broadcast emergency alert to all relevant parties
   */
  async broadcastEmergencyAlert(emergencyAlert) {
    // WebSocket broadcast to all supervisors and admins
    this.webSocketService.broadcastToRole('SUPERVISOR', 'emergency_alert', {
      alert: emergencyAlert,
      timestamp: new Date(),
    });

    this.webSocketService.broadcastToRole('ADMIN', 'emergency_alert', {
      alert: emergencyAlert,
      timestamp: new Date(),
    });

    // Emergency dashboard update
    this.webSocketService.broadcast('emergency_dashboard_update', {
      activeEmergencies: Array.from(this.activeEmergencies.values()),
    });
  }

  /**
   * Contact emergency services
   */
  async contactEmergencyServices(emergencyAlert) {
    try {
      // This would integrate with emergency services APIs
      // For now, we'll log and notify administrators
      
      const emergencyNumber = process.env.EMERGENCY_SERVICES_NUMBER || '911';
      const location = emergencyAlert.agent.shifts[0]?.site.address || 'Unknown location';
      
      // Log emergency services contact
      logger.critical('Emergency services contact required', {
        alertId: emergencyAlert.id,
        alertType: emergencyAlert.alertType,
        location,
        agentName: emergencyAlert.agent.user.username,
      });

      // Notify administrators to manually contact emergency services
      const admins = await this.getAdministrators();
      for (const admin of admins) {
        await this.notificationService.sendNotification({
          recipientId: admin.id,
          type: 'EMERGENCY_SERVICES_REQUIRED',
          title: 'URGENT: Contact Emergency Services',
          message: `Emergency services contact required for ${emergencyAlert.alertType} at ${location}. Call ${emergencyNumber} immediately.`,
          data: {
            emergencyAlertId: emergencyAlert.id,
            emergencyNumber,
            location,
            alertType: emergencyAlert.alertType,
          },
          channels: ['PUSH', 'SMS', 'EMAIL'],
          priority: 'URGENT',
        });
      }

    } catch (error) {
      logger.error('Failed to contact emergency services:', error);
    }
  }

  /**
   * Activate emergency protocols
   */
  async activateEmergencyProtocols(emergencyAlert) {
    try {
      const protocols = await this.getEmergencyProtocols(emergencyAlert.alertType);
      
      for (const protocol of protocols) {
        await this.executeProtocol(protocol, emergencyAlert);
      }

    } catch (error) {
      logger.error('Failed to activate emergency protocols:', error);
    }
  }

  /**
   * Get emergency protocols for alert type
   */
  async getEmergencyProtocols(alertType) {
    // This would be configured in the database
    const defaultProtocols = [
      {
        name: 'Lockdown Procedure',
        applicable: ['SECURITY_BREACH', 'ACTIVE_THREAT'],
        actions: ['SECURE_PERIMETER', 'NOTIFY_AUTHORITIES', 'EVACUATE_IF_SAFE'],
      },
      {
        name: 'Medical Response',
        applicable: ['MEDICAL_EMERGENCY'],
        actions: ['CALL_AMBULANCE', 'FIRST_AID', 'CLEAR_ACCESS_ROUTES'],
      },
      {
        name: 'Fire Response',
        applicable: ['FIRE_EMERGENCY'],
        actions: ['CALL_FIRE_DEPT', 'EVACUATE', 'SECURE_UTILITIES'],
      },
    ];

    return defaultProtocols.filter(protocol => 
      protocol.applicable.includes(alertType)
    );
  }

  /**
   * Execute emergency protocol
   */
  async executeProtocol(protocol, emergencyAlert) {
    logger.info('Executing emergency protocol', {
      protocolName: protocol.name,
      alertId: emergencyAlert.id,
      actions: protocol.actions,
    });

    // Protocol execution would be implemented based on specific requirements
    // This could include automated systems integration, facility controls, etc.
  }

  /**
   * Clear escalation timers
   */
  clearEscalationTimers(alertId) {
    for (let level = 1; level <= 3; level++) {
      const timerId = `${alertId}-${level}`;
      const timer = this.escalationTimers.get(timerId);
      if (timer) {
        clearTimeout(timer);
        this.escalationTimers.delete(timerId);
      }
    }
  }

  /**
   * Get active supervisors
   */
  async getActiveSupervisors() {
    return await this.prisma.user.findMany({
      where: {
        role: 'SUPERVISOR',
        status: 'ACTIVE',
      },
      select: { id: true, username: true, profile: true },
    });
  }

  /**
   * Get security operations team
   */
  async getSecurityOperationsTeam() {
    return await this.prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPERVISOR'] },
        status: 'ACTIVE',
      },
      select: { id: true, username: true, profile: true },
    });
  }

  /**
   * Get nearby agents
   */
  async getNearbyAgents(location, radiusMeters) {
    // This would use spatial queries to find agents within radius
    // For now, return active agents
    return await this.prisma.user.findMany({
      where: {
        role: 'AGENT',
        status: 'ACTIVE',
        agent: {
          shifts: {
            some: {
              status: 'IN_PROGRESS',
              startTime: { lte: new Date() },
              endTime: { gte: new Date() },
            },
          },
        },
      },
      select: { id: true, username: true, profile: true },
    });
  }

  /**
   * Should contact emergency services
   */
  shouldContactEmergencyServices(alertType) {
    const emergencyServiceTypes = [
      'MEDICAL_EMERGENCY',
      'FIRE_EMERGENCY',
      'ACTIVE_THREAT',
      'SECURITY_BREACH',
    ];
    return emergencyServiceTypes.includes(alertType);
  }

  /**
   * Load emergency contacts
   */
  async loadEmergencyContacts() {
    // Load emergency contact configuration
    // This would be stored in database configuration
  }

  /**
   * Get management team
   */
  async getManagementTeam() {
    return await this.prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'MANAGER'] },
        status: 'ACTIVE',
      },
      select: { id: true, username: true, profile: true },
    });
  }

  /**
   * Get executive team
   */
  async getExecutiveTeam() {
    return await this.prisma.user.findMany({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      select: { id: true, username: true, profile: true },
    });
  }

  /**
   * Get administrators
   */
  async getAdministrators() {
    return await this.prisma.user.findMany({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      select: { id: true, username: true, profile: true },
    });
  }
}

module.exports = EmergencyAlertSystem;
