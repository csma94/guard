import NetInfo from '@react-native-community/netinfo';
import BackgroundJob from 'react-native-background-job';
import { AppState } from 'react-native';

import { apiClient } from './api';
import offlineStorageService, { OfflineRecord, SyncConflict } from './offlineStorageService';
import { logger } from '../utils/logger';
import { store } from '../store';

export interface SyncResult {
  success: boolean;
  syncedRecords: number;
  failedRecords: number;
  conflicts: number;
  errors: string[];
}

export interface SyncOptions {
  batchSize?: number;
  maxRetries?: number;
  priorityOnly?: boolean;
  tables?: string[];
  conflictResolution?: 'CLIENT_WINS' | 'SERVER_WINS' | 'MERGE' | 'MANUAL';
}

class SyncService {
  private static instance: SyncService;
  private isSyncing = false;
  private syncQueue: OfflineRecord[] = [];
  private networkState: any = null;
  private backgroundSyncEnabled = true;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;
  private syncListeners: Function[] = [];

  private constructor() {
    this.initializeNetworkMonitoring();
    this.initializeBackgroundSync();
  }

  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  private initializeNetworkMonitoring(): void {
    NetInfo.addEventListener(state => {
      const wasConnected = this.networkState?.isConnected;
      this.networkState = state;
      
      logger.info('Network state changed:', {
        isConnected: state.isConnected,
        type: state.type,
        isInternetReachable: state.isInternetReachable,
      });

      // Trigger sync when connection is restored
      if (!wasConnected && state.isConnected && state.isInternetReachable) {
        this.triggerSync({ priorityOnly: false });
      }
    });
  }

