const geolib = require('geolib');
const logger = require('../config/logger');
const GeofencingService = require('./geofencing');

/**
 * Real-time location monitoring and alert service
 */
class RealTimeMonitoringService {
  constructor(prisma, io) {
    this.prisma = prisma;
    this.io = io;
    this.geofencingService = new GeofencingService(prisma, io);
    this.activeMonitoring = new Map(); // agentId -> monitoring data
    this.alertThresholds = {
      stationaryTime: 30 * 60 * 1000, // 30 minutes
      speedLimit: 50, // km/h
      batteryLow: 20, // percentage
      accuracyPoor: 100, // meters
    };
  }

  /**
   * Start monitoring an agent
   */
  async startMonitoring(agentId, shiftId) {
    try {
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          site: true,
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
        },
      });

      if (!shift) {
        throw new Error('Shift not found');
      }

      const monitoringData = {
        agentId,
        shiftId,
        siteId: shift.siteId,
        startTime: new Date(),
        lastLocation: null,
        lastUpdate: null,
        alerts: [],
        status: 'active',
        metrics: {
          totalDistance: 0,
          averageSpeed: 0,
          stationaryTime: 0,
          geofenceViolations: 0,
          lastMovement: new Date(),
        },
      };

      this.activeMonitoring.set(agentId, monitoringData);

      logger.info('Started real-time monitoring', {
        agentId,
        shiftId,
        siteId: shift.siteId,
      });

      // Emit monitoring started event
      this.io.to('role:supervisor').to('role:admin').emit('monitoring_started', {
        agentId,
        agent: shift.agent,
        shift: {
          id: shiftId,
          site: shift.site,
        },
        startTime: monitoringData.startTime,
      });

      return monitoringData;
    } catch (error) {
      logger.error('Failed to start monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring an agent
   */
  async stopMonitoring(agentId) {
    const monitoringData = this.activeMonitoring.get(agentId);
    
    if (monitoringData) {
      monitoringData.status = 'stopped';
      monitoringData.endTime = new Date();
      
      // Generate monitoring summary
      const summary = await this.generateMonitoringSummary(monitoringData);
      
      this.activeMonitoring.delete(agentId);

      logger.info('Stopped real-time monitoring', {
        agentId,
        duration: monitoringData.endTime - monitoringData.startTime,
        totalAlerts: monitoringData.alerts.length,
      });

      // Emit monitoring stopped event
      this.io.to('role:supervisor').to('role:admin').emit('monitoring_stopped', {
        agentId,
        summary,
        endTime: monitoringData.endTime,
      });

      return summary;
    }

    return null;
  }

  /**
   * Process real-time location update
   */
  async processLocationUpdate(agentId, locationData) {
    const monitoringData = this.activeMonitoring.get(agentId);
    
    if (!monitoringData || monitoringData.status !== 'active') {
      return null;
    }

    try {
      const { latitude, longitude, accuracy, speed, timestamp, batteryLevel } = locationData;
      const currentTime = new Date(timestamp);

      // Update monitoring data
      const previousLocation = monitoringData.lastLocation;
      monitoringData.lastLocation = { latitude, longitude, accuracy, speed, timestamp: currentTime };
      monitoringData.lastUpdate = currentTime;

      // Calculate metrics if we have a previous location
      if (previousLocation) {
        await this.updateMetrics(monitoringData, previousLocation, locationData);
      }

      // Check for various alert conditions
      const alerts = await this.checkAlertConditions(monitoringData, locationData);
      
      // Add new alerts
      alerts.forEach(alert => {
        monitoringData.alerts.push({
          ...alert,
          timestamp: currentTime,
          id: `${agentId}-${Date.now()}`,
        });
      });

      // Emit real-time updates
      this.emitLocationUpdate(agentId, monitoringData, locationData, alerts);

      // Process alerts
      if (alerts.length > 0) {
        await this.processAlerts(agentId, alerts);
      }

      return {
        status: 'processed',
        alerts: alerts.length,
        metrics: monitoringData.metrics,
      };
    } catch (error) {
      logger.error('Failed to process location update:', error);
      throw error;
    }
  }

  /**
   * Update monitoring metrics
   */
  async updateMetrics(monitoringData, previousLocation, currentLocation) {
    const { latitude, longitude, speed, timestamp } = currentLocation;
    const timeDiff = (new Date(timestamp) - new Date(previousLocation.timestamp)) / 1000; // seconds

    // Calculate distance
    const distance = geolib.getDistance(
      { latitude: previousLocation.latitude, longitude: previousLocation.longitude },
      { latitude, longitude }
    );

    monitoringData.metrics.totalDistance += distance;

    // Calculate speed if not provided
    let calculatedSpeed = speed;
    if (!calculatedSpeed && timeDiff > 0) {
      calculatedSpeed = (distance / timeDiff) * 3.6; // Convert m/s to km/h
    }

    // Update average speed
    if (calculatedSpeed > 0) {
      const currentAvg = monitoringData.metrics.averageSpeed;
      monitoringData.metrics.averageSpeed = currentAvg === 0 ? 
        calculatedSpeed : (currentAvg + calculatedSpeed) / 2;
    }

    // Check for movement
    if (calculatedSpeed > 1) { // Moving if speed > 1 km/h
      monitoringData.metrics.lastMovement = new Date(timestamp);
    } else {
      // Calculate stationary time
      const stationaryDuration = new Date(timestamp) - monitoringData.metrics.lastMovement;
      monitoringData.metrics.stationaryTime = Math.max(
        monitoringData.metrics.stationaryTime,
        stationaryDuration
      );
    }
  }

  /**
   * Check for alert conditions
   */
  async checkAlertConditions(monitoringData, locationData) {
    const alerts = [];
    const { latitude, longitude, accuracy, speed, batteryLevel, timestamp } = locationData;

    // 1. Geofence violation check
    try {
      const geofenceResult = await this.geofencingService.isWithinGeofence(
        latitude,
        longitude,
        monitoringData.siteId
      );

      if (!geofenceResult.isWithin) {
        monitoringData.metrics.geofenceViolations++;
        alerts.push({
          type: 'geofence_violation',
          severity: 'high',
          message: `Agent is outside designated area (${geofenceResult.distance}m away)`,
          data: {
            distance: geofenceResult.distance,
            siteId: monitoringData.siteId,
          },
        });
      }
    } catch (error) {
      logger.error('Geofence check failed:', error);
    }

    // 2. Stationary alert
    const stationaryDuration = new Date(timestamp) - monitoringData.metrics.lastMovement;
    if (stationaryDuration > this.alertThresholds.stationaryTime) {
      alerts.push({
        type: 'stationary_alert',
        severity: 'medium',
        message: `Agent has been stationary for ${Math.round(stationaryDuration / 60000)} minutes`,
        data: {
          duration: stationaryDuration,
          location: { latitude, longitude },
        },
      });
    }

    // 3. Speed alert
    if (speed && speed > this.alertThresholds.speedLimit) {
      alerts.push({
        type: 'speed_alert',
        severity: 'medium',
        message: `Agent speed exceeds limit: ${speed.toFixed(1)} km/h`,
        data: {
          speed,
          limit: this.alertThresholds.speedLimit,
        },
      });
    }

    // 4. Low battery alert
    if (batteryLevel && batteryLevel < this.alertThresholds.batteryLow) {
      alerts.push({
        type: 'low_battery',
        severity: 'medium',
        message: `Agent device battery is low: ${batteryLevel}%`,
        data: {
          batteryLevel,
          threshold: this.alertThresholds.batteryLow,
        },
      });
    }

    // 5. Poor accuracy alert
    if (accuracy && accuracy > this.alertThresholds.accuracyPoor) {
      alerts.push({
        type: 'poor_accuracy',
        severity: 'low',
        message: `GPS accuracy is poor: ${accuracy}m`,
        data: {
          accuracy,
          threshold: this.alertThresholds.accuracyPoor,
        },
      });
    }

    // 6. Device offline alert (if no update for 10 minutes)
    const lastUpdate = monitoringData.lastUpdate;
    if (lastUpdate && (new Date(timestamp) - lastUpdate) > 10 * 60 * 1000) {
      alerts.push({
        type: 'device_offline',
        severity: 'high',
        message: 'Agent device appears to be offline',
        data: {
          lastUpdate,
          duration: new Date(timestamp) - lastUpdate,
        },
      });
    }

    return alerts;
  }

  /**
   * Emit real-time location update
   */
  emitLocationUpdate(agentId, monitoringData, locationData, alerts) {
    const updateData = {
      agentId,
      location: {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        accuracy: locationData.accuracy,
        speed: locationData.speed,
        timestamp: locationData.timestamp,
        batteryLevel: locationData.batteryLevel,
      },
      metrics: monitoringData.metrics,
      alerts: alerts.map(alert => ({
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
      })),
      shiftId: monitoringData.shiftId,
      siteId: monitoringData.siteId,
    };

    // Emit to supervisors and admins
    this.io.to('role:supervisor').to('role:admin').emit('real_time_location_update', updateData);

    // Emit to the agent themselves
    this.io.to(`user:${agentId}`).emit('location_status_update', {
      status: alerts.length > 0 ? 'alert' : 'normal',
      alerts: alerts.map(alert => alert.message),
      metrics: monitoringData.metrics,
    });
  }

  /**
   * Process and store alerts
   */
  async processAlerts(agentId, alerts) {
    for (const alert of alerts) {
      try {
        // Create notification for high severity alerts
        if (alert.severity === 'high') {
          await this.prisma.notification.create({
            data: {
              recipientId: agentId, // Will be updated to notify supervisors
              type: 'WARNING',
              title: `Real-time Alert: ${alert.type}`,
              message: alert.message,
              data: {
                agentId,
                alertType: alert.type,
                severity: alert.severity,
                ...alert.data,
              },
              channels: ['PUSH', 'EMAIL'],
              status: 'PENDING',
            },
          });
        }

        // Log security alerts
        if (alert.type === 'geofence_violation' || alert.type === 'device_offline') {
          logger.security('Real-time security alert', {
            agentId,
            alertType: alert.type,
            severity: alert.severity,
            data: alert.data,
          });
        }
      } catch (error) {
        logger.error('Failed to process alert:', error);
      }
    }
  }

  /**
   * Generate monitoring summary
   */
  async generateMonitoringSummary(monitoringData) {
    const duration = (monitoringData.endTime - monitoringData.startTime) / 1000 / 60; // minutes
    
    return {
      agentId: monitoringData.agentId,
      shiftId: monitoringData.shiftId,
      siteId: monitoringData.siteId,
      duration: Math.round(duration),
      metrics: {
        ...monitoringData.metrics,
        totalDistance: Math.round(monitoringData.metrics.totalDistance),
        averageSpeed: Math.round(monitoringData.metrics.averageSpeed * 100) / 100,
        stationaryTime: Math.round(monitoringData.metrics.stationaryTime / 60000), // minutes
      },
      alerts: {
        total: monitoringData.alerts.length,
        byType: this.groupAlertsByType(monitoringData.alerts),
        bySeverity: this.groupAlertsBySeverity(monitoringData.alerts),
      },
      startTime: monitoringData.startTime,
      endTime: monitoringData.endTime,
    };
  }

  /**
   * Get current monitoring status
   */
  getMonitoringStatus() {
    const status = {};
    
    for (const [agentId, data] of this.activeMonitoring.entries()) {
      status[agentId] = {
        agentId,
        shiftId: data.shiftId,
        siteId: data.siteId,
        status: data.status,
        startTime: data.startTime,
        lastUpdate: data.lastUpdate,
        alertCount: data.alerts.length,
        metrics: data.metrics,
      };
    }

    return {
      activeAgents: this.activeMonitoring.size,
      agents: status,
    };
  }

  // Helper methods
  groupAlertsByType(alerts) {
    return alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {});
  }

  groupAlertsBySeverity(alerts) {
    return alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {});
  }
}

module.exports = RealTimeMonitoringService;
