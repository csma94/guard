const logger = require('../config/logger');
const crypto = require('crypto');

/**
 * Offline Sync Service for mobile app data synchronization
 */
class OfflineSyncService {
  constructor(prisma, io = null) {
    this.prisma = prisma;
    this.io = io;
  }

  /**
   * Process offline data sync from mobile app
   */
  async processOfflineSync(agentId, syncData) {
    try {
      const {
        attendance = [],
        locationTracking = [],
        reports = [],
        mediaFiles = [],
        lastSyncTimestamp,
        deviceInfo = {}
      } = syncData;

      const syncResults = {
        success: true,
        processed: {
          attendance: 0,
          locationTracking: 0,
          reports: 0,
          mediaFiles: 0
        },
        errors: [],
        conflicts: [],
        newSyncTimestamp: new Date().toISOString()
      };

      // Verify agent exists and is active
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId },
        include: { user: true }
      });

      if (!agent || agent.user.status !== 'ACTIVE') {
        throw new Error('Agent not found or inactive');
      }

      // Prioritize data for sync based on importance and urgency
      const prioritizedData = this.prioritizeOfflineData({
        attendance,
        locationTracking,
        reports,
        mediaFiles
      });

      // Process data in priority order
      for (const dataGroup of prioritizedData) {
        switch (dataGroup.type) {
          case 'emergency_reports':
            const emergencyResults = await this.processOfflineReports(agentId, dataGroup.data, true);
            syncResults.processed.reports += emergencyResults.processed;
            syncResults.errors.push(...emergencyResults.errors);
            syncResults.conflicts.push(...emergencyResults.conflicts);
            break;

          case 'attendance':
            const attendanceResults = await this.processOfflineAttendance(agentId, dataGroup.data);
            syncResults.processed.attendance = attendanceResults.processed;
            syncResults.errors.push(...attendanceResults.errors);
            syncResults.conflicts.push(...attendanceResults.conflicts);
            break;

          case 'reports':
            const reportResults = await this.processOfflineReports(agentId, dataGroup.data);
            syncResults.processed.reports += reportResults.processed;
            syncResults.errors.push(...reportResults.errors);
            syncResults.conflicts.push(...reportResults.conflicts);
            break;

          case 'location_tracking':
            const locationResults = await this.processOfflineLocationTracking(agentId, dataGroup.data);
            syncResults.processed.locationTracking = locationResults.processed;
            syncResults.errors.push(...locationResults.errors);
            break;

          case 'media_files':
            const mediaResults = await this.processOfflineMediaFiles(agentId, dataGroup.data);
            syncResults.processed.mediaFiles = mediaResults.processed;
            syncResults.errors.push(...mediaResults.errors);
            break;
        }
      }

      // Log sync event
      await this.logSyncEvent(agentId, syncResults, deviceInfo);

      // Send real-time notification about sync completion
      if (this.io) {
        this.io.to(`agent:${agentId}`).emit('sync_completed', {
          syncResults,
          timestamp: syncResults.newSyncTimestamp
        });
      }

      logger.info('Offline sync completed', {
        agentId,
        processed: syncResults.processed,
        errorCount: syncResults.errors.length,
        conflictCount: syncResults.conflicts.length
      });

      return syncResults;

    } catch (error) {
      logger.error('Offline sync failed:', error);
      throw error;
    }
  }

  /**
   * Prioritize offline data for sync based on importance and urgency
   */
  prioritizeOfflineData(offlineData) {
    const prioritizedQueue = [];

    // Priority 1: Emergency reports (highest priority)
    if (offlineData.reports && offlineData.reports.length > 0) {
      const emergencyReports = offlineData.reports.filter(report =>
        report.reportType === 'INCIDENT' &&
        (report.priority === 'HIGH' || report.priority === 'CRITICAL')
      );
      if (emergencyReports.length > 0) {
        prioritizedQueue.push({
          type: 'emergency_reports',
          priority: 1,
          data: emergencyReports
        });
      }
    }

    // Priority 2: Attendance records (time-sensitive)
    if (offlineData.attendance && offlineData.attendance.length > 0) {
      prioritizedQueue.push({
        type: 'attendance',
        priority: 2,
        data: offlineData.attendance
      });
    }

    // Priority 3: Regular reports
    if (offlineData.reports && offlineData.reports.length > 0) {
      const regularReports = offlineData.reports.filter(report =>
        !(report.reportType === 'INCIDENT' &&
          (report.priority === 'HIGH' || report.priority === 'CRITICAL'))
      );
      if (regularReports.length > 0) {
        prioritizedQueue.push({
          type: 'reports',
          priority: 3,
          data: regularReports
        });
      }
    }

    // Priority 4: Location tracking (bulk data)
    if (offlineData.locationTracking && offlineData.locationTracking.length > 0) {
      prioritizedQueue.push({
        type: 'location_tracking',
        priority: 4,
        data: offlineData.locationTracking
      });
    }

    // Priority 5: Media files (largest data, lowest priority)
    if (offlineData.mediaFiles && offlineData.mediaFiles.length > 0) {
      prioritizedQueue.push({
        type: 'media_files',
        priority: 5,
        data: offlineData.mediaFiles
      });
    }

    // Sort by priority
    return prioritizedQueue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Process offline attendance records
   */
  async processOfflineAttendance(agentId, attendanceRecords) {
    const results = {
      processed: 0,
      errors: [],
      conflicts: []
    };

    for (const record of attendanceRecords) {
      try {
        const {
          offlineId,
          shiftId,
          clockInTime,
          clockOutTime,
          clockInLocation,
          clockOutLocation,
          clockInMethod,
          clockOutMethod,
          qrCodeScanned,
          notes,
          timestamp
        } = record;

        // Check if record already exists
        const existingRecord = await this.prisma.attendance.findFirst({
          where: {
            shiftId,
            agentId,
            OR: [
              { clockInTime: clockInTime ? new Date(clockInTime) : undefined },
              { clockOutTime: clockOutTime ? new Date(clockOutTime) : undefined }
            ]
          }
        });

        if (existingRecord) {
          // Handle conflict - check if we need to update
          const conflict = await this.resolveAttendanceConflict(
            existingRecord,
            record,
            agentId
          );
          if (conflict) {
            results.conflicts.push(conflict);
          }
          continue;
        }

        // Validate shift exists and belongs to agent
        const shift = await this.prisma.shift.findFirst({
          where: {
            id: shiftId,
            agentId,
            deletedAt: null
          }
        });

        if (!shift) {
          results.errors.push({
            offlineId,
            error: 'Shift not found or not assigned to agent',
            record
          });
          continue;
        }

        // Calculate total hours if both times provided
        let totalHours = null;
        let overtimeHours = 0;

        if (clockInTime && clockOutTime) {
          const clockIn = new Date(clockInTime);
          const clockOut = new Date(clockOutTime);
          totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
          
          // Calculate overtime
          const scheduledHours = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
          overtimeHours = Math.max(0, totalHours - scheduledHours);
        }

        // Create attendance record
        await this.prisma.attendance.create({
          data: {
            shiftId,
            agentId,
            clockInTime: clockInTime ? new Date(clockInTime) : null,
            clockOutTime: clockOutTime ? new Date(clockOutTime) : null,
            clockInLocation: clockInLocation ? 
              `POINT(${clockInLocation.longitude} ${clockInLocation.latitude})` : null,
            clockOutLocation: clockOutLocation ? 
              `POINT(${clockOutLocation.longitude} ${clockOutLocation.latitude})` : null,
            clockInMethod: clockInMethod || 'GPS',
            clockOutMethod: clockOutMethod || 'GPS',
            qrCodeScanned,
            totalHours,
            overtimeHours,
            status: clockOutTime ? 'CLOCKED_OUT' : 'CLOCKED_IN',
            notes
          }
        });

        // Update shift status if needed
        if (clockInTime && shift.status === 'SCHEDULED') {
          await this.prisma.shift.update({
            where: { id: shiftId },
            data: { status: 'IN_PROGRESS' }
          });
        }

        if (clockOutTime && shift.status === 'IN_PROGRESS') {
          await this.prisma.shift.update({
            where: { id: shiftId },
            data: { status: 'COMPLETED' }
          });
        }

        results.processed++;

      } catch (error) {
        results.errors.push({
          offlineId: record.offlineId,
          error: error.message,
          record
        });
      }
    }

    return results;
  }

  /**
   * Process offline location tracking data
   */
  async processOfflineLocationTracking(agentId, locationRecords) {
    const results = {
      processed: 0,
      errors: []
    };

    // Sort by timestamp to maintain chronological order
    const sortedRecords = locationRecords.sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    for (const record of sortedRecords) {
      try {
        const {
          offlineId,
          shiftId,
          coordinates,
          accuracy,
          altitude,
          speed,
          heading,
          timestamp,
          batteryLevel,
          isMockLocation
        } = record;

        // Check for duplicate based on timestamp and coordinates
        const existingRecord = await this.prisma.locationTracking.findFirst({
          where: {
            agentId,
            timestamp: new Date(timestamp),
            coordinates: `POINT(${coordinates.longitude} ${coordinates.latitude})`
          }
        });

        if (existingRecord) {
          continue; // Skip duplicate
        }

        // Validate coordinates
        if (!coordinates || !coordinates.latitude || !coordinates.longitude) {
          results.errors.push({
            offlineId,
            error: 'Invalid coordinates',
            record
          });
          continue;
        }

        // Create location tracking record
        await this.prisma.locationTracking.create({
          data: {
            agentId,
            shiftId,
            coordinates: `POINT(${coordinates.longitude} ${coordinates.latitude})`,
            accuracy,
            altitude,
            speed,
            heading,
            timestamp: new Date(timestamp),
            batteryLevel,
            isMockLocation: isMockLocation || false
          }
        });

        results.processed++;

      } catch (error) {
        results.errors.push({
          offlineId: record.offlineId,
          error: error.message,
          record
        });
      }
    }

    return results;
  }

  /**
   * Process offline reports
   */
  async processOfflineReports(agentId, reportRecords) {
    const results = {
      processed: 0,
      errors: [],
      conflicts: []
    };

    for (const record of reportRecords) {
      try {
        const {
          offlineId,
          shiftId,
          siteId,
          reportType,
          title,
          content,
          observations,
          incidents,
          weatherConditions,
          equipmentStatus,
          priority,
          mediaFileIds,
          timestamp
        } = record;

        // Check for existing report with same offline ID or similar content
        const existingReport = await this.prisma.report.findFirst({
          where: {
            agentId,
            shiftId,
            title,
            createdAt: {
              gte: new Date(new Date(timestamp).getTime() - 5 * 60 * 1000), // 5 minutes tolerance
              lte: new Date(new Date(timestamp).getTime() + 5 * 60 * 1000)
            }
          }
        });

        if (existingReport) {
          results.conflicts.push({
            offlineId,
            existingReportId: existingReport.id,
            message: 'Similar report already exists',
            record
          });
          continue;
        }

        // Validate shift and site
        const shift = await this.prisma.shift.findFirst({
          where: {
            id: shiftId,
            agentId,
            siteId,
            deletedAt: null
          }
        });

        if (!shift) {
          results.errors.push({
            offlineId,
            error: 'Shift not found or invalid',
            record
          });
          continue;
        }

        // Create report
        const report = await this.prisma.report.create({
          data: {
            shiftId,
            siteId,
            agentId,
            reportType,
            title,
            content,
            observations,
            incidents: incidents || [],
            weatherConditions,
            equipmentStatus,
            status: 'SUBMITTED',
            submittedAt: new Date(timestamp),
            priority: priority || 'NORMAL',
            createdAt: new Date(timestamp)
          }
        });

        // Link media files if provided
        if (mediaFileIds && mediaFileIds.length > 0) {
          await this.linkMediaFilesToReport(report.id, mediaFileIds);
        }

        results.processed++;

      } catch (error) {
        results.errors.push({
          offlineId: record.offlineId,
          error: error.message,
          record
        });
      }
    }

    return results;
  }

  /**
   * Process offline media files
   */
  async processOfflineMediaFiles(agentId, mediaFileRecords) {
    const results = {
      processed: 0,
      errors: []
    };

    for (const record of mediaFileRecords) {
      try {
        const {
          offlineId,
          filename,
          originalFilename,
          base64Data,
          mimeType,
          fileType,
          description,
          location,
          timestamp
        } = record;

        // Check if file already exists
        const existingFile = await this.prisma.mediaFile.findFirst({
          where: {
            uploadedBy: agentId,
            originalFilename,
            createdAt: {
              gte: new Date(new Date(timestamp).getTime() - 60 * 1000), // 1 minute tolerance
              lte: new Date(new Date(timestamp).getTime() + 60 * 1000)
            }
          }
        });

        if (existingFile) {
          continue; // Skip duplicate
        }

        // Decode and save file
        const fileBuffer = Buffer.from(base64Data, 'base64');
        const fileSize = fileBuffer.length;
        
        // Generate unique filename
        const uniqueFilename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}_${filename}`;
        const filePath = `uploads/${uniqueFilename}`;

        // Save file to storage (implement your storage logic here)
        await this.saveFileToStorage(filePath, fileBuffer);

        // Create media file record
        await this.prisma.mediaFile.create({
          data: {
            filename: uniqueFilename,
            originalFilename,
            filePath,
            fileSize,
            mimeType,
            fileType,
            description,
            location: location ? 
              `POINT(${location.longitude} ${location.latitude})` : null,
            timestamp: timestamp ? new Date(timestamp) : null,
            uploadedBy: agentId,
            createdAt: new Date(timestamp)
          }
        });

        results.processed++;

      } catch (error) {
        results.errors.push({
          offlineId: record.offlineId,
          error: error.message,
          record
        });
      }
    }

    return results;
  }

  /**
   * Get sync data for mobile app
   */
  async getSyncData(agentId, lastSyncTimestamp = null) {
    try {
      const cutoffTime = lastSyncTimestamp ? 
        new Date(lastSyncTimestamp) : 
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

      // Get agent's shifts
      const shifts = await this.prisma.shift.findMany({
        where: {
          agentId,
          updatedAt: { gte: cutoffTime },
          deletedAt: null
        },
        include: {
          site: {
            select: {
              id: true,
              name: true,
              address: true,
              coordinates: true,
              geofenceRadius: true,
              accessInstructions: true,
              emergencyContacts: true
            }
          }
        },
        orderBy: { startTime: 'desc' }
      });

      // Get report templates
      const reportTemplates = await this.prisma.reportTemplate.findMany({
        where: {
          isActive: true,
          OR: [
            { isPublic: true },
            { siteId: { in: shifts.map(s => s.siteId) } }
          ]
        }
      });

      // Get agent's recent reports
      const reports = await this.prisma.report.findMany({
        where: {
          agentId,
          updatedAt: { gte: cutoffTime },
          deletedAt: null
        },
        include: {
          mediaFiles: {
            select: {
              id: true,
              filename: true,
              fileType: true,
              description: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return {
        shifts,
        reportTemplates,
        reports,
        syncTimestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get sync data:', error);
      throw error;
    }
  }

  // Helper methods

  async resolveAttendanceConflict(existingRecord, newRecord, agentId) {
    const conflictResolution = {
      type: 'attendance_conflict',
      existingRecordId: existingRecord.id,
      offlineId: newRecord.offlineId,
      resolution: null,
      reason: null,
      mergedData: null
    };

    // Conflict resolution strategies
    const strategies = {
      // Strategy 1: Timestamp-based resolution
      timestamp: () => {
        const existingTime = new Date(existingRecord.clockInTime || existingRecord.clockOutTime);
        const newTime = new Date(newRecord.clockInTime || newRecord.clockOutTime);
        return newTime > existingTime ? 'new' : 'existing';
      },

      // Strategy 2: Data completeness resolution
      completeness: () => {
        const existingFields = this.countNonNullFields(existingRecord);
        const newFields = this.countNonNullFields(newRecord);
        return newFields > existingFields ? 'new' : 'existing';
      },

      // Strategy 3: GPS accuracy resolution
      accuracy: () => {
        const existingAccuracy = existingRecord.clockInLocation?.accuracy || 0;
        const newAccuracy = newRecord.clockInLocation?.accuracy || 0;
        return newAccuracy > existingAccuracy ? 'new' : 'existing';
      }
    };

    // Apply resolution strategy based on conflict type
    let preferredRecord = 'existing';
    let mergeRequired = false;

    // Check if this is a partial update (only clock-out when clock-in exists)
    if (existingRecord.clockInTime && !existingRecord.clockOutTime && newRecord.clockOutTime) {
      // This is a clock-out for existing clock-in - merge the data
      mergeRequired = true;
      preferredRecord = 'merge';
    } else {
      // Use timestamp strategy as primary
      preferredRecord = strategies.timestamp();

      // If timestamps are very close (within 1 minute), use completeness strategy
      const timeDiff = Math.abs(
        new Date(existingRecord.clockInTime || existingRecord.clockOutTime) -
        new Date(newRecord.clockInTime || newRecord.clockOutTime)
      );

      if (timeDiff < 60000) { // 1 minute
        preferredRecord = strategies.completeness();
      }
    }

    // Execute resolution
    if (preferredRecord === 'new' || mergeRequired) {
      const updateData = mergeRequired ? {
        // Merge existing clock-in with new clock-out
        clockOutTime: newRecord.clockOutTime ? new Date(newRecord.clockOutTime) : null,
        clockOutLocation: newRecord.clockOutLocation ?
          `POINT(${newRecord.clockOutLocation.longitude} ${newRecord.clockOutLocation.latitude})` : null,
        clockOutMethod: newRecord.clockOutMethod || existingRecord.clockOutMethod,
        status: 'CLOCKED_OUT',
        notes: [existingRecord.notes, newRecord.notes].filter(Boolean).join('; ')
      } : {
        // Replace with new record
        clockInTime: newRecord.clockInTime ? new Date(newRecord.clockInTime) : existingRecord.clockInTime,
        clockOutTime: newRecord.clockOutTime ? new Date(newRecord.clockOutTime) : existingRecord.clockOutTime,
        clockInLocation: newRecord.clockInLocation ?
          `POINT(${newRecord.clockInLocation.longitude} ${newRecord.clockInLocation.latitude})` :
          existingRecord.clockInLocation,
        clockOutLocation: newRecord.clockOutLocation ?
          `POINT(${newRecord.clockOutLocation.longitude} ${newRecord.clockOutLocation.latitude})` :
          existingRecord.clockOutLocation,
        clockInMethod: newRecord.clockInMethod || existingRecord.clockInMethod,
        clockOutMethod: newRecord.clockOutMethod || existingRecord.clockOutMethod,
        notes: newRecord.notes || existingRecord.notes
      };

      // Calculate total hours if both times are present
      if (updateData.clockInTime && updateData.clockOutTime) {
        const totalHours = (updateData.clockOutTime.getTime() - updateData.clockInTime.getTime()) / (1000 * 60 * 60);
        updateData.totalHours = totalHours;
      }

      await this.prisma.attendance.update({
        where: { id: existingRecord.id },
        data: updateData
      });

      conflictResolution.resolution = mergeRequired ? 'merged' : 'updated_with_new';
      conflictResolution.reason = mergeRequired ?
        'Merged clock-out with existing clock-in' :
        'New record preferred based on resolution strategy';
      conflictResolution.mergedData = updateData;

      return null; // Successfully resolved, no conflict to report
    }

    conflictResolution.resolution = 'kept_existing';
    conflictResolution.reason = 'Existing record preferred based on resolution strategy';
    return conflictResolution;
  }

  /**
   * Count non-null fields in a record for completeness comparison
   */
  countNonNullFields(record) {
    const fields = ['clockInTime', 'clockOutTime', 'clockInLocation', 'clockOutLocation', 'notes'];
    return fields.filter(field => record[field] != null).length;
  }

  async linkMediaFilesToReport(reportId, mediaFileIds) {
    try {
      await this.prisma.mediaFile.updateMany({
        where: { id: { in: mediaFileIds } },
        data: { reportId }
      });
    } catch (error) {
      logger.error('Failed to link media files to report:', error);
    }
  }

  async saveFileToStorage(filePath, fileBuffer) {
    // Implement your file storage logic here
    // This could be local filesystem, AWS S3, etc.
    const fs = require('fs').promises;
    const path = require('path');
    
    const fullPath = path.join(process.cwd(), filePath);
    const dir = path.dirname(fullPath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // Save file
    await fs.writeFile(fullPath, fileBuffer);
  }

  async logSyncEvent(agentId, syncResults, deviceInfo) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: agentId,
          action: 'OFFLINE_SYNC',
          tableName: 'sync_events',
          recordId: agentId,
          newValues: {
            syncResults,
            deviceInfo,
            timestamp: new Date()
          },
          ipAddress: null,
          userAgent: 'mobile_app'
        }
      });
    } catch (error) {
      logger.error('Failed to log sync event:', error);
    }
  }
  /**
   * Enhanced conflict resolution with multiple strategies
   */
  async resolveDataConflict(serverData, clientData, entityType, conflictStrategy = 'auto') {
    const strategies = {
      // Server data takes precedence
      server_wins: () => serverData,

      // Client data takes precedence
      client_wins: () => clientData,

      // Last modification time wins
      last_write_wins: () => {
        const serverTime = new Date(serverData.updatedAt || serverData.createdAt);
        const clientTime = new Date(clientData.timestamp || clientData.updatedAt);
        return clientTime > serverTime ? clientData : serverData;
      },

      // Merge non-conflicting fields
      merge: () => {
        const merged = { ...serverData };
        for (const [key, value] of Object.entries(clientData)) {
          if (key !== 'id' && key !== 'createdAt' && value !== undefined) {
            merged[key] = value;
          }
        }
        return merged;
      },

      // Business logic based resolution
      auto: () => {
        switch (entityType) {
          case 'attendance':
            // For attendance, prefer client data if server hasn't been manually modified
            return serverData.modifiedBy ? serverData : clientData;

          case 'report':
            // For reports, prefer client data if not yet approved
            return serverData.status === 'APPROVED' ? serverData : clientData;

          case 'location':
            // For location, always prefer client data (more recent)
            return clientData;

          default:
            return strategies.last_write_wins();
        }
      }
    };

    const resolver = strategies[conflictStrategy] || strategies.auto;
    const resolved = resolver();

    // Log conflict resolution
    await this.logConflictResolution(entityType, conflictStrategy, {
      server: serverData,
      client: clientData,
      resolved
    });

    return resolved;
  }

  /**
   * Advanced queue management for offline operations
   */
  async manageOfflineQueue(agentId, operation, data) {
    try {
      const queueKey = `offline_queue:${agentId}`;
      const queueItem = {
        id: crypto.randomUUID(),
        operation,
        data,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        priority: this.calculateOperationPriority(operation, data)
      };

      // Add to Redis queue with priority (if Redis is available)
      if (this.redis) {
        await this.redis.zadd(queueKey, queueItem.priority, JSON.stringify(queueItem));
        await this.redis.expire(queueKey, 7 * 24 * 60 * 60);
      }

      logger.info('Operation queued for offline sync', {
        agentId,
        operation,
        priority: queueItem.priority,
        queueId: queueItem.id
      });

      return queueItem.id;
    } catch (error) {
      logger.error('Failed to queue offline operation', {
        agentId,
        operation,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate operation priority for queue management
   */
  calculateOperationPriority(operation, data) {
    const basePriorities = {
      emergency_report: 100,
      attendance: 80,
      incident_report: 70,
      regular_report: 50,
      location_update: 30,
      media_upload: 20
    };

    let priority = basePriorities[operation] || 40;

    // Adjust priority based on data characteristics
    if (data.priority === 'CRITICAL') priority += 20;
    if (data.priority === 'HIGH') priority += 10;
    if (data.isEmergency) priority += 30;
    if (data.timestamp && Date.now() - new Date(data.timestamp).getTime() > 24 * 60 * 60 * 1000) {
      priority -= 10; // Lower priority for old data
    }

    return Math.max(1, Math.min(100, priority));
  }

  /**
   * Get deleted items since last sync
   */
  async getDeletedItemsSinceSync(agentId, syncTimestamp) {
    try {
      const deletedItems = [];

      // Get deleted shifts
      const deletedShifts = await this.prisma.shift.findMany({
        where: {
          agentId,
          deletedAt: { gt: syncTimestamp, not: null }
        },
        select: { id: true, deletedAt: true }
      });

      deletedItems.push(...deletedShifts.map(item => ({
        type: 'shift',
        id: item.id,
        deletedAt: item.deletedAt
      })));

      // Get deleted reports
      const deletedReports = await this.prisma.report.findMany({
        where: {
          agentId,
          deletedAt: { gt: syncTimestamp, not: null }
        },
        select: { id: true, deletedAt: true }
      });

      deletedItems.push(...deletedReports.map(item => ({
        type: 'report',
        id: item.id,
        deletedAt: item.deletedAt
      })));

      return deletedItems;
    } catch (error) {
      logger.error('Failed to get deleted items', { agentId, error: error.message });
      return [];
    }
  }

  /**
   * Get queue status for agent
   */
  async getQueueStatus(agentId) {
    try {
      if (!this.redis) {
        return { pending: 0, failed: 0 };
      }

      const queueKey = `offline_queue:${agentId}`;
      const failedQueueKey = `offline_failed:${agentId}`;

      const [pending, failed] = await Promise.all([
        this.redis.zcard(queueKey),
        this.redis.llen(failedQueueKey)
      ]);

      return { pending, failed };
    } catch (error) {
      logger.error('Failed to get queue status', { agentId, error: error.message });
      return { pending: 0, failed: 0 };
    }
  }

  /**
   * Move failed operation to failed queue
   */
  async moveToFailedQueue(agentId, queueItem) {
    try {
      if (!this.redis) return;

      const failedQueueKey = `offline_failed:${agentId}`;
      const failedItem = {
        ...queueItem,
        failedAt: Date.now(),
        finalError: 'Max retries exceeded'
      };

      await this.redis.lpush(failedQueueKey, JSON.stringify(failedItem));
      await this.redis.expire(failedQueueKey, 30 * 24 * 60 * 60); // 30 days

      logger.warn('Operation moved to failed queue', {
        agentId,
        operation: queueItem.operation,
        queueId: queueItem.id
      });
    } catch (error) {
      logger.error('Failed to move item to failed queue', {
        agentId,
        error: error.message
      });
    }
  }

  /**
   * Log conflict resolution for audit purposes
   */
  async logConflictResolution(entityType, strategy, conflictData) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'OFFLINE_SYNC_CONFLICT_RESOLVED',
          details: {
            entityType,
            strategy,
            conflictData
          },
          ipAddress: 'offline-sync',
          userAgent: 'mobile-app'
        }
      });
    } catch (error) {
      logger.error('Failed to log conflict resolution', { error: error.message });
    }
  }
}

module.exports = OfflineSyncService;
