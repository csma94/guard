const geolib = require('geolib');
const logger = require('../config/logger');

/**
 * Advanced location analytics and route optimization service
 */
class LocationAnalyticsService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Calculate patrol route efficiency for an agent
   */
  async calculatePatrolEfficiency(agentId, shiftId) {
    try {
      // Get all location points for the shift
      const locations = await this.prisma.locationTracking.findMany({
        where: {
          agentId,
          shiftId,
        },
        orderBy: { timestamp: 'asc' },
      });

      if (locations.length < 2) {
        return {
          efficiency: 0,
          totalDistance: 0,
          averageSpeed: 0,
          stationaryTime: 0,
          message: 'Insufficient location data',
        };
      }

      // Get shift details
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          site: {
            select: {
              id: true,
              name: true,
              coordinates: true,
            },
          },
        },
      });

      // Convert locations to coordinate pairs
      const coordinates = locations.map(location => {
        const coordMatch = location.coordinates.match(/POINT\(([^)]+)\)/);
        const [longitude, latitude] = coordMatch[1].split(' ').map(Number);
        return {
          latitude,
          longitude,
          timestamp: location.timestamp,
          speed: location.speed || 0,
        };
      });

      // Calculate total distance traveled
      let totalDistance = 0;
      let totalTime = 0;
      let stationaryTime = 0;
      const speeds = [];

      for (let i = 1; i < coordinates.length; i++) {
        const prev = coordinates[i - 1];
        const curr = coordinates[i];

        // Calculate distance between points
        const distance = geolib.getDistance(prev, curr);
        totalDistance += distance;

        // Calculate time difference
        const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // seconds
        totalTime += timeDiff;

        // Calculate speed if not provided
        let speed = curr.speed;
        if (!speed && timeDiff > 0) {
          speed = (distance / timeDiff) * 3.6; // Convert m/s to km/h
        }

        if (speed !== null) {
          speeds.push(speed);
        }

        // Detect stationary periods (speed < 0.5 km/h for > 5 minutes)
        if (speed < 0.5 && timeDiff > 300) {
          stationaryTime += timeDiff;
        }
      }

      // Calculate metrics
      const averageSpeed = speeds.length > 0 ? 
        speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length : 0;

      // Calculate efficiency based on coverage and movement patterns
      const siteCenter = this.extractCoordinates(shift.site.coordinates);
      const maxDistanceFromCenter = Math.max(...coordinates.map(coord => 
        geolib.getDistance(siteCenter, coord)
      ));

      // Efficiency factors
      const movementEfficiency = totalDistance > 0 ? Math.min(100, (totalDistance / 1000) * 10) : 0;
      const speedEfficiency = Math.min(100, averageSpeed * 20);
      const coverageEfficiency = Math.min(100, maxDistanceFromCenter / 10);
      const timeEfficiency = totalTime > 0 ? Math.max(0, 100 - (stationaryTime / totalTime * 100)) : 0;

      const overallEfficiency = (
        movementEfficiency * 0.3 +
        speedEfficiency * 0.2 +
        coverageEfficiency * 0.3 +
        timeEfficiency * 0.2
      );

      return {
        efficiency: Math.round(overallEfficiency),
        totalDistance: Math.round(totalDistance),
        averageSpeed: Math.round(averageSpeed * 100) / 100,
        stationaryTime: Math.round(stationaryTime / 60), // minutes
        totalTime: Math.round(totalTime / 60), // minutes
        locationPoints: coordinates.length,
        coverageRadius: Math.round(maxDistanceFromCenter),
        metrics: {
          movementEfficiency: Math.round(movementEfficiency),
          speedEfficiency: Math.round(speedEfficiency),
          coverageEfficiency: Math.round(coverageEfficiency),
          timeEfficiency: Math.round(timeEfficiency),
        },
      };
    } catch (error) {
      logger.error('Failed to calculate patrol efficiency:', error);
      throw error;
    }
  }

  /**
   * Generate optimal patrol route for a site
   */
  async generateOptimalRoute(siteId, patrolPoints = []) {
    try {
      const site = await this.prisma.site.findUnique({
        where: { id: siteId },
        select: {
          id: true,
          name: true,
          coordinates: true,
          geofenceRadius: true,
          equipmentList: true,
        },
      });

      if (!site) {
        throw new Error('Site not found');
      }

      const siteCenter = this.extractCoordinates(site.coordinates);

      // If no patrol points provided, generate default points based on site
      if (patrolPoints.length === 0) {
        patrolPoints = this.generateDefaultPatrolPoints(siteCenter, site.geofenceRadius);
      }

      // Add site center as starting/ending point
      const allPoints = [siteCenter, ...patrolPoints, siteCenter];

      // Calculate optimal route using nearest neighbor algorithm
      const optimizedRoute = this.optimizeRoute(allPoints);

      // Calculate route metrics
      const routeMetrics = this.calculateRouteMetrics(optimizedRoute);

      // Generate turn-by-turn directions
      const directions = this.generateDirections(optimizedRoute);

      return {
        siteId,
        siteName: site.name,
        route: optimizedRoute,
        metrics: routeMetrics,
        directions,
        estimatedDuration: Math.ceil(routeMetrics.totalDistance / 50), // minutes at 3 km/h
      };
    } catch (error) {
      logger.error('Failed to generate optimal route:', error);
      throw error;
    }
  }

  /**
   * Analyze agent movement patterns
   */
  async analyzeMovementPatterns(agentId, startDate, endDate) {
    try {
      const locations = await this.prisma.locationTracking.findMany({
        where: {
          agentId,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          shift: {
            include: {
              site: {
                select: {
                  id: true,
                  name: true,
                  coordinates: true,
                },
              },
            },
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      if (locations.length === 0) {
        return {
          message: 'No location data found for the specified period',
          patterns: {},
        };
      }

      // Group by shift
      const shiftGroups = {};
      locations.forEach(location => {
        const shiftId = location.shiftId;
        if (!shiftGroups[shiftId]) {
          shiftGroups[shiftId] = {
            shift: location.shift,
            locations: [],
          };
        }
        shiftGroups[shiftId].locations.push(location);
      });

      // Analyze patterns for each shift
      const patterns = {};
      for (const [shiftId, group] of Object.entries(shiftGroups)) {
        patterns[shiftId] = await this.analyzeShiftPatterns(group);
      }

      // Calculate overall patterns
      const overallPatterns = this.calculateOverallPatterns(patterns);

      return {
        agentId,
        period: { startDate, endDate },
        shiftPatterns: patterns,
        overallPatterns,
        totalShifts: Object.keys(patterns).length,
        totalLocationPoints: locations.length,
      };
    } catch (error) {
      logger.error('Failed to analyze movement patterns:', error);
      throw error;
    }
  }

  /**
   * Detect anomalies in agent location data
   */
  async detectLocationAnomalies(agentId, shiftId) {
    try {
      const locations = await this.prisma.locationTracking.findMany({
        where: { agentId, shiftId },
        orderBy: { timestamp: 'asc' },
      });

      const anomalies = [];

      for (let i = 1; i < locations.length; i++) {
        const prev = locations[i - 1];
        const curr = locations[i];

        // Extract coordinates
        const prevCoords = this.extractCoordinates(prev.coordinates);
        const currCoords = this.extractCoordinates(curr.coordinates);

        // Calculate distance and time
        const distance = geolib.getDistance(prevCoords, currCoords);
        const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // seconds

        // Detect anomalies
        const anomaly = this.detectPointAnomaly(prev, curr, distance, timeDiff);
        if (anomaly) {
          anomalies.push({
            ...anomaly,
            timestamp: curr.timestamp,
            location: currCoords,
          });
        }
      }

      return {
        agentId,
        shiftId,
        totalPoints: locations.length,
        anomalies,
        anomalyCount: anomalies.length,
        anomalyRate: locations.length > 0 ? (anomalies.length / locations.length * 100).toFixed(2) : 0,
      };
    } catch (error) {
      logger.error('Failed to detect location anomalies:', error);
      throw error;
    }
  }

  // Helper methods

  extractCoordinates(pointString) {
    const coordMatch = pointString.match(/POINT\(([^)]+)\)/);
    const [longitude, latitude] = coordMatch[1].split(' ').map(Number);
    return { latitude, longitude };
  }

  generateDefaultPatrolPoints(center, radius) {
    const points = [];
    const numPoints = 8; // Octagon pattern
    
    for (let i = 0; i < numPoints; i++) {
      const angle = (i * 360 / numPoints) * Math.PI / 180;
      const distance = radius * 0.8; // 80% of radius
      
      const point = geolib.computeDestinationPoint(
        center,
        distance,
        angle * 180 / Math.PI
      );
      
      points.push(point);
    }
    
    return points;
  }

  optimizeRoute(points) {
    // Simple nearest neighbor algorithm
    const optimized = [points[0]];
    const remaining = points.slice(1, -1);
    
    while (remaining.length > 0) {
      const current = optimized[optimized.length - 1];
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      
      remaining.forEach((point, index) => {
        const distance = geolib.getDistance(current, point);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      
      optimized.push(remaining[nearestIndex]);
      remaining.splice(nearestIndex, 1);
    }
    
    optimized.push(points[points.length - 1]); // Add end point
    return optimized;
  }

  calculateRouteMetrics(route) {
    let totalDistance = 0;
    
    for (let i = 1; i < route.length; i++) {
      totalDistance += geolib.getDistance(route[i - 1], route[i]);
    }
    
    return {
      totalDistance,
      waypoints: route.length,
      estimatedWalkingTime: Math.ceil(totalDistance / 83.33), // minutes at 5 km/h
    };
  }

  generateDirections(route) {
    const directions = [];
    
    for (let i = 1; i < route.length; i++) {
      const from = route[i - 1];
      const to = route[i];
      const bearing = geolib.getBearing(from, to);
      const distance = geolib.getDistance(from, to);
      
      directions.push({
        step: i,
        instruction: `Head ${this.bearingToDirection(bearing)} for ${distance}m`,
        distance,
        bearing,
        coordinates: to,
      });
    }
    
    return directions;
  }

  bearingToDirection(bearing) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

  async analyzeShiftPatterns(shiftGroup) {
    const { shift, locations } = shiftGroup;
    
    // Calculate basic metrics
    const efficiency = await this.calculatePatrolEfficiency(
      shift.agentId,
      shift.id
    );
    
    // Analyze time distribution
    const hourlyDistribution = Array(24).fill(0);
    locations.forEach(location => {
      const hour = location.timestamp.getHours();
      hourlyDistribution[hour]++;
    });
    
    return {
      shiftId: shift.id,
      siteName: shift.site.name,
      efficiency,
      locationCount: locations.length,
      hourlyDistribution,
      duration: shift.endTime - shift.startTime,
    };
  }

  calculateOverallPatterns(shiftPatterns) {
    const patterns = Object.values(shiftPatterns);
    
    if (patterns.length === 0) {
      return {};
    }
    
    const avgEfficiency = patterns.reduce((sum, p) => sum + p.efficiency.efficiency, 0) / patterns.length;
    const avgDistance = patterns.reduce((sum, p) => sum + p.efficiency.totalDistance, 0) / patterns.length;
    const avgSpeed = patterns.reduce((sum, p) => sum + p.efficiency.averageSpeed, 0) / patterns.length;
    
    return {
      averageEfficiency: Math.round(avgEfficiency),
      averageDistance: Math.round(avgDistance),
      averageSpeed: Math.round(avgSpeed * 100) / 100,
      totalShifts: patterns.length,
    };
  }

  detectPointAnomaly(prev, curr, distance, timeDiff) {
    const anomalies = [];
    
    // Impossible speed (> 50 km/h for walking)
    if (timeDiff > 0) {
      const speed = (distance / timeDiff) * 3.6; // km/h
      if (speed > 50) {
        anomalies.push({
          type: 'impossible_speed',
          severity: 'high',
          description: `Impossible speed detected: ${speed.toFixed(2)} km/h`,
          speed,
        });
      }
    }
    
    // Large distance jump (> 1km in < 5 minutes)
    if (distance > 1000 && timeDiff < 300) {
      anomalies.push({
        type: 'teleportation',
        severity: 'high',
        description: `Large distance jump: ${distance}m in ${timeDiff}s`,
        distance,
        timeDiff,
      });
    }
    
    // Mock location detection (perfect accuracy)
    if (curr.accuracy === 0 || curr.accuracy === 1) {
      anomalies.push({
        type: 'mock_location',
        severity: 'medium',
        description: 'Suspicious location accuracy suggests mock location',
        accuracy: curr.accuracy,
      });
    }
    
    return anomalies.length > 0 ? anomalies : null;
  }
}

module.exports = LocationAnalyticsService;
