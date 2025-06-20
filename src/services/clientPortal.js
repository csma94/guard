const logger = require('../config/logger');

/**
 * Client Portal Service for real-time monitoring and client-specific features
 */
class ClientPortalService {
  constructor(prisma, io = null) {
    this.prisma = prisma;
    this.io = io;
  }

  /**
   * Get real-time dashboard data for a client
   */
  async getClientDashboard(clientId) {
    try {
      // Get client information
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        include: {
          sites: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              status: true,
              coordinates: true,
              geofenceRadius: true
            }
          }
        }
      });

      if (!client) {
        throw new Error('Client not found');
      }

      const siteIds = client.sites.map(site => site.id);

      // Get current active shifts
      const now = new Date();
      const activeShifts = await this.prisma.shift.findMany({
        where: {
          siteId: { in: siteIds },
          status: 'IN_PROGRESS',
          startTime: { lte: now },
          endTime: { gte: now },
          deletedAt: null
        },
        include: {
          site: {
            select: { id: true, name: true, coordinates: true }
          },
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
          attendance: {
            where: { clockOutTime: null },
            select: {
              id: true,
              clockInTime: true,
              clockInMethod: true,
              status: true
            }
          }
        }
      });

      // Get recent location data for active agents
      const agentIds = activeShifts.map(shift => shift.agentId).filter(Boolean);
      const recentLocations = await this.getRecentAgentLocations(agentIds, 30); // Last 30 minutes

      // Get today's reports
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const todaysReports = await this.prisma.report.findMany({
        where: {
          siteId: { in: siteIds },
          createdAt: {
            gte: todayStart,
            lte: todayEnd
          },
          deletedAt: null
        },
        include: {
          site: {
            select: { id: true, name: true }
          },
          agent: {
            include: {
              user: {
                select: { username: true, profile: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      });

      // Get recent incidents (high priority reports)
      const recentIncidents = await this.prisma.report.findMany({
        where: {
          siteId: { in: siteIds },
          reportType: 'INCIDENT',
          priority: { in: ['HIGH', 'CRITICAL'] },
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          },
          deletedAt: null
        },
        include: {
          site: {
            select: { id: true, name: true }
          },
          agent: {
            include: {
              user: {
                select: { username: true, profile: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      // Calculate metrics
      const metrics = await this.calculateClientMetrics(clientId, siteIds);

      // Prepare agent status data
      const agentStatus = activeShifts.map(shift => {
        const agentLocation = recentLocations.find(loc => loc.agentId === shift.agentId);
        const attendance = shift.attendance[0];

        return {
          agentId: shift.agentId,
          agentName: shift.agent ? 
            `${shift.agent.user.profile?.firstName || ''} ${shift.agent.user.profile?.lastName || ''}`.trim() || 
            shift.agent.user.username : 'Unassigned',
          siteId: shift.siteId,
          siteName: shift.site.name,
          shiftId: shift.id,
          status: attendance?.status || 'SCHEDULED',
          clockInTime: attendance?.clockInTime,
          clockInMethod: attendance?.clockInMethod,
          currentLocation: agentLocation ? {
            latitude: agentLocation.latitude,
            longitude: agentLocation.longitude,
            timestamp: agentLocation.timestamp,
            accuracy: agentLocation.accuracy
          } : null,
          lastUpdate: agentLocation?.timestamp || attendance?.clockInTime
        };
      });

      return {
        client: {
          id: client.id,
          companyName: client.companyName,
          serviceLevel: client.serviceLevel
        },
        sites: client.sites,
        metrics,
        agentStatus,
        activeShifts: activeShifts.length,
        todaysReports: todaysReports.length,
        recentIncidents: recentIncidents.length,
        reports: todaysReports.slice(0, 5), // Latest 5 reports for dashboard
        incidents: recentIncidents.slice(0, 3), // Latest 3 incidents for dashboard
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get client dashboard:', error);
      throw error;
    }
  }

  /**
   * Get real-time agent tracking for client sites
   */
  async getAgentTracking(clientId, siteId = null) {
    try {
      // Verify client access
      const whereClause = { clientId };
      if (siteId) {
        whereClause.id = siteId;
      }

      const sites = await this.prisma.site.findMany({
        where: { ...whereClause, deletedAt: null },
        select: { id: true, name: true, coordinates: true, geofenceRadius: true }
      });

      if (sites.length === 0) {
        throw new Error('No accessible sites found');
      }

      const siteIds = sites.map(site => site.id);

      // Get current active shifts
      const now = new Date();
      const activeShifts = await this.prisma.shift.findMany({
        where: {
          siteId: { in: siteIds },
          status: 'IN_PROGRESS',
          startTime: { lte: now },
          endTime: { gte: now },
          deletedAt: null
        },
        include: {
          site: {
            select: { id: true, name: true, coordinates: true, geofenceRadius: true }
          },
          agent: {
            include: {
              user: {
                select: { id: true, username: true, profile: true }
              }
            }
          },
          attendance: {
            where: { clockOutTime: null },
            select: {
              id: true,
              clockInTime: true,
              clockInMethod: true,
              status: true
            }
          }
        }
      });

      // Get recent location data
      const agentIds = activeShifts.map(shift => shift.agentId).filter(Boolean);
      const recentLocations = await this.getRecentAgentLocations(agentIds, 60); // Last hour

      // Prepare tracking data
      const trackingData = activeShifts.map(shift => {
        const agentLocations = recentLocations.filter(loc => loc.agentId === shift.agentId);
        const latestLocation = agentLocations[0]; // Most recent
        const attendance = shift.attendance[0];

        return {
          agentId: shift.agentId,
          agentName: shift.agent ? 
            `${shift.agent.user.profile?.firstName || ''} ${shift.agent.user.profile?.lastName || ''}`.trim() || 
            shift.agent.user.username : 'Unassigned',
          siteId: shift.siteId,
          siteName: shift.site.name,
          siteLocation: this.parseCoordinates(shift.site.coordinates),
          geofenceRadius: shift.site.geofenceRadius,
          shiftId: shift.id,
          shiftStartTime: shift.startTime,
          shiftEndTime: shift.endTime,
          attendanceStatus: attendance?.status || 'SCHEDULED',
          clockInTime: attendance?.clockInTime,
          currentLocation: latestLocation ? {
            latitude: latestLocation.latitude,
            longitude: latestLocation.longitude,
            timestamp: latestLocation.timestamp,
            accuracy: latestLocation.accuracy,
            isWithinGeofence: this.isWithinGeofence(
              latestLocation,
              this.parseCoordinates(shift.site.coordinates),
              shift.site.geofenceRadius
            )
          } : null,
          locationHistory: agentLocations.slice(0, 20), // Last 20 location points
          lastUpdate: latestLocation?.timestamp || attendance?.clockInTime
        };
      });

      return {
        sites: sites.map(site => ({
          ...site,
          coordinates: this.parseCoordinates(site.coordinates)
        })),
        agents: trackingData,
        totalAgents: trackingData.length,
        agentsOnSite: trackingData.filter(agent => 
          agent.currentLocation?.isWithinGeofence
        ).length,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get agent tracking:', error);
      throw error;
    }
  }

  /**
   * Get client reports with filtering and pagination
   */
  async getClientReports(clientId, filters = {}) {
    try {
      const {
        siteId,
        reportType,
        status,
        priority,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      // Get client sites
      const sites = await this.prisma.site.findMany({
        where: { clientId, deletedAt: null },
        select: { id: true }
      });

      const siteIds = sites.map(site => site.id);

      if (siteIds.length === 0) {
        return {
          reports: [],
          pagination: { page: 1, limit, total: 0, pages: 0 }
        };
      }

      // Build where clause
      const where = {
        siteId: { in: siteId ? [siteId] : siteIds },
        deletedAt: null
      };

      if (reportType) where.reportType = reportType;
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      // Get reports with pagination
      const [reports, totalCount] = await Promise.all([
        this.prisma.report.findMany({
          where,
          include: {
            site: {
              select: { id: true, name: true }
            },
            agent: {
              include: {
                user: {
                  select: { username: true, profile: true }
                }
              }
            },
            reviewer: {
              select: { id: true, username: true, profile: true }
            },
            mediaFiles: {
              select: {
                id: true,
                filename: true,
                fileType: true,
                description: true,
                createdAt: true
              }
            }
          },
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * limit,
          take: parseInt(limit)
        }),
        this.prisma.report.count({ where })
      ]);

      return {
        reports,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      };

    } catch (error) {
      logger.error('Failed to get client reports:', error);
      throw error;
    }
  }

  /**
   * Submit client request
   */
  async submitClientRequest(clientId, requestData) {
    try {
      const {
        siteId,
        requestType,
        title,
        description,
        priority = 'MEDIUM',
        contactPerson,
        preferredResponseTime
      } = requestData;

      // Verify site belongs to client
      const site = await this.prisma.site.findFirst({
        where: { id: siteId, clientId, deletedAt: null }
      });

      if (!site) {
        throw new Error('Site not found or access denied');
      }

      const request = await this.prisma.clientRequest.create({
        data: {
          clientId,
          siteId,
          requestType,
          title,
          description,
          priority,
          contactPerson,
          preferredResponseTime: preferredResponseTime ? new Date(preferredResponseTime) : null,
          status: 'OPEN'
        }
      });

      // Send notification to supervisors/admins
      if (this.io) {
        this.io.to('role:supervisor').to('role:admin').emit('client_request_submitted', {
          requestId: request.id,
          clientId,
          siteId,
          siteName: site.name,
          requestType,
          title,
          priority,
          submittedAt: request.createdAt
        });
      }

      logger.info('Client request submitted', {
        requestId: request.id,
        clientId,
        siteId,
        requestType,
        priority
      });

      return request;

    } catch (error) {
      logger.error('Failed to submit client request:', error);
      throw error;
    }
  }

  // Helper methods

  async getRecentAgentLocations(agentIds, minutesBack = 30) {
    if (agentIds.length === 0) return [];

    const cutoffTime = new Date(Date.now() - minutesBack * 60 * 1000);

    const locations = await this.prisma.locationTracking.findMany({
      where: {
        agentId: { in: agentIds },
        timestamp: { gte: cutoffTime }
      },
      orderBy: [
        { agentId: 'asc' },
        { timestamp: 'desc' }
      ]
    });

    return locations.map(location => ({
      agentId: location.agentId,
      latitude: this.parseCoordinates(location.coordinates).latitude,
      longitude: this.parseCoordinates(location.coordinates).longitude,
      timestamp: location.timestamp,
      accuracy: location.accuracy
    }));
  }

  async calculateClientMetrics(clientId, siteIds) {
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalSites,
      activeSites,
      todayShifts,
      completedShifts,
      todayReports,
      weeklyIncidents
    ] = await Promise.all([
      this.prisma.site.count({
        where: { clientId, deletedAt: null }
      }),
      this.prisma.site.count({
        where: { clientId, status: 'ACTIVE', deletedAt: null }
      }),
      this.prisma.shift.count({
        where: {
          siteId: { in: siteIds },
          startTime: { gte: todayStart },
          deletedAt: null
        }
      }),
      this.prisma.shift.count({
        where: {
          siteId: { in: siteIds },
          status: 'COMPLETED',
          startTime: { gte: todayStart },
          deletedAt: null
        }
      }),
      this.prisma.report.count({
        where: {
          siteId: { in: siteIds },
          createdAt: { gte: todayStart },
          deletedAt: null
        }
      }),
      this.prisma.report.count({
        where: {
          siteId: { in: siteIds },
          reportType: 'INCIDENT',
          createdAt: { gte: weekStart },
          deletedAt: null
        }
      })
    ]);

    return {
      totalSites,
      activeSites,
      todayShifts,
      completedShifts,
      shiftCompletionRate: todayShifts > 0 ? Math.round((completedShifts / todayShifts) * 100) : 0,
      todayReports,
      weeklyIncidents
    };
  }

  parseCoordinates(coordinatesString) {
    // Parse PostgreSQL POINT format: (longitude,latitude)
    const match = coordinatesString.match(/\(([^,]+),([^)]+)\)/);
    if (match) {
      return {
        longitude: parseFloat(match[1]),
        latitude: parseFloat(match[2])
      };
    }
    throw new Error('Invalid coordinates format');
  }

  isWithinGeofence(location, siteLocation, radius) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = location.latitude * Math.PI / 180;
    const φ2 = siteLocation.latitude * Math.PI / 180;
    const Δφ = (siteLocation.latitude - location.latitude) * Math.PI / 180;
    const Δλ = (siteLocation.longitude - location.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const distance = R * c;
    return distance <= radius;
  }
  /**
   * Generate client performance report
   */
  async generatePerformanceReport(clientId, reportOptions = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        endDate = new Date(),
        siteId = null,
        includeDetails = true
      } = reportOptions;

      // Get client sites
      const sites = await this.prisma.site.findMany({
        where: {
          clientId,
          ...(siteId && { id: siteId }),
          deletedAt: null
        },
        select: { id: true, name: true, address: true }
      });

      const siteIds = sites.map(site => site.id);

      // Get comprehensive metrics
      const [
        shiftsData,
        reportsData,
        attendanceData,
        incidentsData,
        responseTimeData
      ] = await Promise.all([
        this.getShiftsMetrics(siteIds, startDate, endDate),
        this.getReportsMetrics(siteIds, startDate, endDate),
        this.getAttendanceMetrics(siteIds, startDate, endDate),
        this.getIncidentsMetrics(siteIds, startDate, endDate),
        this.getResponseTimeMetrics(siteIds, startDate, endDate)
      ]);

      const report = {
        client: await this.getClientInfo(clientId),
        period: { startDate, endDate },
        sites: includeDetails ? sites : sites.length,
        summary: {
          totalShifts: shiftsData.total,
          completedShifts: shiftsData.completed,
          completionRate: shiftsData.completionRate,
          totalReports: reportsData.total,
          incidentReports: incidentsData.total,
          averageResponseTime: responseTimeData.average,
          attendanceRate: attendanceData.rate,
          overallScore: this.calculateOverallScore({
            completionRate: shiftsData.completionRate,
            attendanceRate: attendanceData.rate,
            incidentRate: incidentsData.rate,
            responseTime: responseTimeData.average
          })
        },
        details: includeDetails ? {
          shifts: shiftsData,
          reports: reportsData,
          attendance: attendanceData,
          incidents: incidentsData,
          responseTime: responseTimeData
        } : null,
        generatedAt: new Date()
      };

      return report;

    } catch (error) {
      logger.error('Failed to generate performance report:', error);
      throw error;
    }
  }

  /**
   * Get client service level agreement status
   */
  async getSLAStatus(clientId) {
    try {
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          companyName: true,
          serviceLevel: true,
          contractDetails: true
        }
      });

      if (!client) {
        throw new Error('Client not found');
      }

      const slaConfig = this.getSLAConfiguration(client.serviceLevel);
      const currentPeriod = this.getCurrentSLAPeriod();

      // Get sites for this client
      const sites = await this.prisma.site.findMany({
        where: { clientId, deletedAt: null },
        select: { id: true }
      });

      const siteIds = sites.map(site => site.id);

      // Calculate SLA metrics
      const [
        responseTimeCompliance,
        availabilityCompliance,
        incidentResolutionCompliance,
        reportDeliveryCompliance
      ] = await Promise.all([
        this.calculateResponseTimeCompliance(siteIds, currentPeriod, slaConfig),
        this.calculateAvailabilityCompliance(siteIds, currentPeriod, slaConfig),
        this.calculateIncidentResolutionCompliance(siteIds, currentPeriod, slaConfig),
        this.calculateReportDeliveryCompliance(siteIds, currentPeriod, slaConfig)
      ]);

      const overallCompliance = (
        responseTimeCompliance.percentage +
        availabilityCompliance.percentage +
        incidentResolutionCompliance.percentage +
        reportDeliveryCompliance.percentage
      ) / 4;

      return {
        client: {
          id: client.id,
          companyName: client.companyName,
          serviceLevel: client.serviceLevel
        },
        period: currentPeriod,
        slaConfig,
        compliance: {
          overall: {
            percentage: Math.round(overallCompliance * 100) / 100,
            status: overallCompliance >= 0.95 ? 'EXCELLENT' :
                   overallCompliance >= 0.90 ? 'GOOD' :
                   overallCompliance >= 0.80 ? 'ACCEPTABLE' : 'NEEDS_IMPROVEMENT'
          },
          responseTime: responseTimeCompliance,
          availability: availabilityCompliance,
          incidentResolution: incidentResolutionCompliance,
          reportDelivery: reportDeliveryCompliance
        },
        lastUpdated: new Date()
      };

    } catch (error) {
      logger.error('Failed to get SLA status:', error);
      throw error;
    }
  }

  /**
   * Schedule automated report delivery
   */
  async scheduleReportDelivery(clientId, scheduleData) {
    try {
      const {
        reportType = 'DAILY_SUMMARY',
        frequency = 'DAILY', // DAILY, WEEKLY, MONTHLY
        deliveryTime = '08:00',
        recipients = [],
        format = 'PDF',
        includePhotos = true,
        customFilters = {}
      } = scheduleData;

      const schedule = await this.prisma.reportSchedule.create({
        data: {
          clientId,
          reportType,
          frequency,
          deliveryTime,
          recipients,
          format,
          settings: {
            includePhotos,
            customFilters
          },
          isActive: true,
          nextDelivery: this.calculateNextDelivery(frequency, deliveryTime)
        }
      });

      logger.info('Report delivery scheduled', {
        scheduleId: schedule.id,
        clientId,
        reportType,
        frequency,
        nextDelivery: schedule.nextDelivery
      });

      return {
        success: true,
        schedule: {
          id: schedule.id,
          reportType: schedule.reportType,
          frequency: schedule.frequency,
          deliveryTime: schedule.deliveryTime,
          nextDelivery: schedule.nextDelivery,
          isActive: schedule.isActive
        }
      };

    } catch (error) {
      logger.error('Failed to schedule report delivery:', error);
      throw error;
    }
  }

  // Helper methods for performance reporting

  async getShiftsMetrics(siteIds, startDate, endDate) {
    const [total, completed] = await Promise.all([
      this.prisma.shift.count({
        where: {
          siteId: { in: siteIds },
          startTime: { gte: startDate, lte: endDate },
          deletedAt: null
        }
      }),
      this.prisma.shift.count({
        where: {
          siteId: { in: siteIds },
          startTime: { gte: startDate, lte: endDate },
          status: 'COMPLETED',
          deletedAt: null
        }
      })
    ]);

    return {
      total,
      completed,
      completionRate: total > 0 ? (completed / total) : 0
    };
  }

  async getReportsMetrics(siteIds, startDate, endDate) {
    const [total, approved, pending] = await Promise.all([
      this.prisma.report.count({
        where: {
          siteId: { in: siteIds },
          createdAt: { gte: startDate, lte: endDate },
          deletedAt: null
        }
      }),
      this.prisma.report.count({
        where: {
          siteId: { in: siteIds },
          createdAt: { gte: startDate, lte: endDate },
          status: 'APPROVED',
          deletedAt: null
        }
      }),
      this.prisma.report.count({
        where: {
          siteId: { in: siteIds },
          createdAt: { gte: startDate, lte: endDate },
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
          deletedAt: null
        }
      })
    ]);

    return {
      total,
      approved,
      pending,
      approvalRate: total > 0 ? (approved / total) : 0
    };
  }

  getSLAConfiguration(serviceLevel) {
    const slaConfigs = {
      'BASIC': {
        responseTime: 4, // hours
        availability: 0.95, // 95%
        incidentResolution: 24, // hours
        reportDelivery: 24 // hours
      },
      'STANDARD': {
        responseTime: 2, // hours
        availability: 0.98, // 98%
        incidentResolution: 12, // hours
        reportDelivery: 12 // hours
      },
      'PREMIUM': {
        responseTime: 1, // hour
        availability: 0.99, // 99%
        incidentResolution: 4, // hours
        reportDelivery: 4 // hours
      }
    };

    return slaConfigs[serviceLevel] || slaConfigs['STANDARD'];
  }

  getCurrentSLAPeriod() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
      startDate: startOfMonth,
      endDate: endOfMonth,
      type: 'MONTHLY'
    };
  }

  calculateOverallScore(metrics) {
    const weights = {
      completionRate: 0.3,
      attendanceRate: 0.25,
      incidentRate: 0.25, // Lower is better
      responseTime: 0.2 // Lower is better
    };

    const normalizedIncidentRate = Math.max(0, 1 - metrics.incidentRate);
    const normalizedResponseTime = Math.max(0, 1 - (metrics.responseTime / 24)); // Normalize to 24 hours

    return (
      metrics.completionRate * weights.completionRate +
      metrics.attendanceRate * weights.attendanceRate +
      normalizedIncidentRate * weights.incidentRate +
      normalizedResponseTime * weights.responseTime
    ) * 100;
  }

  calculateNextDelivery(frequency, deliveryTime) {
    const now = new Date();
    const [hours, minutes] = deliveryTime.split(':').map(Number);

    let nextDelivery = new Date();
    nextDelivery.setHours(hours, minutes, 0, 0);

    switch (frequency) {
      case 'DAILY':
        if (nextDelivery <= now) {
          nextDelivery.setDate(nextDelivery.getDate() + 1);
        }
        break;
      case 'WEEKLY':
        nextDelivery.setDate(nextDelivery.getDate() + (7 - nextDelivery.getDay()));
        if (nextDelivery <= now) {
          nextDelivery.setDate(nextDelivery.getDate() + 7);
        }
        break;
      case 'MONTHLY':
        nextDelivery.setMonth(nextDelivery.getMonth() + 1, 1);
        break;
    }

    return nextDelivery;
  }
}

module.exports = ClientPortalService;
