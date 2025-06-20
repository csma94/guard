const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * Real-time Shift Status Management Service
 * Handles live shift updates, validation, and notifications
 */
class RealTimeShiftManager {
  constructor(prisma, webSocketService, notificationService, locationService) {
    this.prisma = prisma;
    this.webSocketService = webSocketService;
    this.notificationService = notificationService;
    this.locationService = locationService;
    
    // Active shift monitoring
    this.activeShifts = new Map();
    this.shiftTimers = new Map();
    
    this.initializeShiftMonitoring();
  }

  /**
   * Initialize shift monitoring for active shifts
   */
  async initializeShiftMonitoring() {
    try {
      const activeShifts = await this.prisma.shift.findMany({
        where: {
          status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          startTime: { lte: new Date() },
          endTime: { gte: new Date() },
          deletedAt: null,
        },
        include: {
          agent: {
            include: {
              user: {
                select: { id: true, username: true, profile: true },
              },
            },
          },
          site: {
            select: { id: true, name: true, coordinates: true, geofenceRadius: true },
          },
        },
      });

      for (const shift of activeShifts) {
        await this.startShiftMonitoring(shift);
      }

      logger.info(`Initialized monitoring for ${activeShifts.length} active shifts`);
    } catch (error) {
      logger.error('Failed to initialize shift monitoring:', error);
    }
  }

