const geolib = require('geolib');
const logger = require('../config/logger');

/**
 * Advanced geofencing service with real-time validation
 */
class GeofencingService {
  constructor(prisma, io) {
    this.prisma = prisma;
    this.io = io;
  }

  /**
   * Check if a location is within a site's geofence
   */
  async isWithinGeofence(latitude, longitude, siteId) {
    try {
      const site = await this.prisma.site.findUnique({
        where: { id: siteId, deletedAt: null },
        select: {
          id: true,
          name: true,
          coordinates: true,
          geofenceRadius: true,
          geofenceCoordinates: true,
        },
      });

      if (!site) {
        throw new Error('Site not found');
      }

      // Extract site center coordinates from PostGIS POINT
      const coordMatch = site.coordinates.match(/POINT\(([^)]+)\)/);
      if (!coordMatch) {
        throw new Error('Invalid site coordinates');
      }

      const [siteLongitude, siteLatitude] = coordMatch[1].split(' ').map(Number);

      // Check circular geofence (primary method)
      const distance = geolib.getDistance(
        { latitude, longitude },
        { latitude: siteLatitude, longitude: siteLongitude }
      );

      const isWithinCircular = distance <= site.geofenceRadius;

      // Check polygon geofence if defined (advanced geofencing)
      let isWithinPolygon = true;
      if (site.geofenceCoordinates) {
        isWithinPolygon = this.isPointInPolygon(
          { latitude, longitude },
          site.geofenceCoordinates
        );
      }

      const isWithin = isWithinCircular && isWithinPolygon;

      return {
        isWithin,
        distance,
        siteId: site.id,
        siteName: site.name,
        geofenceRadius: site.geofenceRadius,
        details: {
          circularCheck: isWithinCircular,
          polygonCheck: isWithinPolygon,
        },
      };
    } catch (error) {
      logger.error('Geofence validation error:', {
        error: error.message,
        latitude,
        longitude,
        siteId,
      });
      throw error;
    }
  }

  /**
   * Check if point is within polygon geofence
   */
  isPointInPolygon(point, polygonCoordinates) {
    try {
      // Parse PostGIS POLYGON format
      const polygonMatch = polygonCoordinates.match(/POLYGON\(\(([^)]+)\)\)/);
      if (!polygonMatch) {
        return true; // Default to true if polygon is invalid
      }

      const coordinates = polygonMatch[1]
        .split(',')
        .map(coord => {
          const [lng, lat] = coord.trim().split(' ').map(Number);
          return { latitude: lat, longitude: lng };
        });

      return geolib.isPointInPolygon(point, coordinates);
    } catch (error) {
      logger.error('Polygon geofence check error:', error);
      return true; // Default to true on error
    }
  }

  /**
   * Monitor agent location for geofence violations
   */
  async monitorAgentLocation(agentId, latitude, longitude, shiftId = null) {
    try {
      // Get agent's current shift if not provided
      let currentShift = null;
      if (shiftId) {
        currentShift = await this.prisma.shift.findUnique({
          where: { id: shiftId },
          include: { site: true },
        });
      } else {
        // Find active shift for agent
        const now = new Date();
        currentShift = await this.prisma.shift.findFirst({
          where: {
            agentId,
            status: 'IN_PROGRESS',
            startTime: { lte: now },
            endTime: { gte: now },
            deletedAt: null,
          },
          include: { site: true },
        });
      }

      if (!currentShift) {
        return { status: 'no_active_shift' };
      }

      // Check geofence compliance
      const geofenceResult = await this.isWithinGeofence(
        latitude,
        longitude,
        currentShift.siteId
      );

      // Record geofence event
      await this.recordGeofenceEvent(
        agentId,
        currentShift.id,
        currentShift.siteId,
        latitude,
        longitude,
        geofenceResult.isWithin,
        geofenceResult.distance
      );

      // Handle geofence violations
      if (!geofenceResult.isWithin) {
        await this.handleGeofenceViolation(
          agentId,
          currentShift,
          geofenceResult
        );
      }

      return {
        status: geofenceResult.isWithin ? 'compliant' : 'violation',
        ...geofenceResult,
        shift: {
          id: currentShift.id,
          site: currentShift.site.name,
        },
      };
    } catch (error) {
      logger.error('Agent location monitoring error:', {
        error: error.message,
        agentId,
        latitude,
        longitude,
        shiftId,
      });
      throw error;
    }
  }

  /**
   * Record geofence event for audit and analytics
   */
  async recordGeofenceEvent(agentId, shiftId, siteId, latitude, longitude, isCompliant, distance) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: null, // System generated
          action: 'geofence_check',
          tableName: 'location_tracking',
          recordId: agentId,
          newValues: {
            agentId,
            shiftId,
            siteId,
            latitude,
            longitude,
            isCompliant,
            distance,
            timestamp: new Date(),
          },
          ipAddress: null,
          userAgent: 'geofencing_service',
        },
      });
    } catch (error) {
      logger.error('Failed to record geofence event:', error);
    }
  }

  /**
   * Handle geofence violations
   */
  async handleGeofenceViolation(agentId, shift, geofenceResult) {
    try {
      // Create violation notification
      const notification = await this.prisma.notification.create({
        data: {
          recipientId: shift.supervisorId || agentId,
          type: 'WARNING',
          title: 'Geofence Violation',
          message: `Agent is outside the designated area for ${shift.site.name}. Distance: ${geofenceResult.distance}m`,
          data: {
            agentId,
            shiftId: shift.id,
            siteId: shift.siteId,
            siteName: shift.site.name,
            distance: geofenceResult.distance,
            violationType: 'geofence_exit',
            timestamp: new Date(),
          },
          channels: ['PUSH', 'EMAIL'],
          status: 'PENDING',
        },
      });

      // Emit real-time alert to supervisors
      if (this.io) {
        this.io.to('role:supervisor').to('role:admin').emit('geofence_violation', {
          agentId,
          shiftId: shift.id,
          siteId: shift.siteId,
          siteName: shift.site.name,
          distance: geofenceResult.distance,
          timestamp: new Date(),
          notificationId: notification.id,
        });
      }

      logger.security('Geofence violation detected', {
        agentId,
        shiftId: shift.id,
        siteId: shift.siteId,
        distance: geofenceResult.distance,
      });
    } catch (error) {
      logger.error('Failed to handle geofence violation:', error);
    }
  }

  /**
   * Create custom geofence for a site
   */
  async createCustomGeofence(siteId, coordinates, userId) {
    try {
      // Validate coordinates array
      if (!Array.isArray(coordinates) || coordinates.length < 3) {
        throw new Error('At least 3 coordinates required for polygon geofence');
      }

      // Convert coordinates to PostGIS POLYGON format
      const polygonCoords = coordinates
        .map(coord => `${coord.longitude} ${coord.latitude}`)
        .join(',');
      
      // Close the polygon by adding the first point at the end
      const firstCoord = coordinates[0];
      const polygonString = `POLYGON((${polygonCoords},${firstCoord.longitude} ${firstCoord.latitude}))`;

      // Update site with custom geofence
      const updatedSite = await this.prisma.site.update({
        where: { id: siteId },
        data: {
          geofenceCoordinates: polygonString,
        },
      });

      logger.audit('custom_geofence_created', {
        createdBy: userId,
        siteId,
        coordinateCount: coordinates.length,
      });

      return {
        siteId,
        geofenceCoordinates: polygonString,
        coordinateCount: coordinates.length,
      };
    } catch (error) {
      logger.error('Failed to create custom geofence:', error);
      throw error;
    }
  }

  /**
   * Get geofence analytics for a site
   */
  async getGeofenceAnalytics(siteId, startDate, endDate) {
    try {
      // Get all location tracking data for the site within date range
      const locationData = await this.prisma.locationTracking.findMany({
        where: {
          shift: {
            siteId,
          },
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
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
          shift: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
            },
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      // Get site details
      const site = await this.prisma.site.findUnique({
        where: { id: siteId },
        select: {
          id: true,
          name: true,
          coordinates: true,
          geofenceRadius: true,
          geofenceCoordinates: true,
        },
      });

      // Analyze compliance for each location point
      const analytics = {
        totalPoints: locationData.length,
        compliantPoints: 0,
        violationPoints: 0,
        violations: [],
        agentCompliance: {},
        timeAnalysis: {
          hourlyViolations: Array(24).fill(0),
          dailyViolations: {},
        },
      };

      for (const location of locationData) {
        // Extract coordinates
        const coordMatch = location.coordinates.match(/POINT\(([^)]+)\)/);
        if (!coordMatch) continue;

        const [longitude, latitude] = coordMatch[1].split(' ').map(Number);

        // Check compliance
        const compliance = await this.isWithinGeofence(latitude, longitude, siteId);
        
        if (compliance.isWithin) {
          analytics.compliantPoints++;
        } else {
          analytics.violationPoints++;
          
          // Record violation details
          analytics.violations.push({
            agentId: location.agentId,
            agentName: location.agent.user.profile?.firstName + ' ' + location.agent.user.profile?.lastName,
            timestamp: location.timestamp,
            distance: compliance.distance,
            shiftId: location.shiftId,
          });

          // Update hourly analysis
          const hour = location.timestamp.getHours();
          analytics.timeAnalysis.hourlyViolations[hour]++;

          // Update daily analysis
          const date = location.timestamp.toISOString().split('T')[0];
          analytics.timeAnalysis.dailyViolations[date] = 
            (analytics.timeAnalysis.dailyViolations[date] || 0) + 1;
        }

        // Update agent compliance tracking
        const agentId = location.agentId;
        if (!analytics.agentCompliance[agentId]) {
          analytics.agentCompliance[agentId] = {
            agentName: location.agent.user.profile?.firstName + ' ' + location.agent.user.profile?.lastName,
            totalPoints: 0,
            compliantPoints: 0,
            violationPoints: 0,
          };
        }

        analytics.agentCompliance[agentId].totalPoints++;
        if (compliance.isWithin) {
          analytics.agentCompliance[agentId].compliantPoints++;
        } else {
          analytics.agentCompliance[agentId].violationPoints++;
        }
      }

      // Calculate compliance percentages
      analytics.complianceRate = analytics.totalPoints > 0 ? 
        (analytics.compliantPoints / analytics.totalPoints * 100).toFixed(2) : 0;

      // Calculate agent compliance rates
      Object.keys(analytics.agentCompliance).forEach(agentId => {
        const agent = analytics.agentCompliance[agentId];
        agent.complianceRate = agent.totalPoints > 0 ? 
          (agent.compliantPoints / agent.totalPoints * 100).toFixed(2) : 0;
      });

      return {
        site: {
          id: site.id,
          name: site.name,
        },
        period: {
          startDate,
          endDate,
        },
        analytics,
      };
    } catch (error) {
      logger.error('Failed to get geofence analytics:', error);
      throw error;
    }
  }
}

module.exports = GeofencingService;
