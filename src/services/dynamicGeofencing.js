const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * Dynamic Geofencing Service with multi-zone support and intelligent alerts
 */
class DynamicGeofencingService {
  constructor(prisma, webSocketService, notificationService) {
    this.prisma = prisma;
    this.webSocketService = webSocketService;
    this.notificationService = notificationService;
    
    // Active geofence monitoring
    this.activeGeofences = new Map();
    this.agentLocations = new Map();
    this.violationTimers = new Map();
    
    this.initializeGeofenceMonitoring();
  }

  /**
   * Initialize geofence monitoring for active sites
   */
  async initializeGeofenceMonitoring() {
    try {
      const activeSites = await this.prisma.site.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: {
          geofences: {
            where: { isActive: true },
          },
        },
      });

      for (const site of activeSites) {
        await this.loadSiteGeofences(site);
      }

      logger.info(`Initialized geofence monitoring for ${activeSites.length} sites`);
    } catch (error) {
      logger.error('Failed to initialize geofence monitoring:', error);
    }
  }

  /**
   * Create dynamic geofence with multiple zones
   */
  async createDynamicGeofence(siteId, geofenceConfig) {
    try {
      const {
        name,
        type = 'CIRCULAR', // CIRCULAR, POLYGON, MULTI_ZONE
        zones = [],
        alertSettings = {},
        validationRules = {},
        metadata = {},
      } = geofenceConfig;

      // Validate site exists
      const site = await this.prisma.site.findUnique({
        where: { id: siteId },
      });

      if (!site) {
        throw new Error('Site not found');
      }

      // Create main geofence record
      const geofence = await this.prisma.geofence.create({
        data: {
          id: uuidv4(),
          siteId,
          name,
          type,
          alertSettings,
          validationRules,
          metadata,
          isActive: true,
        },
      });

      // Create zones
      const createdZones = [];
      for (const zoneConfig of zones) {
        const zone = await this.createGeofenceZone(geofence.id, zoneConfig);
        createdZones.push(zone);
      }

      // Load into active monitoring
      await this.loadGeofenceIntoMonitoring(geofence, createdZones);

      logger.info('Dynamic geofence created', {
        geofenceId: geofence.id,
        siteId,
        type,
        zoneCount: createdZones.length,
      });

      return {
        geofence,
        zones: createdZones,
      };
    } catch (error) {
      logger.error('Failed to create dynamic geofence:', error);
      throw error;
    }
  }

  /**
   * Create geofence zone
   */
  async createGeofenceZone(geofenceId, zoneConfig) {
    const {
      name,
      type = 'ENTRY_EXIT', // ENTRY_EXIT, ENTRY_ONLY, EXIT_ONLY, RESTRICTED
      priority = 'NORMAL',
      geometry,
      radius,
      alertThresholds = {},
      restrictions = {},
    } = zoneConfig;

    return await this.prisma.geofenceZone.create({
      data: {
        id: uuidv4(),
        geofenceId,
        name,
        type,
        priority,
        geometry: this.formatGeometry(geometry, radius),
        radius,
        alertThresholds,
        restrictions,
        isActive: true,
      },
    });
  }

  /**
   * Process location update and check geofences
   */
  async processLocationUpdate(agentId, locationData) {
    try {
      const {
        latitude,
        longitude,
        accuracy,
        timestamp = new Date(),
        speed,
        heading,
      } = locationData;

      // Validate location accuracy
      if (accuracy > 50) { // More than 50m accuracy
        logger.warn('Location accuracy too low for geofence validation', {
          agentId,
          accuracy,
        });
        return { processed: false, reason: 'Low accuracy' };
      }

      // Get agent's current shift and site
      const activeShift = await this.getAgentActiveShift(agentId);
      if (!activeShift) {
        return { processed: false, reason: 'No active shift' };
      }

      // Update agent location tracking
      this.updateAgentLocation(agentId, {
        latitude,
        longitude,
        accuracy,
        timestamp,
        speed,
        heading,
        shiftId: activeShift.id,
        siteId: activeShift.siteId,
      });

      // Get site geofences
      const siteGeofences = this.activeGeofences.get(activeShift.siteId) || [];
      
      const results = [];
      for (const geofence of siteGeofences) {
        const result = await this.checkGeofenceViolation(
          agentId,
          { latitude, longitude, accuracy, timestamp },
          geofence,
          activeShift
        );
        results.push(result);
      }

      // Process any violations
      const violations = results.filter(r => r.violation);
      if (violations.length > 0) {
        await this.handleGeofenceViolations(agentId, violations, activeShift);
      }

      return {
        processed: true,
        geofencesChecked: siteGeofences.length,
        violations: violations.length,
        results,
      };
    } catch (error) {
      logger.error('Failed to process location update:', error);
      throw error;
    }
  }

  /**
   * Check geofence violation
   */
  async checkGeofenceViolation(agentId, location, geofence, shift) {
    const violations = [];
    let overallViolation = false;

    for (const zone of geofence.zones) {
      const isInside = this.isLocationInZone(location, zone);
      const previousState = this.getAgentZoneState(agentId, zone.id);
      
      let violation = null;

      // Check zone type rules
      switch (zone.type) {
        case 'ENTRY_EXIT':
          // Agent should be inside during shift
          if (!isInside && previousState?.inside) {
            violation = {
              type: 'UNAUTHORIZED_EXIT',
              severity: this.calculateViolationSeverity(zone, 'EXIT'),
              message: `Agent left ${zone.name} zone`,
            };
          }
          break;

        case 'ENTRY_ONLY':
          // Agent can enter but should stay
          if (!isInside && previousState?.inside) {
            violation = {
              type: 'UNAUTHORIZED_EXIT',
              severity: 'HIGH',
              message: `Agent left restricted ${zone.name} zone`,
            };
          }
          break;

        case 'RESTRICTED':
          // Agent should not enter
          if (isInside && !previousState?.inside) {
            violation = {
              type: 'UNAUTHORIZED_ENTRY',
              severity: 'CRITICAL',
              message: `Agent entered restricted ${zone.name} zone`,
            };
          }
          break;
      }

      // Update agent zone state
      this.updateAgentZoneState(agentId, zone.id, {
        inside: isInside,
        timestamp: location.timestamp,
        location,
      });

      if (violation) {
        violations.push({
          ...violation,
          zoneId: zone.id,
          zoneName: zone.name,
          geofenceId: geofence.id,
          location,
          timestamp: location.timestamp,
        });
        overallViolation = true;
      }
    }

    return {
      geofenceId: geofence.id,
      violation: overallViolation,
      violations,
      location,
      timestamp: location.timestamp,
    };
  }

  /**
   * Handle geofence violations
   */
  async handleGeofenceViolations(agentId, violations, shift) {
    try {
      for (const violationResult of violations) {
        for (const violation of violationResult.violations) {
          // Create violation record
          const violationRecord = await this.prisma.geofenceViolation.create({
            data: {
              id: uuidv4(),
              agentId,
              shiftId: shift.id,
              geofenceId: violation.geofenceId,
              zoneId: violation.zoneId,
              violationType: violation.type,
              severity: violation.severity,
              location: `POINT(${violation.location.longitude} ${violation.location.latitude})`,
              timestamp: new Date(violation.timestamp),
              description: violation.message,
              status: 'ACTIVE',
            },
          });

          // Send immediate alerts based on severity
          await this.sendViolationAlert(violationRecord, violation, shift);

          // Set up escalation timer if needed
          if (violation.severity === 'CRITICAL' || violation.severity === 'HIGH') {
            this.setupViolationEscalation(violationRecord, violation, shift);
          }

          // Emit real-time alert
          this.webSocketService.emitToRole('SUPERVISOR', 'geofence_violation', {
            violation: violationRecord,
            agent: shift.agent,
            shift,
            location: violation.location,
          });

          logger.warn('Geofence violation detected', {
            agentId,
            shiftId: shift.id,
            violationType: violation.type,
            severity: violation.severity,
            zoneName: violation.zoneName,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to handle geofence violations:', error);
    }
  }

  /**
   * Send violation alert
   */
  async sendViolationAlert(violationRecord, violation, shift) {
    const alertChannels = this.getAlertChannels(violation.severity);
    const priority = this.getAlertPriority(violation.severity);

    // Alert supervisor
    if (shift.supervisorId) {
      await this.notificationService.sendNotification({
        recipientId: shift.supervisorId,
        type: 'GEOFENCE_VIOLATION',
        title: `Geofence Violation: ${violation.type.replace('_', ' ')}`,
        message: `${shift.agent.user.username}: ${violation.message}`,
        data: {
          violationId: violationRecord.id,
          agentId: shift.agentId,
          shiftId: shift.id,
          violationType: violation.type,
          severity: violation.severity,
          location: violation.location,
        },
        channels: alertChannels,
        priority,
      });
    }

    // Alert security operations center if critical
    if (violation.severity === 'CRITICAL') {
      await this.notificationService.sendNotification({
        recipientIds: await this.getSecurityOperationsTeam(),
        type: 'CRITICAL_GEOFENCE_VIOLATION',
        title: 'CRITICAL: Security Breach Detected',
        message: `Agent ${shift.agent.user.username} ${violation.message} at ${shift.site.name}`,
        data: {
          violationId: violationRecord.id,
          agentId: shift.agentId,
          shiftId: shift.id,
          siteId: shift.siteId,
          violationType: violation.type,
          location: violation.location,
        },
        channels: ['PUSH', 'EMAIL', 'SMS'],
        priority: 'URGENT',
      });
    }
  }

  /**
   * Setup violation escalation
   */
  setupViolationEscalation(violationRecord, violation, shift) {
    const escalationDelay = violation.severity === 'CRITICAL' ? 2 * 60 * 1000 : 5 * 60 * 1000; // 2 or 5 minutes

    const timer = setTimeout(async () => {
      try {
        // Check if violation is still active
        const currentViolation = await this.prisma.geofenceViolation.findUnique({
          where: { id: violationRecord.id },
        });

        if (currentViolation && currentViolation.status === 'ACTIVE') {
          // Escalate to higher management
          await this.escalateViolation(violationRecord, violation, shift);
        }
      } catch (error) {
        logger.error('Failed to escalate violation:', error);
      }
    }, escalationDelay);

    this.violationTimers.set(violationRecord.id, timer);
  }

  /**
   * Escalate violation to higher management
   */
  async escalateViolation(violationRecord, violation, shift) {
    // Get management team
    const managementTeam = await this.getManagementTeam();

    await this.notificationService.sendNotification({
      recipientIds: managementTeam,
      type: 'ESCALATED_GEOFENCE_VIOLATION',
      title: 'ESCALATED: Unresolved Security Violation',
      message: `Unresolved geofence violation by ${shift.agent.user.username} at ${shift.site.name}`,
      data: {
        violationId: violationRecord.id,
        agentId: shift.agentId,
        shiftId: shift.id,
        siteId: shift.siteId,
        violationType: violation.type,
        severity: violation.severity,
        escalated: true,
      },
      channels: ['PUSH', 'EMAIL', 'SMS'],
      priority: 'URGENT',
    });

    // Update violation record
    await this.prisma.geofenceViolation.update({
      where: { id: violationRecord.id },
      data: {
        escalated: true,
        escalatedAt: new Date(),
      },
    });

    logger.warn('Geofence violation escalated', {
      violationId: violationRecord.id,
      agentId: shift.agentId,
      violationType: violation.type,
    });
  }

  /**
   * Resolve geofence violation
   */
  async resolveViolation(violationId, resolutionData) {
    try {
      const {
        resolvedBy,
        resolution,
        notes,
        timestamp = new Date(),
      } = resolutionData;

      const violation = await this.prisma.geofenceViolation.update({
        where: { id: violationId },
        data: {
          status: 'RESOLVED',
          resolvedBy,
          resolution,
          resolutionNotes: notes,
          resolvedAt: new Date(timestamp),
        },
        include: {
          agent: {
            include: {
              user: {
                select: { id: true, username: true },
              },
            },
          },
          shift: {
            include: {
              site: {
                select: { id: true, name: true },
              },
            },
          },
        },
      });

      // Clear escalation timer
      const timer = this.violationTimers.get(violationId);
      if (timer) {
        clearTimeout(timer);
        this.violationTimers.delete(violationId);
      }

      // Emit resolution update
      this.webSocketService.emitToRole('SUPERVISOR', 'geofence_violation_resolved', {
        violation,
        resolution,
      });

      logger.info('Geofence violation resolved', {
        violationId,
        resolvedBy,
        resolution,
      });

      return violation;
    } catch (error) {
      logger.error('Failed to resolve violation:', error);
      throw error;
    }
  }

  /**
   * Check if location is inside zone
   */
  isLocationInZone(location, zone) {
    if (zone.geometry.type === 'CIRCLE') {
      const distance = this.calculateDistance(
        location.latitude,
        location.longitude,
        zone.geometry.center.latitude,
        zone.geometry.center.longitude
      );
      return distance <= zone.radius;
    } else if (zone.geometry.type === 'POLYGON') {
      return this.isPointInPolygon(location, zone.geometry.coordinates);
    }
    return false;
  }

  /**
   * Calculate distance between coordinates
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Check if point is inside polygon
   */
  isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (
        polygon[i].longitude > point.longitude !== polygon[j].longitude > point.longitude &&
        point.latitude <
          ((polygon[j].latitude - polygon[i].latitude) * (point.longitude - polygon[i].longitude)) /
            (polygon[j].longitude - polygon[i].longitude) +
            polygon[i].latitude
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Format geometry for storage
   */
  formatGeometry(geometry, radius) {
    if (geometry.type === 'CIRCLE') {
      return {
        type: 'CIRCLE',
        center: geometry.center,
        radius,
      };
    } else if (geometry.type === 'POLYGON') {
      return {
        type: 'POLYGON',
        coordinates: geometry.coordinates,
      };
    }
    throw new Error('Unsupported geometry type');
  }

  /**
   * Load site geofences into monitoring
   */
  async loadSiteGeofences(site) {
    const geofences = await this.prisma.geofence.findMany({
      where: {
        siteId: site.id,
        isActive: true,
      },
      include: {
        zones: {
          where: { isActive: true },
        },
      },
    });

    this.activeGeofences.set(site.id, geofences);
  }

  /**
   * Load geofence into monitoring
   */
  async loadGeofenceIntoMonitoring(geofence, zones) {
    const siteGeofences = this.activeGeofences.get(geofence.siteId) || [];
    siteGeofences.push({
      ...geofence,
      zones,
    });
    this.activeGeofences.set(geofence.siteId, siteGeofences);
  }

  /**
   * Update agent location tracking
   */
  updateAgentLocation(agentId, locationData) {
    this.agentLocations.set(agentId, {
      ...locationData,
      lastUpdate: new Date(),
    });
  }

  /**
   * Get agent zone state
   */
  getAgentZoneState(agentId, zoneId) {
    const agentData = this.agentLocations.get(agentId);
    return agentData?.zoneStates?.[zoneId];
  }

  /**
   * Update agent zone state
   */
  updateAgentZoneState(agentId, zoneId, state) {
    const agentData = this.agentLocations.get(agentId) || {};
    if (!agentData.zoneStates) {
      agentData.zoneStates = {};
    }
    agentData.zoneStates[zoneId] = state;
    this.agentLocations.set(agentId, agentData);
  }

  /**
   * Get agent's active shift
   */
  async getAgentActiveShift(agentId) {
    return await this.prisma.shift.findFirst({
      where: {
        agentId,
        status: 'IN_PROGRESS',
        startTime: { lte: new Date() },
        endTime: { gte: new Date() },
        deletedAt: null,
      },
      include: {
        agent: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
        site: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * Calculate violation severity
   */
  calculateViolationSeverity(zone, violationType) {
    if (zone.type === 'RESTRICTED') return 'CRITICAL';
    if (zone.priority === 'HIGH') return 'HIGH';
    if (violationType === 'UNAUTHORIZED_EXIT') return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get alert channels based on severity
   */
  getAlertChannels(severity) {
    switch (severity) {
      case 'CRITICAL':
        return ['PUSH', 'EMAIL', 'SMS'];
      case 'HIGH':
        return ['PUSH', 'EMAIL'];
      case 'MEDIUM':
        return ['PUSH'];
      default:
        return ['PUSH'];
    }
  }

  /**
   * Get alert priority based on severity
   */
  getAlertPriority(severity) {
    switch (severity) {
      case 'CRITICAL':
        return 'URGENT';
      case 'HIGH':
        return 'HIGH';
      default:
        return 'NORMAL';
    }
  }

  /**
   * Get security operations team
   */
  async getSecurityOperationsTeam() {
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPERVISOR'] },
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return users.map(u => u.id);
  }

  /**
   * Get management team
   */
  async getManagementTeam() {
    const users = await this.prisma.user.findMany({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return users.map(u => u.id);
  }
}

module.exports = DynamicGeofencingService;
