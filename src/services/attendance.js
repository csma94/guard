const logger = require('../config/logger');
const QRCodeService = require('./qrCode');
const GeofencingService = require('./geofencing');

/**
 * Enhanced Attendance Service with QR Code and Geofencing Integration
 */
class AttendanceService {
  constructor(prisma, io = null) {
    this.prisma = prisma;
    this.io = io;
    this.qrCodeService = new QRCodeService(prisma);
    this.geofencingService = new GeofencingService(prisma, io);
  }

  /**
   * Clock in with comprehensive validation
   */
  async clockIn(agentId, shiftId, clockInData) {
    try {
      const {
        location,
        method = 'GPS',
        qrData = null,
        deviceInfo = {},
        notes = null
      } = clockInData;

      // Validate shift exists and agent is assigned
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          site: {
            include: { client: true }
          },
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

      if (shift.status !== 'CONFIRMED' && shift.status !== 'SCHEDULED') {
        throw new Error(`Cannot clock in to shift with status: ${shift.status}`);
      }

      // Check if already clocked in
      const existingAttendance = await this.prisma.attendance.findFirst({
        where: {
          shiftId,
          agentId,
          clockOutTime: null
        }
      });

      if (existingAttendance) {
        throw new Error('Already clocked in to this shift');
      }

      // Validate location and method
      const validationResult = await this.validateClockInLocation(
        shift.siteId,
        location,
        method,
        qrData
      );

      if (!validationResult.valid) {
        throw new Error(validationResult.error);
      }

      // Create attendance record
      const attendance = await this.prisma.attendance.create({
        data: {
          shiftId,
          agentId,
          clockInTime: new Date(),
          clockInLocation: location ? `POINT(${location.longitude} ${location.latitude})` : null,
          clockInMethod: method,
          qrCodeScanned: validationResult.qrCodeId || null,
          status: 'CLOCKED_IN',
          notes
        }
      });

      // Update shift status
      await this.prisma.shift.update({
        where: { id: shiftId },
        data: { status: 'IN_PROGRESS' }
      });

      // Log attendance event
      await this.logAttendanceEvent('CLOCK_IN', attendance, {
        validationResult,
        deviceInfo,
        location
      });

      // Send real-time notification
      if (this.io) {
        this.io.to('role:supervisor').to('role:admin').emit('agent_clocked_in', {
          agentId,
          agentName: `${shift.agent.user.profile?.firstName || ''} ${shift.agent.user.profile?.lastName || ''}`.trim(),
          shiftId,
          siteId: shift.siteId,
          siteName: shift.site.name,
          clientId: shift.site.clientId,
          clockInTime: attendance.clockInTime,
          location: validationResult.location,
          method
        });
      }

      logger.info('Agent clocked in successfully', {
        agentId,
        shiftId,
        siteId: shift.siteId,
        method,
        attendanceId: attendance.id
      });

      return {
        success: true,
        attendance: {
          id: attendance.id,
          clockInTime: attendance.clockInTime,
          method: attendance.clockInMethod,
          location: validationResult.location,
          validation: validationResult
        },
        shift: {
          id: shift.id,
          site: {
            id: shift.site.id,
            name: shift.site.name
          },
          status: 'IN_PROGRESS'
        }
      };

    } catch (error) {
      logger.error('Clock in failed:', error);
      throw error;
    }
  }