  private initializeBackgroundSync(): void {
    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      if (this.shouldPerformBackgroundSync()) {
        this.triggerSync({ priorityOnly: true });
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    // Listen for app state changes
    AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && this.lastSyncTime) {
        const timeSinceLastSync = Date.now() - this.lastSyncTime.getTime();
        // Sync if it's been more than 10 minutes since last sync
        if (timeSinceLastSync > 10 * 60 * 1000) {
          this.triggerSync({ priorityOnly: false });
        }
      }
    });
  }

  private shouldPerformBackgroundSync(): boolean {
    return (
      this.backgroundSyncEnabled &&
      this.networkState?.isConnected &&
      this.networkState?.isInternetReachable &&
      !this.isSyncing
    );
  }

  public async triggerSync(options: SyncOptions = {}): Promise<SyncResult> {
    if (this.isSyncing) {
      logger.warn('Sync already in progress');
      return {
        success: false,
        syncedRecords: 0,
        failedRecords: 0,
        conflicts: 0,
        errors: ['Sync already in progress'],
      };
    }

    if (!this.networkState?.isConnected || !this.networkState?.isInternetReachable) {
      logger.warn('No internet connection available for sync');
      return {
        success: false,
        syncedRecords: 0,
        failedRecords: 0,
        conflicts: 0,
        errors: ['No internet connection'],
      };
    }

    this.isSyncing = true;
    this.lastSyncTime = new Date();
    
    try {
      logger.info('Starting data synchronization', options);
      this.notifyListeners('sync_started', options);

      const result = await this.performSync(options);
      
      logger.info('Sync completed', result);
      this.notifyListeners('sync_completed', result);
      
      return result;
    } catch (error) {
      logger.error('Sync failed:', error);
      const errorResult: SyncResult = {
        success: false,
        syncedRecords: 0,
        failedRecords: 0,
        conflicts: 0,
        errors: [error instanceof Error ? error.message : 'Unknown sync error'],
      };
      
      this.notifyListeners('sync_failed', errorResult);
      return errorResult;
    } finally {
      this.isSyncing = false;
    }
  }

  private async performSync(options: SyncOptions): Promise<SyncResult> {
    const {
      batchSize = 20,
      maxRetries = 3,
      priorityOnly = false,
      tables,
      conflictResolution = 'SERVER_WINS',
    } = options;

    let syncedRecords = 0;
    let failedRecords = 0;
    let conflicts = 0;
    const errors: string[] = [];

    try {
      // Get unsynced records
      const unsyncedRecords = await offlineStorageService.getUnsyncedRecords(batchSize * 2);
      
      // Filter records based on options
      let recordsToSync = unsyncedRecords;
      
      if (priorityOnly) {
        recordsToSync = recordsToSync.filter(record => 
          record.priority === 'HIGH' || record.priority === 'CRITICAL'
        );
      }
      
      if (tables && tables.length > 0) {
        recordsToSync = recordsToSync.filter(record => 
          tables.includes(record.table)
        );
      }

      // Process records in batches
      for (let i = 0; i < recordsToSync.length; i += batchSize) {
        const batch = recordsToSync.slice(i, i + batchSize);
        const batchResult = await this.syncBatch(batch, conflictResolution, maxRetries);
        
        syncedRecords += batchResult.synced;
        failedRecords += batchResult.failed;
        conflicts += batchResult.conflicts;
        errors.push(...batchResult.errors);
      }

      // Clean up old data
      await offlineStorageService.cleanupExpiredData();

      return {
        success: failedRecords === 0,
        syncedRecords,
        failedRecords,
        conflicts,
        errors,
      };
    } catch (error) {
      logger.error('Error during sync:', error);
      throw error;
    }
  }

  private async syncBatch(
    records: OfflineRecord[],
    conflictResolution: string,
    maxRetries: number
  ): Promise<{
    synced: number;
    failed: number;
    conflicts: number;
    errors: string[];
  }> {
    let synced = 0;
    let failed = 0;
    let conflicts = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        const result = await this.syncRecord(record, conflictResolution, maxRetries);
        
        if (result.success) {
          await offlineStorageService.markRecordAsSynced(record.id);
          synced++;
        } else if (result.conflict) {
          conflicts++;
        } else {
          await offlineStorageService.incrementSyncAttempts(record.id);
          failed++;
          if (result.error) {
            errors.push(result.error);
          }
        }
      } catch (error) {
        logger.error(`Failed to sync record ${record.id}:`, error);
        await offlineStorageService.incrementSyncAttempts(record.id);
        failed++;
        errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    return { synced, failed, conflicts, errors };
  }

  private async syncRecord(
    record: OfflineRecord,
    conflictResolution: string,
    maxRetries: number
  ): Promise<{
    success: boolean;
    conflict: boolean;
    error?: string;
  }> {
    // Skip if too many attempts
    if (record.syncAttempts >= maxRetries) {
      return {
        success: false,
        conflict: false,
        error: `Max retry attempts (${maxRetries}) exceeded`,
      };
    }

    try {
      let response;
      const endpoint = this.getEndpointForTable(record.table);
      
      switch (record.operation) {
        case 'CREATE':
          response = await apiClient.post(endpoint, record.data);
          break;
          
        case 'UPDATE':
          response = await apiClient.put(`${endpoint}/${record.data.id}`, record.data);
          break;
          
        case 'DELETE':
          response = await apiClient.delete(`${endpoint}/${record.data.id}`);
          break;
          
        default:
          throw new Error(`Unknown operation: ${record.operation}`);
      }

      return { success: true, conflict: false };
    } catch (error: any) {
      if (error.response?.status === 409) {
        // Conflict detected
        const conflict = await this.handleConflict(record, error.response.data, conflictResolution);
        return { success: false, conflict: true };
      }
      
      return {
        success: false,
        conflict: false,
        error: error.message || 'Sync failed',
      };
    }
  }

  private async handleConflict(
    record: OfflineRecord,
    serverData: any,
    conflictResolution: string
  ): Promise<void> {
    const conflict: Omit<SyncConflict, 'id' | 'timestamp' | 'resolved'> = {
      table: record.table,
      localData: record.data,
      serverData: serverData.current || serverData,
      conflictType: this.determineConflictType(record, serverData),
    };

    await offlineStorageService.storeConflict(conflict);

    // Auto-resolve based on strategy
    if (conflictResolution === 'SERVER_WINS') {
      // Mark as synced and use server data
      await offlineStorageService.markRecordAsSynced(record.id);
    } else if (conflictResolution === 'CLIENT_WINS') {
      // Force update with client data
      try {
        const endpoint = this.getEndpointForTable(record.table);
        await apiClient.put(`${endpoint}/${record.data.id}?force=true`, record.data);
        await offlineStorageService.markRecordAsSynced(record.id);
      } catch (error) {
        logger.error('Failed to force client data:', error);
      }
    }
    // MERGE and MANUAL require user intervention
  }

  private determineConflictType(record: OfflineRecord, serverData: any): 'UPDATE_UPDATE' | 'UPDATE_DELETE' | 'DELETE_UPDATE' {
    if (record.operation === 'DELETE' && serverData.current) {
      return 'DELETE_UPDATE';
    } else if (record.operation === 'UPDATE' && !serverData.current) {
      return 'UPDATE_DELETE';
    } else {
      return 'UPDATE_UPDATE';
    }
  }

  private getEndpointForTable(table: string): string {
    const endpoints: Record<string, string> = {
      reports: '/mobile/reports',
      shifts: '/mobile/shifts',
      locations: '/mobile/locations',
      incidents: '/mobile/incidents',
      attachments: '/mobile/attachments',
      messages: '/mobile/messages',
    };

    return endpoints[table] || `/mobile/${table}`;
  }

  public onSyncEvent(callback: Function): () => void {
    this.syncListeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.syncListeners.indexOf(callback);
      if (index > -1) {
        this.syncListeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(event: string, data: any): void {
    this.syncListeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        logger.error('Error in sync listener:', error);
      }
    });
  }

  public async forceSyncRecord(recordId: string): Promise<boolean> {
    try {
      const records = await offlineStorageService.getUnsyncedRecords(1000);
      const record = records.find(r => r.id === recordId);
      
      if (!record) {
        logger.warn('Record not found for force sync:', recordId);
        return false;
      }

      const result = await this.syncRecord(record, 'CLIENT_WINS', 1);
      
      if (result.success) {
        await offlineStorageService.markRecordAsSynced(record.id);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Force sync failed:', error);
      return false;
    }
  }

  public setBackgroundSyncEnabled(enabled: boolean): void {
    this.backgroundSyncEnabled = enabled;
    logger.info('Background sync enabled:', enabled);
  }

  public getLastSyncTime(): Date | null {
    return this.lastSyncTime;
  }

  public isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  public cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.syncListeners = [];
  }
}

export default SyncService.getInstance();