  /**
   * Handle agent clock-in with comprehensive validation
   */
  async handleClockIn(agentId, shiftId, clockInData) {
    try {
      const {
        location,
        qrCodeData,
        deviceId,
        timestamp = new Date(),
        notes,
      } = clockInData;

      // Get shift details
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          agent: {
            include: {
              user: {
                select: { id: true, username: true, profile: true },
              },
            },
          },
          site: {
            include: {
              client: {
                select: { id: true, companyName: true },
              },
            },
          },
        },
      });

      if (!shift) {
        throw new Error('Shift not found');
      }

      if (shift.agentId !== agentId) {
        throw new Error('Agent not assigned to this shift');
      }

      if (shift.status !== 'CONFIRMED') {
        throw new Error(`Cannot clock in to shift with status: ${shift.status}`);
      }

      // Validate clock-in timing
      const clockInTime = new Date(timestamp);
      const shiftStart = new Date(shift.startTime);
      const timeDiff = clockInTime.getTime() - shiftStart.getTime();
      
      // Allow clock-in 15 minutes early, flag if more than 15 minutes late
      const earlyThreshold = -15 * 60 * 1000; // 15 minutes early
      const lateThreshold = 15 * 60 * 1000;   // 15 minutes late

      let clockInStatus = 'ON_TIME';
      let statusNotes = [];

      if (timeDiff < earlyThreshold) {
        clockInStatus = 'EARLY';
        statusNotes.push(`Clocked in ${Math.abs(timeDiff / 60000).toFixed(0)} minutes early`);
      } else if (timeDiff > lateThreshold) {
        clockInStatus = 'LATE';
        statusNotes.push(`Clocked in ${(timeDiff / 60000).toFixed(0)} minutes late`);
      }

      // Validate location if provided
      let locationValidation = null;
      if (location && shift.site.coordinates) {
        locationValidation = await this.validateShiftLocation(
          location,
          shift.site,
          'CLOCK_IN'
        );
        
        if (!locationValidation.valid) {
          statusNotes.push(`Location validation failed: ${locationValidation.error}`);
        }
      }

      // Validate QR code if provided
      let qrValidation = null;
      if (qrCodeData) {
        qrValidation = await this.validateQRCode(qrCodeData, shift.siteId, agentId);
        
        if (!qrValidation.valid) {
          statusNotes.push(`QR code validation failed: ${qrValidation.error}`);
        }
      }

      // Create attendance record
      const attendance = await this.prisma.attendance.create({
        data: {
          id: uuidv4(),
          shiftId: shift.id,
          agentId: agentId,
          clockInTime: clockInTime,
          clockInLocation: location ? `POINT(${location.longitude} ${location.latitude})` : null,
          clockInStatus,
          clockInNotes: statusNotes.join('; '),
          deviceId,
          qrCodeValidation: qrValidation,
          locationValidation: locationValidation,
          notes,
        },
      });

      // Update shift status
      await this.prisma.shift.update({
        where: { id: shiftId },
        data: {
          status: 'IN_PROGRESS',
          actualStartTime: clockInTime,
        },
      });

      // Start real-time monitoring
      await this.startShiftMonitoring(shift);

      // Send notifications
      await this.sendClockInNotifications(shift, attendance, clockInStatus);

      // Emit real-time updates
      this.webSocketService.emitToUser(agentId, 'shift_clock_in_success', {
        shiftId,
        attendance,
        status: clockInStatus,
        notes: statusNotes,
      });

      this.webSocketService.emitToRole('SUPERVISOR', 'agent_clocked_in', {
        shift,
        attendance,
        agent: shift.agent,
        status: clockInStatus,
      });

      logger.info('Agent clocked in successfully', {
        agentId,
        shiftId,
        status: clockInStatus,
        location: !!location,
        qrCode: !!qrCodeData,
      });

      return {
        success: true,
        attendance,
        status: clockInStatus,
        notes: statusNotes,
        locationValidation,
        qrValidation,
      };
    } catch (error) {
      logger.error('Clock-in failed:', error);
      throw error;
    }
  }

  /**
   * Handle agent clock-out with validation
   */
  async handleClockOut(agentId, shiftId, clockOutData) {
    try {
      const {
        location,
        deviceId,
        timestamp = new Date(),
        notes,
        reportSubmitted = false,
      } = clockOutData;

      // Get attendance record
      const attendance = await this.prisma.attendance.findFirst({
        where: {
          shiftId,
          agentId,
          clockOutTime: null,
        },
        include: {
          shift: {
            include: {
              agent: {
                include: {
                  user: {
                    select: { id: true, username: true, profile: true },
                  },
                },
              },
              site: {
                include: {
                  client: {
                    select: { id: true, companyName: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!attendance) {
        throw new Error('No active clock-in found for this shift');
      }

      const shift = attendance.shift;
      const clockOutTime = new Date(timestamp);
      const shiftEnd = new Date(shift.endTime);
      const timeDiff = clockOutTime.getTime() - shiftEnd.getTime();

      let clockOutStatus = 'ON_TIME';
      let statusNotes = [];

      // Check if clocking out early or late
      const earlyThreshold = -15 * 60 * 1000; // 15 minutes early
      const lateThreshold = 15 * 60 * 1000;   // 15 minutes late

      if (timeDiff < earlyThreshold) {
        clockOutStatus = 'EARLY';
        statusNotes.push(`Clocked out ${Math.abs(timeDiff / 60000).toFixed(0)} minutes early`);
      } else if (timeDiff > lateThreshold) {
        clockOutStatus = 'LATE';
        statusNotes.push(`Clocked out ${(timeDiff / 60000).toFixed(0)} minutes late`);
      }

      // Validate location
      let locationValidation = null;
      if (location && shift.site.coordinates) {
        locationValidation = await this.validateShiftLocation(
          location,
          shift.site,
          'CLOCK_OUT'
        );
        
        if (!locationValidation.valid) {
          statusNotes.push(`Location validation failed: ${locationValidation.error}`);
        }
      }

      // Calculate total hours worked
      const hoursWorked = (clockOutTime.getTime() - attendance.clockInTime.getTime()) / (1000 * 60 * 60);

      // Update attendance record
      const updatedAttendance = await this.prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          clockOutTime: clockOutTime,
          clockOutLocation: location ? `POINT(${location.longitude} ${location.latitude})` : null,
          clockOutStatus,
          clockOutNotes: statusNotes.join('; '),
          hoursWorked,
          reportSubmitted,
          notes: notes ? `${attendance.notes || ''}\n${notes}`.trim() : attendance.notes,
        },
      });

      // Update shift status
      await this.prisma.shift.update({
        where: { id: shiftId },
        data: {
          status: 'COMPLETED',
          actualEndTime: clockOutTime,
        },
      });

      // Stop monitoring
      this.stopShiftMonitoring(shiftId);

      // Send notifications
      await this.sendClockOutNotifications(shift, updatedAttendance, clockOutStatus);

      // Emit real-time updates
      this.webSocketService.emitToUser(agentId, 'shift_clock_out_success', {
        shiftId,
        attendance: updatedAttendance,
        status: clockOutStatus,
        hoursWorked,
        notes: statusNotes,
      });

      this.webSocketService.emitToRole('SUPERVISOR', 'agent_clocked_out', {
        shift,
        attendance: updatedAttendance,
        agent: shift.agent,
        status: clockOutStatus,
        hoursWorked,
      });

      logger.info('Agent clocked out successfully', {
        agentId,
        shiftId,
        status: clockOutStatus,
        hoursWorked,
        reportSubmitted,
      });

      return {
        success: true,
        attendance: updatedAttendance,
        status: clockOutStatus,
        hoursWorked,
        notes: statusNotes,
        locationValidation,
      };
    } catch (error) {
      logger.error('Clock-out failed:', error);
      throw error;
    }
  }

  /**
   * Handle break start
   */
  async startBreak(agentId, shiftId, breakData) {
    try {
      const {
        breakType = 'REGULAR',
        location,
        timestamp = new Date(),
        notes,
      } = breakData;

      // Validate active shift
      const shift = await this.getActiveShift(agentId, shiftId);
      
      // Check for existing active break
      const activeBreak = await this.prisma.break.findFirst({
        where: {
          shiftId,
          agentId,
          endTime: null,
        },
      });

      if (activeBreak) {
        throw new Error('Agent is already on break');
      }

      // Create break record
      const breakRecord = await this.prisma.break.create({
        data: {
          id: uuidv4(),
          shiftId,
          agentId,
          breakType,
          startTime: new Date(timestamp),
          startLocation: location ? `POINT(${location.longitude} ${location.latitude})` : null,
          notes,
        },
      });

      // Update shift monitoring
      this.updateShiftStatus(shiftId, 'ON_BREAK');

      // Send notifications
      await this.notificationService.sendNotification({
        recipientId: shift.supervisorId,
        type: 'BREAK_STARTED',
        title: 'Agent Break Started',
        message: `${shift.agent.user.username} started a ${breakType.toLowerCase()} break`,
        data: {
          shiftId,
          agentId,
          breakId: breakRecord.id,
          breakType,
        },
        channels: ['PUSH'],
        priority: 'NORMAL',
      });

      // Emit real-time update
      this.webSocketService.emitToRole('SUPERVISOR', 'agent_break_started', {
        shift,
        break: breakRecord,
        agent: shift.agent,
      });

      return {
        success: true,
        break: breakRecord,
      };
    } catch (error) {
      logger.error('Failed to start break:', error);
      throw error;
    }
  }

  /**
   * Handle break end
   */
  async endBreak(agentId, shiftId, breakData) {
    try {
      const {
        location,
        timestamp = new Date(),
        notes,
      } = breakData;

      // Get active break
      const activeBreak = await this.prisma.break.findFirst({
        where: {
          shiftId,
          agentId,
          endTime: null,
        },
        include: {
          shift: {
            include: {
              agent: {
                include: {
                  user: {
                    select: { id: true, username: true, profile: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!activeBreak) {
        throw new Error('No active break found');
      }

      const endTime = new Date(timestamp);
      const duration = (endTime.getTime() - activeBreak.startTime.getTime()) / (1000 * 60); // minutes

      // Update break record
      const updatedBreak = await this.prisma.break.update({
        where: { id: activeBreak.id },
        data: {
          endTime,
          endLocation: location ? `POINT(${location.longitude} ${location.latitude})` : null,
          duration,
          notes: notes ? `${activeBreak.notes || ''}\n${notes}`.trim() : activeBreak.notes,
        },
      });

      // Update shift monitoring
      this.updateShiftStatus(shiftId, 'IN_PROGRESS');

      // Send notifications
      await this.notificationService.sendNotification({
        recipientId: activeBreak.shift.supervisorId,
        type: 'BREAK_ENDED',
        title: 'Agent Break Ended',
        message: `${activeBreak.shift.agent.user.username} ended break (${duration.toFixed(0)} minutes)`,
        data: {
          shiftId,
          agentId,
          breakId: activeBreak.id,
          duration,
        },
        channels: ['PUSH'],
        priority: 'NORMAL',
      });

      // Emit real-time update
      this.webSocketService.emitToRole('SUPERVISOR', 'agent_break_ended', {
        shift: activeBreak.shift,
        break: updatedBreak,
        agent: activeBreak.shift.agent,
        duration,
      });

      return {
        success: true,
        break: updatedBreak,
        duration,
      };
    } catch (error) {
      logger.error('Failed to end break:', error);
      throw error;
    }
  }

  /**
   * Start monitoring a shift
   */
  async startShiftMonitoring(shift) {
    const shiftId = shift.id;
    
    // Store shift in active monitoring
    this.activeShifts.set(shiftId, {
      ...shift,
      status: 'IN_PROGRESS',
      lastUpdate: new Date(),
      alerts: [],
    });

    // Set up periodic monitoring
    const monitoringInterval = setInterval(async () => {
      await this.monitorShiftStatus(shiftId);
    }, 60000); // Check every minute

    this.shiftTimers.set(shiftId, monitoringInterval);

    logger.info(`Started monitoring shift ${shiftId}`);
  }

  /**
   * Stop monitoring a shift
   */
  stopShiftMonitoring(shiftId) {
    const timer = this.shiftTimers.get(shiftId);
    if (timer) {
      clearInterval(timer);
      this.shiftTimers.delete(shiftId);
    }
    
    this.activeShifts.delete(shiftId);
    logger.info(`Stopped monitoring shift ${shiftId}`);
  }

  /**
   * Monitor shift status and trigger alerts
   */
  async monitorShiftStatus(shiftId) {
    try {
      const shiftData = this.activeShifts.get(shiftId);
      if (!shiftData) return;

      const now = new Date();
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          agent: {
            include: {
              user: {
                select: { id: true, username: true, profile: true },
              },
            },
          },
          attendance: {
            where: { clockOutTime: null },
          },
        },
      });

      if (!shift) {
        this.stopShiftMonitoring(shiftId);
        return;
      }

      // Check for various alert conditions
      await this.checkShiftAlerts(shift, shiftData);

      // Update last monitoring time
      shiftData.lastUpdate = now;
      this.activeShifts.set(shiftId, shiftData);

    } catch (error) {
      logger.error(`Failed to monitor shift ${shiftId}:`, error);
    }
  }

  /**
   * Check for shift alerts and escalations
   */
  async checkShiftAlerts(shift, shiftData) {
    const now = new Date();
    const alerts = [];

    // Check if shift should have started but agent hasn't clocked in
    if (shift.status === 'CONFIRMED' && now > new Date(shift.startTime)) {
      const minutesLate = (now.getTime() - new Date(shift.startTime).getTime()) / (1000 * 60);
      
      if (minutesLate > 15 && !shiftData.alerts.includes('LATE_START')) {
        alerts.push({
          type: 'LATE_START',
          severity: minutesLate > 30 ? 'HIGH' : 'MEDIUM',
          message: `Agent is ${minutesLate.toFixed(0)} minutes late for shift start`,
          timestamp: now,
        });
        shiftData.alerts.push('LATE_START');
      }
    }

    // Check if agent is on extended break
    const activeBreak = await this.prisma.break.findFirst({
      where: {
        shiftId: shift.id,
        endTime: null,
      },
    });

    if (activeBreak) {
      const breakDuration = (now.getTime() - activeBreak.startTime.getTime()) / (1000 * 60);
      const maxBreakDuration = activeBreak.breakType === 'LUNCH' ? 60 : 30; // minutes
      
      if (breakDuration > maxBreakDuration && !shiftData.alerts.includes('EXTENDED_BREAK')) {
        alerts.push({
          type: 'EXTENDED_BREAK',
          severity: 'MEDIUM',
          message: `Agent on extended ${activeBreak.breakType.toLowerCase()} break (${breakDuration.toFixed(0)} minutes)`,
          timestamp: now,
        });
        shiftData.alerts.push('EXTENDED_BREAK');
      }
    }

    // Send alerts if any
    for (const alert of alerts) {
      await this.sendShiftAlert(shift, alert);
    }
  }

  /**
   * Send shift alert to supervisors
   */
  async sendShiftAlert(shift, alert) {
    try {
      // Send notification to supervisors
      await this.notificationService.sendNotification({
        recipientId: shift.supervisorId,
        type: 'SHIFT_ALERT',
        title: `Shift Alert: ${alert.type.replace('_', ' ')}`,
        message: alert.message,
        data: {
          shiftId: shift.id,
          agentId: shift.agentId,
          alertType: alert.type,
          severity: alert.severity,
        },
        channels: ['PUSH', 'EMAIL'],
        priority: alert.severity === 'HIGH' ? 'HIGH' : 'NORMAL',
      });

      // Emit real-time alert
      this.webSocketService.emitToRole('SUPERVISOR', 'shift_alert', {
        shift,
        alert,
        agent: shift.agent,
      });

      logger.warn('Shift alert sent', {
        shiftId: shift.id,
        agentId: shift.agentId,
        alertType: alert.type,
        severity: alert.severity,
      });
    } catch (error) {
      logger.error('Failed to send shift alert:', error);
    }
  }

  /**
   * Validate shift location
   */
  async validateShiftLocation(location, site, action) {
    if (!site.coordinates) {
      return { valid: true, note: 'No geofence configured for site' };
    }

    const siteCoords = this.parseCoordinates(site.coordinates);
    const distance = this.calculateDistance(
      location.latitude,
      location.longitude,
      siteCoords.latitude,
      siteCoords.longitude
    );

    const allowedRadius = site.geofenceRadius || 100; // meters
    const valid = distance <= allowedRadius;

    return {
      valid,
      distance,
      allowedRadius,
      error: valid ? null : `${action} location is ${Math.round(distance)}m from site (allowed: ${allowedRadius}m)`,
    };
  }

  /**
   * Get active shift for agent
   */
  async getActiveShift(agentId, shiftId) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        agent: {
          include: {
            user: {
              select: { id: true, username: true, profile: true },
            },
          },
        },
        site: {
          select: { id: true, name: true, coordinates: true, geofenceRadius: true },
        },
      },
    });

    if (!shift) {
      throw new Error('Shift not found');
    }

    if (shift.agentId !== agentId) {
      throw new Error('Agent not assigned to this shift');
    }

    if (shift.status !== 'IN_PROGRESS') {
      throw new Error(`Shift is not active (status: ${shift.status})`);
    }

    return shift;
  }

  /**
   * Update shift status in monitoring
   */
  updateShiftStatus(shiftId, status) {
    const shiftData = this.activeShifts.get(shiftId);
    if (shiftData) {
      shiftData.status = status;
      shiftData.lastUpdate = new Date();
      this.activeShifts.set(shiftId, shiftData);
    }
  }

  /**
   * Send clock-in notifications
   */
  async sendClockInNotifications(shift, attendance, status) {
    // Notify supervisor
    if (shift.supervisorId) {
      await this.notificationService.sendNotification({
        recipientId: shift.supervisorId,
        type: 'AGENT_CLOCK_IN',
        title: 'Agent Clocked In',
        message: `${shift.agent.user.username} clocked in to ${shift.site.name} (${status})`,
        data: {
          shiftId: shift.id,
          agentId: shift.agentId,
          attendanceId: attendance.id,
          status,
        },
        channels: ['PUSH'],
        priority: status === 'LATE' ? 'HIGH' : 'NORMAL',
      });
    }

    // Notify client if configured
    if (shift.site.client.notificationSettings?.clockInAlerts) {
      await this.notificationService.sendNotification({
        recipientId: shift.site.client.userId,
        type: 'AGENT_ARRIVAL',
        title: 'Security Agent Arrived',
        message: `Security agent has arrived at ${shift.site.name}`,
        data: {
          shiftId: shift.id,
          siteName: shift.site.name,
          agentName: shift.agent.user.username,
        },
        channels: ['EMAIL'],
        priority: 'NORMAL',
      });
    }
  }

  /**
   * Send clock-out notifications
   */
  async sendClockOutNotifications(shift, attendance, status) {
    // Notify supervisor
    if (shift.supervisorId) {
      await this.notificationService.sendNotification({
        recipientId: shift.supervisorId,
        type: 'AGENT_CLOCK_OUT',
        title: 'Agent Clocked Out',
        message: `${shift.agent.user.username} clocked out from ${shift.site.name} (${attendance.hoursWorked.toFixed(1)}h worked)`,
        data: {
          shiftId: shift.id,
          agentId: shift.agentId,
          attendanceId: attendance.id,
          hoursWorked: attendance.hoursWorked,
          status,
        },
        channels: ['PUSH'],
        priority: 'NORMAL',
      });
    }
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
   * Parse coordinates from PostGIS format
   */
  parseCoordinates(coordinatesString) {
    const match = coordinatesString.match(/POINT\(([^)]+)\)/);
    if (match) {
      const [longitude, latitude] = match[1].split(' ').map(Number);
      return { latitude, longitude };
    }
    throw new Error('Invalid coordinates format');
  }
}

module.exports = RealTimeShiftManager;
