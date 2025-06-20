import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { notificationService } from './notificationService';
import { integrationService } from './integrationService';

const prisma = new PrismaClient();

export interface GeofenceZone {
  id: string;
  name: string;
  siteId: string;
  type: 'ENTRY' | 'EXIT' | 'RESTRICTED' | 'PATROL' | 'EMERGENCY';
  coordinates: GeoCoordinate[];
  radius?: number; // For circular zones
  isActive: boolean;
  rules: GeofenceRule[];
  metadata?: Record<string, any>;
}

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

export interface GeofenceRule {
  id: string;
  trigger: 'ENTER' | 'EXIT' | 'DWELL' | 'SPEED';
  conditions: Record<string, any>;
  actions: GeofenceAction[];
  isActive: boolean;
}

export interface GeofenceAction {
  type: 'NOTIFICATION' | 'ALERT' | 'LOG' | 'WEBHOOK' | 'AUTO_CHECKIN';
  parameters: Record<string, any>;
}

export interface LocationUpdate {
  agentId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
  speed?: number;
  heading?: number;
}

export interface GeofenceEvent {
  id: string;
  agentId: string;
  zoneId: string;
  eventType: 'ENTER' | 'EXIT' | 'DWELL' | 'VIOLATION';
  timestamp: Date;
  location: GeoCoordinate;
  metadata?: Record<string, any>;
}

export class GeofencingService extends EventEmitter {
  private static instance: GeofencingService;
  private zones: Map<string, GeofenceZone> = new Map();
  private agentLocations: Map<string, LocationUpdate> = new Map();
  private agentZoneHistory: Map<string, string[]> = new Map();

  private constructor() {
    super();
    this.initializeZones();
  }

  public static getInstance(): GeofencingService {
    if (!GeofencingService.instance) {
      GeofencingService.instance = new GeofencingService();
    }
    return GeofencingService.instance;
  }

  private async initializeZones() {
    try {
      // Load geofence zones from database
      const zones = await prisma.geofenceZone.findMany({
        where: { isActive: true },
        include: {
          rules: true,
        },
      });

      for (const zone of zones) {
        this.zones.set(zone.id, {
          id: zone.id,
          name: zone.name,
          siteId: zone.siteId,
          type: zone.type as any,
          coordinates: zone.coordinates as GeoCoordinate[],
          radius: zone.radius,
          isActive: zone.isActive,
          rules: zone.rules.map(rule => ({
            id: rule.id,
            trigger: rule.trigger as any,
            conditions: rule.conditions as Record<string, any>,
            actions: rule.actions as GeofenceAction[],
            isActive: rule.isActive,
          })),
          metadata: zone.metadata as Record<string, any>,
        });
      }

      console.log(`Initialized ${zones.length} geofence zones`);
    } catch (error) {
      console.error('Failed to initialize geofence zones:', error);
    }
  }

  // Location tracking
  public async updateAgentLocation(locationUpdate: LocationUpdate): Promise<void> {
    try {
      const { agentId, latitude, longitude, accuracy, timestamp, speed, heading } = locationUpdate;

      // Store location update
      await prisma.locationUpdate.create({
        data: {
          agentId,
          latitude,
          longitude,
          accuracy,
          timestamp,
          speed,
          heading,
        },
      });

      // Update in-memory location
      this.agentLocations.set(agentId, locationUpdate);

      // Check geofence violations
      await this.checkGeofenceViolations(agentId, { latitude, longitude });

      this.emit('location.updated', { agentId, location: { latitude, longitude } });
    } catch (error) {
      console.error('Failed to update agent location:', error);
      throw new Error('Failed to update agent location');
    }
  }