  /**
   * Clock out with validation
   */
  async clockOut(agentId, shiftId, clockOutData) {
    try {
      const {
        location,
        method = 'GPS',
        qrData = null,
        deviceInfo = {},
        notes = null
      } = clockOutData;

      // Find active attendance record
      const attendance = await this.prisma.attendance.findFirst({
        where: {
          shiftId,
          agentId,
          clockOutTime: null
        },
        include: {
          shift: {
            include: {
              site: {
                include: { client: true }
              },
              agent: {
                include: { user: true }
              }
            }
          }
        }
      });

      if (!attendance) {
        throw new Error('No active clock-in found for this shift');
      }

      const shift = attendance.shift;

      // Validate location and method
      const validationResult = await this.validateClockOutLocation(
        shift.siteId,
        location,
        method,
        qrData
      );

      if (!validationResult.valid) {
        throw new Error(validationResult.error);
      }

      // Calculate total hours
      const clockOutTime = new Date();
      const totalHours = this.calculateHours(attendance.clockInTime, clockOutTime);
      const overtimeHours = this.calculateOvertimeHours(shift, totalHours);

      // Update attendance record
      const updatedAttendance = await this.prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          clockOutTime,
          clockOutLocation: location ? `POINT(${location.longitude} ${location.latitude})` : null,
          clockOutMethod: method,
          totalHours,
          overtimeHours,
          status: 'CLOCKED_OUT',
          notes: notes || attendance.notes
        }
      });

      // Update shift status
      await this.prisma.shift.update({
        where: { id: shiftId },
        data: { status: 'COMPLETED' }
      });

      // Log attendance event
      await this.logAttendanceEvent('CLOCK_OUT', updatedAttendance, {
        validationResult,
        deviceInfo,
        location,
        totalHours,
        overtimeHours
      });

      // Send real-time notification
      if (this.io) {
        this.io.to('role:supervisor').to('role:admin').emit('agent_clocked_out', {
          agentId,
          agentName: `${shift.agent.user.profile?.firstName || ''} ${shift.agent.user.profile?.lastName || ''}`.trim(),
          shiftId,
          siteId: shift.siteId,
          siteName: shift.site.name,
          clientId: shift.site.clientId,
          clockOutTime: updatedAttendance.clockOutTime,
          totalHours,
          overtimeHours,
          location: validationResult.location,
          method
        });
      }

      logger.info('Agent clocked out successfully', {
        agentId,
        shiftId,
        siteId: shift.siteId,
        method,
        totalHours,
        overtimeHours,
        attendanceId: updatedAttendance.id
      });

      return {
        success: true,
        attendance: {
          id: updatedAttendance.id,
          clockInTime: updatedAttendance.clockInTime,
          clockOutTime: updatedAttendance.clockOutTime,
          totalHours,
          overtimeHours,
          method: updatedAttendance.clockOutMethod,
          location: validationResult.location,
          validation: validationResult
        },
        shift: {
          id: shift.id,
          site: {
            id: shift.site.id,
            name: shift.site.name
          },
          status: 'COMPLETED'
        }
      };

    } catch (error) {
      logger.error('Clock out failed:', error);
      throw error;
    }
  }

  /**
   * Validate clock-in location
   */
  async validateClockInLocation(siteId, location, method, qrData) {
    try {
      const validation = {
        valid: false,
        error: null,
        location: null,
        qrCodeId: null,
        geofenceValid: false,
        qrCodeValid: false
      };

      // QR Code validation
      if (method === 'QR_CODE' && qrData) {
        try {
          const qrResult = await this.qrCodeService.verifyQRCode(qrData, location);
          
          if (qrResult.valid && qrResult.siteId === siteId) {
            validation.qrCodeValid = true;
            validation.qrCodeId = qrResult.qrCodeId;
            validation.location = location;
          } else {
            validation.error = qrResult.error || 'Invalid QR code for this site';
            return validation;
          }
        } catch (qrError) {
          validation.error = `QR code validation failed: ${qrError.message}`;
          return validation;
        }
      }

      // Geofence validation (always check if location provided)
      if (location) {
        try {
          const geofenceResult = await this.geofencingService.validateLocationInGeofence(
            siteId,
            location.latitude,
            location.longitude,
            50 // 50m tolerance for clock-in
          );

          validation.geofenceValid = geofenceResult.isWithinGeofence;
          validation.location = location;

          if (!geofenceResult.isWithinGeofence) {
            validation.error = `Location verification failed. You are ${Math.round(geofenceResult.distanceFromCenter)}m from the site (allowed: ${geofenceResult.site.geofenceRadius + 50}m)`;
            return validation;
          }
        } catch (geoError) {
          validation.error = `Location validation failed: ${geoError.message}`;
          return validation;
        }
      }

      // Manual method validation (admin/supervisor override)
      if (method === 'MANUAL') {
        validation.valid = true;
        validation.location = location;
        return validation;
      }

      // GPS method requires geofence validation
      if (method === 'GPS') {
        validation.valid = validation.geofenceValid;
        if (!validation.valid && !validation.error) {
          validation.error = 'GPS location validation required';
        }
        return validation;
      }

      // QR_CODE method requires both QR and geofence validation
      if (method === 'QR_CODE') {
        validation.valid = validation.qrCodeValid && validation.geofenceValid;
        if (!validation.valid && !validation.error) {
          validation.error = 'QR code and location validation required';
        }
        return validation;
      }

      validation.error = 'Invalid clock-in method';
      return validation;

    } catch (error) {
      logger.error('Clock-in validation failed:', error);
      return {
        valid: false,
        error: `Validation failed: ${error.message}`,
        location: null,
        qrCodeId: null,
        geofenceValid: false,
        qrCodeValid: false
      };
    }
  }

  /**
   * Validate clock-out location (similar to clock-in but with different tolerance)
   */
  async validateClockOutLocation(siteId, location, method, qrData) {
    // Use same validation logic but with higher tolerance for clock-out
    const result = await this.validateClockInLocation(siteId, location, method, qrData);
    
    // For clock-out, we're more lenient with location validation
    if (!result.valid && result.error && result.error.includes('Location verification failed')) {
      // Allow clock-out with warning if within 200m
      if (location) {
        try {
          const geofenceResult = await this.geofencingService.validateLocationInGeofence(
            siteId,
            location.latitude,
            location.longitude,
            200 // 200m tolerance for clock-out
          );

          if (geofenceResult.isWithinGeofence) {
            result.valid = true;
            result.geofenceValid = true;
            result.error = null;
            result.warning = `Clock-out location is ${Math.round(geofenceResult.distanceFromCenter)}m from site center`;
          }
        } catch (error) {
          // Keep original error
        }
      }
    }

    return result;
  }

  // Helper methods

  calculateHours(clockInTime, clockOutTime) {
    const diffMs = clockOutTime.getTime() - clockInTime.getTime();
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100; // Round to 2 decimal places
  }

  calculateOvertimeHours(shift, totalHours) {
    const scheduledHours = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
    return Math.max(0, totalHours - scheduledHours);
  }

  /**
   * Start break
   */
  async startBreak(agentId, shiftId, breakData) {
    try {
      const { breakType, location, notes } = breakData;

      // Validate active attendance
      const attendance = await this.prisma.attendance.findFirst({
        where: {
          shiftId,
          agentId,
          clockOutTime: null
        },
        include: {
          shift: {
            include: { site: true, agent: { include: { user: true } } }
          }
        }
      });

      if (!attendance) {
        throw new Error('No active shift found');
      }

      // Check for active break
      const activeBreak = await this.prisma.attendanceBreak.findFirst({
        where: {
          attendanceId: attendance.id,
          endTime: null
        }
      });

      if (activeBreak) {
        throw new Error('Break already in progress');
      }

      // Create break record
      const breakRecord = await this.prisma.attendanceBreak.create({
        data: {
          attendanceId: attendance.id,
          breakType,
          startTime: new Date(),
          startLocation: location ? `POINT(${location.longitude} ${location.latitude})` : null,
          notes
        }
      });

      // Send real-time notification
      if (this.io) {
        this.io.to('role:supervisor').to('role:admin').emit('agent_break_started', {
          agentId,
          shiftId,
          breakType,
          startTime: breakRecord.startTime,
          location
        });
      }

      logger.info('Break started', {
        agentId,
        shiftId,
        breakType,
        breakId: breakRecord.id
      });

      return {
        success: true,
        break: breakRecord,
        attendance
      };

    } catch (error) {
      logger.error('Start break failed:', error);
      throw error;
    }
  }

  /**
   * End break
   */
  async endBreak(agentId, breakId, breakData) {
    try {
      const { location, notes } = breakData;

      // Find active break
      const breakRecord = await this.prisma.attendanceBreak.findFirst({
        where: {
          id: breakId,
          endTime: null,
          attendance: {
            agentId,
            clockOutTime: null
          }
        },
        include: {
          attendance: {
            include: {
              shift: {
                include: { site: true, agent: { include: { user: true } } }
              }
            }
          }
        }
      });

      if (!breakRecord) {
        throw new Error('Active break not found');
      }

      // Calculate break duration
      const endTime = new Date();
      const durationMinutes = Math.round((endTime - breakRecord.startTime) / (1000 * 60));

      // Update break record
      const updatedBreak = await this.prisma.attendanceBreak.update({
        where: { id: breakId },
        data: {
          endTime,
          endLocation: location ? `POINT(${location.longitude} ${location.latitude})` : null,
          durationMinutes,
          notes: notes || breakRecord.notes
        }
      });

      // Send real-time notification
      if (this.io) {
        this.io.to('role:supervisor').to('role:admin').emit('agent_break_ended', {
          agentId,
          shiftId: breakRecord.attendance.shiftId,
          breakType: breakRecord.breakType,
          endTime: updatedBreak.endTime,
          durationMinutes,
          location
        });
      }

      logger.info('Break ended', {
        agentId,
        breakId,
        breakType: breakRecord.breakType,
        durationMinutes
      });

      return {
        success: true,
        break: updatedBreak,
        attendance: breakRecord.attendance
      };

    } catch (error) {
      logger.error('End break failed:', error);
      throw error;
    }
  }

  /**
   * Generate attendance analytics
   */
  async generateAttendanceAnalytics(criteria) {
    try {
      const {
        startDate,
        endDate,
        agentId,
        siteId,
        requestedBy
      } = criteria;

      const where = {
        clockInTime: {
          gte: startDate,
          lte: endDate
        }
      };

      if (agentId) where.agentId = agentId;
      if (siteId) where.shift = { siteId };

      // Get attendance records
      const attendanceRecords = await this.prisma.attendance.findMany({
        where,
        include: {
          shift: {
            include: {
              site: {
                select: { id: true, name: true }
              },
              agent: {
                include: {
                  user: {
                    select: { id: true, username: true, profile: true }
                  }
                }
              }
            }
          },
          breaks: true
        }
      });

      // Calculate metrics
      const analytics = {
        period: { startDate, endDate },
        summary: {
          totalShifts: attendanceRecords.length,
          completedShifts: attendanceRecords.filter(a => a.clockOutTime).length,
          totalHours: attendanceRecords.reduce((sum, a) => sum + (a.totalHours || 0), 0),
          totalOvertimeHours: attendanceRecords.reduce((sum, a) => sum + (a.overtimeHours || 0), 0),
          averageShiftDuration: 0,
          punctualityRate: 0,
          breakCompliance: 0
        },
        byAgent: {},
        bySite: {},
        trends: {},
        generatedAt: new Date(),
        generatedBy: requestedBy
      };

      // Calculate averages
      const completedShifts = attendanceRecords.filter(a => a.clockOutTime);
      if (completedShifts.length > 0) {
        analytics.summary.averageShiftDuration =
          analytics.summary.totalHours / completedShifts.length;
      }

      // Calculate punctuality (within 15 minutes of scheduled start)
      const punctualShifts = attendanceRecords.filter(a => {
        if (!a.clockInTime || !a.shift.startTime) return false;
        const diff = Math.abs(a.clockInTime - a.shift.startTime) / (1000 * 60);
        return diff <= 15;
      });
      analytics.summary.punctualityRate =
        (punctualShifts.length / attendanceRecords.length * 100).toFixed(1);

      // Group by agent
      const agentGroups = {};
      attendanceRecords.forEach(record => {
        const agentId = record.agentId;
        if (!agentGroups[agentId]) {
          agentGroups[agentId] = {
            agent: record.shift.agent,
            shifts: [],
            totalHours: 0,
            overtimeHours: 0,
            breaks: []
          };
        }
        agentGroups[agentId].shifts.push(record);
        agentGroups[agentId].totalHours += record.totalHours || 0;
        agentGroups[agentId].overtimeHours += record.overtimeHours || 0;
        agentGroups[agentId].breaks.push(...record.breaks);
      });

      analytics.byAgent = Object.values(agentGroups).map(group => ({
        agentId: group.agent.id,
        agentName: `${group.agent.user.profile?.firstName || ''} ${group.agent.user.profile?.lastName || ''}`.trim(),
        shiftsWorked: group.shifts.length,
        totalHours: group.totalHours,
        overtimeHours: group.overtimeHours,
        averageHours: group.totalHours / group.shifts.length,
        breaksTotal: group.breaks.length,
        punctualityRate: (group.shifts.filter(s => {
          const diff = Math.abs(s.clockInTime - s.shift.startTime) / (1000 * 60);
          return diff <= 15;
        }).length / group.shifts.length * 100).toFixed(1)
      }));

      // Group by site
      const siteGroups = {};
      attendanceRecords.forEach(record => {
        const siteId = record.shift.siteId;
        if (!siteGroups[siteId]) {
          siteGroups[siteId] = {
            site: record.shift.site,
            shifts: [],
            totalHours: 0,
            uniqueAgents: new Set()
          };
        }
        siteGroups[siteId].shifts.push(record);
        siteGroups[siteId].totalHours += record.totalHours || 0;
        siteGroups[siteId].uniqueAgents.add(record.agentId);
      });

      analytics.bySite = Object.values(siteGroups).map(group => ({
        siteId: group.site.id,
        siteName: group.site.name,
        shiftsWorked: group.shifts.length,
        totalHours: group.totalHours,
        uniqueAgents: group.uniqueAgents.size,
        averageHours: group.totalHours / group.shifts.length
      }));

      return analytics;

    } catch (error) {
      logger.error('Failed to generate attendance analytics:', error);
      throw error;
    }
  }

  async logAttendanceEvent(action, attendance, metadata) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: attendance.agentId,
          action: `ATTENDANCE_${action}`,
          tableName: 'attendance',
          recordId: attendance.id,
          newValues: {
            attendanceId: attendance.id,
            shiftId: attendance.shiftId,
            agentId: attendance.agentId,
            action,
            timestamp: new Date(),
            ...metadata
          },
          ipAddress: null,
          userAgent: 'attendance_service'
        }
      });
    } catch (error) {
      logger.error('Failed to log attendance event:', error);
    }
  }
}

module.exports = AttendanceService;
