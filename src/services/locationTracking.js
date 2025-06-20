const logger = require('../config/logger');
const GeofencingService = require('./geofencing');

/**
 * Real-time Location Tracking Service
 * Handles GPS tracking, real-time updates, and location analytics
 */
class LocationTrackingService {
  constructor(prisma, io) {
    this.prisma = prisma;
    this.io = io;
    this.geofencingService = new GeofencingService(prisma, io);
    this.activeTracking = new Map(); // Store active tracking sessions
  }

  /**
   * Start real-time location tracking for an agent
   */
  async startLocationTracking(agentId, shiftId, trackingOptions = {}) {
    try {
      const {
        updateInterval = 30, // seconds
        highAccuracy = true,
        enableGeofencing = true,
        enableBatteryOptimization = false
      } = trackingOptions;

      // Validate shift
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          site: true,
          agent: {
            include: { user: true }
          }
        }
      });

      if (!shift) {
        throw new Error('Shift not found');
      }

      if (shift.agentId !== agentId) {
        throw new Error('Agent not assigned to this shift');
      }

      // Create tracking session
      const trackingSession = {
        agentId,
        shiftId,
        siteId: shift.siteId,
        startTime: new Date(),
        updateInterval,
        highAccuracy,
        enableGeofencing,
        enableBatteryOptimization,
        lastUpdate: null,
        locationCount: 0,
        violations: []
      };

      this.activeTracking.set(agentId, trackingSession);

      // Create tracking record in database
      await this.prisma.locationTrackingSession.create({
        data: {
          agentId,
          shiftId,
          startTime: trackingSession.startTime,
          settings: {
            updateInterval,
            highAccuracy,
            enableGeofencing,
            enableBatteryOptimization
          },
          status: 'ACTIVE'
        }
      });

      // Emit tracking started event
      if (this.io) {
        this.io.to(`agent:${agentId}`).emit('location_tracking_started', {
          shiftId,
          settings: trackingOptions,
          message: 'Location tracking started'
        });

        this.io.to('role:supervisor').to('role:admin').emit('agent_tracking_started', {
          agentId,
          agentName: `${shift.agent.user.profile?.firstName || ''} ${shift.agent.user.profile?.lastName || ''}`.trim(),
          shiftId,
          siteId: shift.siteId,
          siteName: shift.site.name,
          startTime: trackingSession.startTime
        });
      }

      logger.info('Location tracking started', {
        agentId,
        shiftId,
        siteId: shift.siteId,
        settings: trackingOptions
      });

      return {
        success: true,
        trackingSession: {
          agentId,
          shiftId,
          startTime: trackingSession.startTime,
          settings: trackingOptions
        }
      };

    } catch (error) {
      logger.error('Failed to start location tracking:', error);
      throw error;
    }
  }

  /**
   * Update agent location
   */
  async updateLocation(agentId, locationData) {
    try {
      const {
        latitude,
        longitude,
        accuracy,
        altitude,
        speed,
        heading,
        timestamp = new Date(),
        batteryLevel,
        isBackground = false
      } = locationData;

      // Get active tracking session
      const trackingSession = this.activeTracking.get(agentId);
      if (!trackingSession) {
        throw new Error('No active tracking session found');
      }

      // Validate location data
      if (!this.isValidLocation(latitude, longitude)) {
        throw new Error('Invalid location coordinates');
      }

      // Check location accuracy threshold
      if (accuracy > 100 && trackingSession.highAccuracy) {
        logger.warn('Low accuracy location update', {
          agentId,
          accuracy,
          threshold: 100
        });
      }

      // Store location in database
      const locationRecord = await this.prisma.locationTracking.create({
        data: {
          agentId,
          shiftId: trackingSession.shiftId,
          coordinates: `POINT(${longitude} ${latitude})`,
          accuracy,
          altitude,
          speed,
          heading,
          timestamp: new Date(timestamp),
          batteryLevel,
          isBackground,
          metadata: {
            sessionId: trackingSession.agentId,
            updateCount: trackingSession.locationCount + 1
          }
        }
      });

      // Update tracking session
      trackingSession.lastUpdate = new Date();
      trackingSession.locationCount++;

      // Perform geofencing check if enabled
      let geofenceResult = null;
      if (trackingSession.enableGeofencing) {
        geofenceResult = await this.geofencingService.monitorAgentLocation(
          agentId,
          latitude,
          longitude,
          trackingSession.shiftId
        );

        if (geofenceResult.status === 'violation') {
          trackingSession.violations.push({
            timestamp: new Date(),
            distance: geofenceResult.distance,
            locationId: locationRecord.id
          });
        }
      }

      // Emit real-time location update
      if (this.io) {
        // Send to supervisors and admins
        this.io.to('role:supervisor').to('role:admin').emit('agent_location_update', {
          agentId,
          shiftId: trackingSession.shiftId,
          siteId: trackingSession.siteId,
          location: {
            latitude,
            longitude,
            accuracy,
            timestamp
          },
          geofenceStatus: geofenceResult?.status || 'unknown',
          batteryLevel
        });

        // Send acknowledgment to agent
        this.io.to(`agent:${agentId}`).emit('location_update_received', {
          locationId: locationRecord.id,
          timestamp: new Date(),
          geofenceStatus: geofenceResult?.status || 'unknown'
        });
      }

      // Check for location anomalies
      await this.checkLocationAnomalies(agentId, locationData, trackingSession);

      logger.debug('Location updated', {
        agentId,
        shiftId: trackingSession.shiftId,
        accuracy,
        geofenceStatus: geofenceResult?.status,
        updateCount: trackingSession.locationCount
      });

      return {
        success: true,
        locationId: locationRecord.id,
        geofenceResult,
        trackingSession: {
          updateCount: trackingSession.locationCount,
          lastUpdate: trackingSession.lastUpdate,
          violationCount: trackingSession.violations.length
        }
      };

    } catch (error) {
      logger.error('Failed to update location:', error);
      throw error;
    }
  }

  /**
   * Stop location tracking
   */
  async stopLocationTracking(agentId, reason = 'Manual stop') {
    try {
      const trackingSession = this.activeTracking.get(agentId);
      if (!trackingSession) {
        throw new Error('No active tracking session found');
      }

      const endTime = new Date();
      const duration = endTime - trackingSession.startTime;

      // Update tracking session in database
      await this.prisma.locationTrackingSession.updateMany({
        where: {
          agentId,
          status: 'ACTIVE'
        },
        data: {
          endTime,
          status: 'COMPLETED',
          summary: {
            duration: Math.round(duration / 1000), // seconds
            locationCount: trackingSession.locationCount,
            violationCount: trackingSession.violations.length,
            reason
          }
        }
      });

      // Remove from active tracking
      this.activeTracking.delete(agentId);

      // Emit tracking stopped event
      if (this.io) {
        this.io.to(`agent:${agentId}`).emit('location_tracking_stopped', {
          reason,
          summary: {
            duration: Math.round(duration / 1000),
            locationCount: trackingSession.locationCount,
            violationCount: trackingSession.violations.length
          }
        });

        this.io.to('role:supervisor').to('role:admin').emit('agent_tracking_stopped', {
          agentId,
          shiftId: trackingSession.shiftId,
          endTime,
          reason,
          summary: {
            duration: Math.round(duration / 1000),
            locationCount: trackingSession.locationCount,
            violationCount: trackingSession.violations.length
          }
        });
      }

      logger.info('Location tracking stopped', {
        agentId,
        shiftId: trackingSession.shiftId,
        duration: Math.round(duration / 1000),
        locationCount: trackingSession.locationCount,
        reason
      });

      return {
        success: true,
        summary: {
          duration: Math.round(duration / 1000),
          locationCount: trackingSession.locationCount,
          violationCount: trackingSession.violations.length,
          endTime
        }
      };

    } catch (error) {
      logger.error('Failed to stop location tracking:', error);
      throw error;
    }
  }

  /**
   * Get real-time agent locations
   */
  async getActiveAgentLocations(siteIds = [], includeOffline = false) {
    try {
      const whereClause = {
        status: 'ACTIVE'
      };

      if (siteIds.length > 0) {
        whereClause.shift = {
          siteId: { in: siteIds }
        };
      }

      const activeSessions = await this.prisma.locationTrackingSession.findMany({
        where: whereClause,
        include: {
          agent: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  profile: true
                }
              }
            }
          },
          shift: {
            include: {
              site: {
                select: {
                  id: true,
                  name: true,
                  coordinates: true
                }
              }
            }
          }
        }
      });

      const agentLocations = [];

      for (const session of activeSessions) {
        // Get latest location for each agent
        const latestLocation = await this.prisma.locationTracking.findFirst({
          where: {
            agentId: session.agentId,
            shiftId: session.shiftId
          },
          orderBy: { timestamp: 'desc' }
        });

        if (latestLocation || includeOffline) {
          const trackingSession = this.activeTracking.get(session.agentId);
          
          agentLocations.push({
            agentId: session.agentId,
            agentName: `${session.agent.user.profile?.firstName || ''} ${session.agent.user.profile?.lastName || ''}`.trim(),
            shiftId: session.shiftId,
            site: session.shift.site,
            location: latestLocation ? {
              latitude: this.extractLatitude(latestLocation.coordinates),
              longitude: this.extractLongitude(latestLocation.coordinates),
              accuracy: latestLocation.accuracy,
              timestamp: latestLocation.timestamp,
              batteryLevel: latestLocation.batteryLevel
            } : null,
            trackingStatus: latestLocation ? 'active' : 'offline',
            lastUpdate: trackingSession?.lastUpdate || session.startTime,
            violationCount: trackingSession?.violations.length || 0
          });
        }
      }

      return {
        success: true,
        agentCount: agentLocations.length,
        agents: agentLocations,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to get active agent locations:', error);
      throw error;
    }
  }

  // Helper methods

  isValidLocation(latitude, longitude) {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180
    );
  }

  extractLatitude(coordinates) {
    const match = coordinates.match(/POINT\(([^)]+)\)/);
    if (match) {
      const [, lat] = match[1].split(' ').map(Number);
      return lat;
    }
    return null;
  }

  extractLongitude(coordinates) {
    const match = coordinates.match(/POINT\(([^)]+)\)/);
    if (match) {
      const [lng] = match[1].split(' ').map(Number);
      return lng;
    }
    return null;
  }

  async checkLocationAnomalies(agentId, locationData, trackingSession) {
    try {
      // Check for impossible speed (teleportation detection)
      if (trackingSession.lastLocation) {
        const distance = this.calculateDistance(
          trackingSession.lastLocation,
          locationData
        );
        const timeDiff = (new Date(locationData.timestamp) - trackingSession.lastLocation.timestamp) / 1000;
        const speed = distance / timeDiff; // m/s

        if (speed > 50) { // 180 km/h threshold
          logger.warn('Possible location anomaly detected', {
            agentId,
            speed: speed * 3.6, // km/h
            distance,
            timeDiff
          });

          // Create anomaly alert
          await this.createAnomalyAlert(agentId, 'IMPOSSIBLE_SPEED', {
            speed: speed * 3.6,
            distance,
            timeDiff
          });
        }
      }

      trackingSession.lastLocation = locationData;
    } catch (error) {
      logger.error('Failed to check location anomalies:', error);
    }
  }

  calculateDistance(loc1, loc2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = loc1.latitude * Math.PI / 180;
    const φ2 = loc2.latitude * Math.PI / 180;
    const Δφ = (loc2.latitude - loc1.latitude) * Math.PI / 180;
    const Δλ = (loc2.longitude - loc1.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  async createAnomalyAlert(agentId, type, data) {
    try {
      await this.prisma.notification.create({
        data: {
          recipientId: null, // System notification
          type: 'ALERT',
          title: 'Location Anomaly Detected',
          message: `Unusual location pattern detected for agent ${agentId}`,
          data: {
            agentId,
            anomalyType: type,
            ...data,
            timestamp: new Date()
          },
          channels: ['SYSTEM'],
          status: 'PENDING'
        }
      });
    } catch (error) {
      logger.error('Failed to create anomaly alert:', error);
    }
  }
}

module.exports = LocationTrackingService;