  private async checkGeofenceViolations(agentId: string, location: GeoCoordinate): Promise<void> {
    const currentZones = this.getZonesForLocation(location);
    const previousZones = this.agentZoneHistory.get(agentId) || [];

    // Check for zone entries
    for (const zone of currentZones) {
      if (!previousZones.includes(zone.id)) {
        await this.handleZoneEvent(agentId, zone, 'ENTER', location);
      }
    }

    // Check for zone exits
    for (const zoneId of previousZones) {
      if (!currentZones.find(z => z.id === zoneId)) {
        const zone = this.zones.get(zoneId);
        if (zone) {
          await this.handleZoneEvent(agentId, zone, 'EXIT', location);
        }
      }
    }

    // Update zone history
    this.agentZoneHistory.set(agentId, currentZones.map(z => z.id));

    // Check for dwell time violations
    await this.checkDwellTimeViolations(agentId, currentZones, location);

    // Check for speed violations
    await this.checkSpeedViolations(agentId, location);
  }

  private getZonesForLocation(location: GeoCoordinate): GeofenceZone[] {
    const zones: GeofenceZone[] = [];

    for (const zone of this.zones.values()) {
      if (this.isLocationInZone(location, zone)) {
        zones.push(zone);
      }
    }

    return zones;
  }

  private isLocationInZone(location: GeoCoordinate, zone: GeofenceZone): boolean {
    if (zone.radius) {
      // Circular zone
      const center = zone.coordinates[0];
      const distance = this.calculateDistance(location, center);
      return distance <= zone.radius;
    } else {
      // Polygon zone
      return this.isPointInPolygon(location, zone.coordinates);
    }
  }

  private calculateDistance(point1: GeoCoordinate, point2: GeoCoordinate): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = point1.latitude * Math.PI / 180;
    const φ2 = point2.latitude * Math.PI / 180;
    const Δφ = (point2.latitude - point1.latitude) * Math.PI / 180;
    const Δλ = (point2.longitude - point1.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private isPointInPolygon(point: GeoCoordinate, polygon: GeoCoordinate[]): boolean {
    let inside = false;
    const x = point.longitude;
    const y = point.latitude;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].longitude;
      const yi = polygon[i].latitude;
      const xj = polygon[j].longitude;
      const yj = polygon[j].latitude;

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  private async handleZoneEvent(
    agentId: string,
    zone: GeofenceZone,
    eventType: 'ENTER' | 'EXIT',
    location: GeoCoordinate
  ): Promise<void> {
    // Create geofence event
    const event: GeofenceEvent = {
      id: `${agentId}-${zone.id}-${Date.now()}`,
      agentId,
      zoneId: zone.id,
      eventType,
      timestamp: new Date(),
      location,
    };

    // Store event in database
    await prisma.geofenceEvent.create({
      data: {
        id: event.id,
        agentId: event.agentId,
        zoneId: event.zoneId,
        eventType: event.eventType,
        timestamp: event.timestamp,
        latitude: event.location.latitude,
        longitude: event.location.longitude,
        metadata: event.metadata,
      },
    });

    // Process zone rules
    for (const rule of zone.rules) {
      if (rule.isActive && rule.trigger === eventType) {
        await this.executeRuleActions(rule, event, zone);
      }
    }

    this.emit('geofence.event', event);
  }

  private async executeRuleActions(
    rule: GeofenceRule,
    event: GeofenceEvent,
    zone: GeofenceZone
  ): Promise<void> {
    for (const action of rule.actions) {
      try {
        switch (action.type) {
          case 'NOTIFICATION':
            await this.sendNotification(action, event, zone);
            break;
          case 'ALERT':
            await this.sendAlert(action, event, zone);
            break;
          case 'LOG':
            await this.logEvent(action, event, zone);
            break;
          case 'WEBHOOK':
            await this.sendWebhook(action, event, zone);
            break;
          case 'AUTO_CHECKIN':
            await this.performAutoCheckin(action, event, zone);
            break;
        }
      } catch (error) {
        console.error(`Failed to execute action ${action.type}:`, error);
      }
    }
  }

  private async sendNotification(
    action: GeofenceAction,
    event: GeofenceEvent,
    zone: GeofenceZone
  ): Promise<void> {
    const agent = await prisma.agent.findUnique({
      where: { id: event.agentId },
      include: { user: true },
    });

    if (!agent) return;

    await notificationService.sendNotification({
      type: 'SECURITY',
      priority: action.parameters.priority || 'MEDIUM',
      title: `Geofence ${event.eventType}`,
      message: `Agent ${agent.user.firstName} ${agent.user.lastName} ${event.eventType.toLowerCase()}ed zone ${zone.name}`,
      recipientId: action.parameters.recipientId,
      channels: action.parameters.channels || ['IN_APP'],
      metadata: {
        agentId: event.agentId,
        zoneId: event.zoneId,
        eventType: event.eventType,
        location: event.location,
      },
    });
  }

  private async sendAlert(
    action: GeofenceAction,
    event: GeofenceEvent,
    zone: GeofenceZone
  ): Promise<void> {
    // Send high-priority alert to supervisors
    await notificationService.sendBulkNotification({
      type: 'SECURITY',
      priority: 'URGENT',
      title: `Geofence Alert: ${zone.name}`,
      message: `Security alert triggered in zone ${zone.name}`,
      recipientRole: 'SUPERVISOR',
      channels: ['IN_APP', 'EMAIL', 'SMS'],
      metadata: {
        agentId: event.agentId,
        zoneId: event.zoneId,
        eventType: event.eventType,
        location: event.location,
      },
    });
  }

  private async logEvent(
    action: GeofenceAction,
    event: GeofenceEvent,
    zone: GeofenceZone
  ): Promise<void> {
    console.log(`Geofence event logged: ${JSON.stringify(event)}`);
    
    // Store in audit log
    await prisma.auditLog.create({
      data: {
        action: 'GEOFENCE_EVENT',
        entityType: 'GEOFENCE',
        entityId: zone.id,
        userId: event.agentId,
        details: {
          event,
          zone: { id: zone.id, name: zone.name, type: zone.type },
        },
        timestamp: new Date(),
      },
    });
  }

  private async sendWebhook(
    action: GeofenceAction,
    event: GeofenceEvent,
    zone: GeofenceZone
  ): Promise<void> {
    await integrationService.sendWebhook('GEOFENCE', 'zone.event', {
      event,
      zone: { id: zone.id, name: zone.name, type: zone.type },
      timestamp: new Date().toISOString(),
    });
  }

  private async performAutoCheckin(
    action: GeofenceAction,
    event: GeofenceEvent,
    zone: GeofenceZone
  ): Promise<void> {
    if (event.eventType === 'ENTER' && zone.type === 'PATROL') {
      // Auto check-in to patrol checkpoint
      await prisma.checkIn.create({
        data: {
          agentId: event.agentId,
          checkpointId: action.parameters.checkpointId,
          latitude: event.location.latitude,
          longitude: event.location.longitude,
          timestamp: event.timestamp,
          method: 'GEOFENCE',
          notes: `Auto check-in via geofence: ${zone.name}`,
        },
      });
    }
  }

  private async checkDwellTimeViolations(
    agentId: string,
    zones: GeofenceZone[],
    location: GeoCoordinate
  ): Promise<void> {
    for (const zone of zones) {
      const dwellRules = zone.rules.filter(r => r.trigger === 'DWELL' && r.isActive);
      
      for (const rule of dwellRules) {
        const maxDwellTime = rule.conditions.maxDwellTime || 3600; // 1 hour default
        const dwellTime = await this.calculateDwellTime(agentId, zone.id);
        
        if (dwellTime > maxDwellTime) {
          const event: GeofenceEvent = {
            id: `${agentId}-${zone.id}-dwell-${Date.now()}`,
            agentId,
            zoneId: zone.id,
            eventType: 'VIOLATION',
            timestamp: new Date(),
            location,
            metadata: { violationType: 'DWELL_TIME', dwellTime, maxDwellTime },
          };

          await this.executeRuleActions(rule, event, zone);
        }
      }
    }
  }

  private async checkSpeedViolations(agentId: string, location: GeoCoordinate): Promise<void> {
    const currentLocation = this.agentLocations.get(agentId);
    if (!currentLocation || !currentLocation.speed) return;

    const zones = this.getZonesForLocation(location);
    
    for (const zone of zones) {
      const speedRules = zone.rules.filter(r => r.trigger === 'SPEED' && r.isActive);
      
      for (const rule of speedRules) {
        const maxSpeed = rule.conditions.maxSpeed || 50; // km/h default
        
        if (currentLocation.speed > maxSpeed) {
          const event: GeofenceEvent = {
            id: `${agentId}-${zone.id}-speed-${Date.now()}`,
            agentId,
            zoneId: zone.id,
            eventType: 'VIOLATION',
            timestamp: new Date(),
            location,
            metadata: { violationType: 'SPEED', speed: currentLocation.speed, maxSpeed },
          };

          await this.executeRuleActions(rule, event, zone);
        }
      }
    }
  }

  private async calculateDwellTime(agentId: string, zoneId: string): Promise<number> {
    const recentEvents = await prisma.geofenceEvent.findMany({
      where: {
        agentId,
        zoneId,
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 2,
    });

    if (recentEvents.length < 2) return 0;

    const [latest, previous] = recentEvents;
    if (latest.eventType === 'ENTER' || previous.eventType === 'EXIT') {
      return (latest.timestamp.getTime() - previous.timestamp.getTime()) / 1000;
    }

    return 0;
  }

  // Zone management
  public async createZone(zone: Omit<GeofenceZone, 'id'>): Promise<string> {
    const zoneData = await prisma.geofenceZone.create({
      data: {
        name: zone.name,
        siteId: zone.siteId,
        type: zone.type,
        coordinates: zone.coordinates,
        radius: zone.radius,
        isActive: zone.isActive,
        metadata: zone.metadata,
      },
    });

    // Create rules
    for (const rule of zone.rules) {
      await prisma.geofenceRule.create({
        data: {
          zoneId: zoneData.id,
          trigger: rule.trigger,
          conditions: rule.conditions,
          actions: rule.actions,
          isActive: rule.isActive,
        },
      });
    }

    // Update in-memory cache
    this.zones.set(zoneData.id, { ...zone, id: zoneData.id });

    return zoneData.id;
  }

  public async updateZone(zoneId: string, updates: Partial<GeofenceZone>): Promise<void> {
    await prisma.geofenceZone.update({
      where: { id: zoneId },
      data: {
        name: updates.name,
        type: updates.type,
        coordinates: updates.coordinates,
        radius: updates.radius,
        isActive: updates.isActive,
        metadata: updates.metadata,
      },
    });

    // Update in-memory cache
    const existingZone = this.zones.get(zoneId);
    if (existingZone) {
      this.zones.set(zoneId, { ...existingZone, ...updates });
    }
  }

  public async deleteZone(zoneId: string): Promise<void> {
    await prisma.geofenceZone.update({
      where: { id: zoneId },
      data: { isActive: false },
    });

    this.zones.delete(zoneId);
  }

  // Analytics
  public async getZoneAnalytics(zoneId: string, dateRange: { start: Date; end: Date }): Promise<any> {
    const events = await prisma.geofenceEvent.findMany({
      where: {
        zoneId,
        timestamp: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      include: {
        agent: {
          include: { user: true },
        },
      },
    });

    const analytics = {
      totalEvents: events.length,
      uniqueAgents: new Set(events.map(e => e.agentId)).size,
      eventsByType: {} as Record<string, number>,
      eventsByAgent: {} as Record<string, number>,
      averageDwellTime: 0,
      violations: events.filter(e => e.eventType === 'VIOLATION').length,
    };

    // Calculate event statistics
    for (const event of events) {
      analytics.eventsByType[event.eventType] = (analytics.eventsByType[event.eventType] || 0) + 1;
      
      const agentName = `${event.agent.user.firstName} ${event.agent.user.lastName}`;
      analytics.eventsByAgent[agentName] = (analytics.eventsByAgent[agentName] || 0) + 1;
    }

    return analytics;
  }

  public async getAgentLocationHistory(
    agentId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<LocationUpdate[]> {
    const locations = await prisma.locationUpdate.findMany({
      where: {
        agentId,
        timestamp: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    return locations.map(loc => ({
      agentId: loc.agentId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      timestamp: loc.timestamp,
      speed: loc.speed,
      heading: loc.heading,
    }));
  }
}

export const geofencingService = GeofencingService.getInstance();
