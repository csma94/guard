import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';

import { apiClient } from './api';
import { logger } from '../utils/logger';

export interface OfflineAction {
  id: string;
  type: string;
  data: any;
  timestamp: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  retryCount: number;
  maxRetries: number;
  dependencies?: string[];
  checksum: string;
  deviceId: string;
  userId: string;
}

export interface SyncConflict {
  id: string;
  type: 'DATA_CONFLICT' | 'VERSION_CONFLICT' | 'DEPENDENCY_CONFLICT';
  localData: any;
  serverData: any;
  resolution: 'LOCAL_WINS' | 'SERVER_WINS' | 'MERGE' | 'MANUAL';
  timestamp: string;
}

export interface SyncResult {
  successful: number;
  failed: number;
  conflicts: SyncConflict[];
  errors: string[];
  duration: number;
}

class OfflineManager {
  private static instance: OfflineManager;
  private isOnline: boolean = true;
  private syncInProgress: boolean = false;
  private syncQueue: OfflineAction[] = [];
  private conflictResolver: ConflictResolver;
  private encryptionKey: string;

  private constructor() {
    this.conflictResolver = new ConflictResolver();
    this.encryptionKey = 'your-encryption-key'; // Should be generated securely
    this.initializeNetworkListener();
    this.loadOfflineQueue();
  }

  public static getInstance(): OfflineManager {
    if (!OfflineManager.instance) {
      OfflineManager.instance = new OfflineManager();
    }
    return OfflineManager.instance;
  }

  /**
   * Initialize network connectivity listener
   */
  private initializeNetworkListener(): void {
    NetInfo.addEventListener(state => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? false;

      if (wasOffline && this.isOnline) {
        // Reconnected - trigger sync
        this.handleReconnection();
      }
    });
  }

  /**
   * Queue an action for offline execution
   */
  public async queueAction(
    type: string,
    data: any,
    priority: OfflineAction['priority'] = 'NORMAL',
    dependencies?: string[]
  ): Promise<string> {
    const action: OfflineAction = {
      id: uuidv4(),
      type,
      data: this.encryptData(data),
      timestamp: new Date().toISOString(),
      priority,
      retryCount: 0,
      maxRetries: this.getMaxRetries(priority),
      dependencies,
      checksum: this.generateChecksum(data),
      deviceId: await this.getDeviceId(),
      userId: await this.getCurrentUserId(),
    };

    this.syncQueue.push(action);
    await this.persistQueue();

    // If online, try to sync immediately for high priority actions
    if (this.isOnline && (priority === 'HIGH' || priority === 'CRITICAL')) {
      this.syncOfflineData();
    }

    return action.id;
  }

  /**
   * Sync offline data with intelligent prioritization
   */
  public async syncOfflineData(): Promise<SyncResult> {
    if (this.syncInProgress || !this.isOnline) {
      return {
        successful: 0,
        failed: 0,
        conflicts: [],
        errors: ['Sync already in progress or offline'],
        duration: 0,
      };
    }

    const startTime = Date.now();
    this.syncInProgress = true;

    try {
      // Sort queue by priority and dependencies
      const sortedQueue = this.prioritizeActions(this.syncQueue);
      
      const result: SyncResult = {
        successful: 0,
        failed: 0,
        conflicts: [],
        errors: [],
        duration: 0,
      };

      // Process actions in batches
      const batchSize = 10;
      for (let i = 0; i < sortedQueue.length; i += batchSize) {
        const batch = sortedQueue.slice(i, i + batchSize);
        const batchResult = await this.processBatch(batch);
        
        result.successful += batchResult.successful;
        result.failed += batchResult.failed;
        result.conflicts.push(...batchResult.conflicts);
        result.errors.push(...batchResult.errors);
      }

      // Remove successfully processed actions
      this.syncQueue = this.syncQueue.filter(action => 
        !sortedQueue.some(processed => 
          processed.id === action.id && 
          !result.errors.some(error => error.includes(action.id))
        )
      );

      await this.persistQueue();
      result.duration = Date.now() - startTime;

      logger.info('Offline sync completed', result);
      return result;

    } catch (error) {
      logger.error('Offline sync failed:', error);
      return {
        successful: 0,
        failed: this.syncQueue.length,
        conflicts: [],
        errors: [error.message],
        duration: Date.now() - startTime,
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Process a batch of actions
   */
  private async processBatch(actions: OfflineAction[]): Promise<SyncResult> {
    const result: SyncResult = {
      successful: 0,
      failed: 0,
      conflicts: [],
      errors: [],
      duration: 0,
    };

    for (const action of actions) {
      try {
        const decryptedData = this.decryptData(action.data);
        
        // Verify data integrity
        if (!this.verifyChecksum(decryptedData, action.checksum)) {
          throw new Error('Data integrity check failed');
        }

        // Process the action
        const response = await this.executeAction(action.type, decryptedData);
        
        // Check for conflicts
        if (response.conflict) {
          const conflict = await this.conflictResolver.resolve(
            action.type,
            decryptedData,
            response.serverData
          );
          result.conflicts.push(conflict);
          
          if (conflict.resolution === 'MANUAL') {
            // Keep action in queue for manual resolution
            continue;
          }
        }

        result.successful++;
        
      } catch (error) {
        action.retryCount++;
        
        if (action.retryCount >= action.maxRetries) {
          result.failed++;
          result.errors.push(`${action.id}: ${error.message}`);
        } else {
          // Re-queue for retry with exponential backoff
          setTimeout(() => {
            this.syncQueue.push(action);
          }, Math.pow(2, action.retryCount) * 1000);
        }
      }
    }

    return result;
  }

  /**
   * Execute a specific action type
   */
  private async executeAction(type: string, data: any): Promise<any> {
    switch (type) {
      case 'CLOCK_IN':
        return await apiClient.post('/attendance/clock-in', data);
      
      case 'CLOCK_OUT':
        return await apiClient.post('/attendance/clock-out', data);
      
      case 'SUBMIT_REPORT':
        return await apiClient.post('/reports', data);
      
      case 'UPDATE_LOCATION':
        return await apiClient.post('/locations/track', data);
      
      case 'UPLOAD_MEDIA':
        return await this.uploadMedia(data);
      
      case 'SEND_MESSAGE':
        return await apiClient.post('/messages', data);
      
      default:
        throw new Error(`Unknown action type: ${type}`);
    }
  }

  /**
   * Upload media with progress tracking
   */
  private async uploadMedia(data: any): Promise<any> {
    const formData = new FormData();
    formData.append('file', {
      uri: data.uri,
      type: data.mimeType,
      name: data.filename,
    } as any);
    
    if (data.reportId) {
      formData.append('reportId', data.reportId);
    }
    
    if (data.description) {
      formData.append('description', data.description);
    }

    return await apiClient.post('/media/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        const progress = (progressEvent.loaded / progressEvent.total) * 100;
        // Emit progress event
        this.emitProgress(data.id, progress);
      },
    });
  }

  /**
   * Prioritize actions based on priority and dependencies
   */
  private prioritizeActions(actions: OfflineAction[]): OfflineAction[] {
    // Create dependency graph
    const dependencyMap = new Map<string, string[]>();
    actions.forEach(action => {
      if (action.dependencies) {
        dependencyMap.set(action.id, action.dependencies);
      }
    });

    // Topological sort with priority weighting
    const sorted: OfflineAction[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (action: OfflineAction) => {
      if (visiting.has(action.id)) {
        throw new Error('Circular dependency detected');
      }
      
      if (visited.has(action.id)) {
        return;
      }

      visiting.add(action.id);

      // Visit dependencies first
      const dependencies = dependencyMap.get(action.id) || [];
      dependencies.forEach(depId => {
        const depAction = actions.find(a => a.id === depId);
        if (depAction) {
          visit(depAction);
        }
      });

      visiting.delete(action.id);
      visited.add(action.id);
      sorted.push(action);
    };

    // Sort by priority first
    const priorityOrder = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    const prioritySorted = [...actions].sort((a, b) => 
      priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    prioritySorted.forEach(action => {
      if (!visited.has(action.id)) {
        visit(action);
      }
    });

    return sorted;
  }

  /**
   * Handle reconnection after being offline
   */
  private async handleReconnection(): Promise<void> {
    logger.info('Network reconnected, starting sync...');
    
    // Download latest data first
    await this.downloadLatestData();
    
    // Then sync offline changes
    await this.syncOfflineData();
  }

  /**
   * Download latest data from server
   */
  private async downloadLatestData(): Promise<void> {
    try {
      const lastSyncTime = await AsyncStorage.getItem('@last_sync_time');
      const response = await apiClient.get('/sync/download', {
        params: { lastSyncTimestamp: lastSyncTime },
      });

      if (response.data.success) {
        await this.updateLocalData(response.data.data);
        await AsyncStorage.setItem('@last_sync_time', new Date().toISOString());
      }
    } catch (error) {
      logger.error('Failed to download latest data:', error);
    }
  }

  /**
   * Update local data with server data
   */
  private async updateLocalData(serverData: any): Promise<void> {
    // Update shifts
    if (serverData.shifts) {
      await AsyncStorage.setItem('@cached_shifts', JSON.stringify(serverData.shifts));
    }

    // Update report templates
    if (serverData.reportTemplates) {
      await AsyncStorage.setItem('@cached_templates', JSON.stringify(serverData.reportTemplates));
    }

    // Update other cached data...
  }

  /**
   * Encrypt sensitive data
   */
  private encryptData(data: any): string {
    return CryptoJS.AES.encrypt(JSON.stringify(data), this.encryptionKey).toString();
  }

  /**
   * Decrypt sensitive data
   */
  private decryptData(encryptedData: string): any {
    const bytes = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  }

  /**
   * Generate checksum for data integrity
   */
  private generateChecksum(data: any): string {
    return CryptoJS.SHA256(JSON.stringify(data)).toString();
  }

  /**
   * Verify data integrity
   */
  private verifyChecksum(data: any, checksum: string): boolean {
    return this.generateChecksum(data) === checksum;
  }

  /**
   * Get maximum retries based on priority
   */
  private getMaxRetries(priority: OfflineAction['priority']): number {
    switch (priority) {
      case 'CRITICAL': return 10;
      case 'HIGH': return 5;
      case 'NORMAL': return 3;
      case 'LOW': return 1;
      default: return 3;
    }
  }

  /**
   * Persist queue to storage
   */
  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem('@offline_queue', JSON.stringify(this.syncQueue));
    } catch (error) {
      logger.error('Failed to persist offline queue:', error);
    }
  }

  /**
   * Load queue from storage
   */
  private async loadOfflineQueue(): Promise<void> {
    try {
      const queueData = await AsyncStorage.getItem('@offline_queue');
      if (queueData) {
        this.syncQueue = JSON.parse(queueData);
      }
    } catch (error) {
      logger.error('Failed to load offline queue:', error);
    }
  }

  /**
   * Get device ID
   */
  private async getDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem('@device_id');
    if (!deviceId) {
      deviceId = uuidv4();
      await AsyncStorage.setItem('@device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Get current user ID
   */
  private async getCurrentUserId(): Promise<string> {
    const userData = await AsyncStorage.getItem('@user_data');
    return userData ? JSON.parse(userData).id : '';
  }

  /**
   * Emit progress event
   */
  private emitProgress(actionId: string, progress: number): void {
    // Implement progress event emission
    // This could use EventEmitter or Redux actions
  }

  /**
   * Get sync status
   */
  public getSyncStatus(): {
    isOnline: boolean;
    syncInProgress: boolean;
    queueLength: number;
  } {
    return {
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
      queueLength: this.syncQueue.length,
    };
  }

  /**
   * Clear offline queue
   */
  public async clearQueue(): Promise<void> {
    this.syncQueue = [];
    await this.persistQueue();
  }

  /**
   * Get queued actions
   */
  public getQueuedActions(): OfflineAction[] {
    return [...this.syncQueue];
  }
}

/**
 * Conflict resolution service
 */
class ConflictResolver {
  async resolve(
    actionType: string,
    localData: any,
    serverData: any
  ): Promise<SyncConflict> {
    const conflict: SyncConflict = {
      id: uuidv4(),
      type: 'DATA_CONFLICT',
      localData,
      serverData,
      resolution: 'SERVER_WINS', // Default resolution
      timestamp: new Date().toISOString(),
    };

    // Implement conflict resolution logic based on action type
    switch (actionType) {
      case 'SUBMIT_REPORT':
        conflict.resolution = await this.resolveReportConflict(localData, serverData);
        break;
      
      case 'UPDATE_LOCATION':
        conflict.resolution = 'LOCAL_WINS'; // Local location data is usually more recent
        break;
      
      case 'CLOCK_IN':
      case 'CLOCK_OUT':
        conflict.resolution = await this.resolveAttendanceConflict(localData, serverData);
        break;
      
      default:
        conflict.resolution = 'SERVER_WINS';
    }

    return conflict;
  }

  private async resolveReportConflict(localData: any, serverData: any): Promise<SyncConflict['resolution']> {
    // If local report has more content, prefer local
    if (localData.content && localData.content.length > (serverData.content?.length || 0)) {
      return 'LOCAL_WINS';
    }
    
    // If server report is more recent, prefer server
    if (new Date(serverData.updatedAt) > new Date(localData.updatedAt)) {
      return 'SERVER_WINS';
    }
    
    return 'MERGE';
  }

  private async resolveAttendanceConflict(localData: any, serverData: any): Promise<SyncConflict['resolution']> {
    // For attendance, local data is usually more accurate (device-based)
    return 'LOCAL_WINS';
  }
}

export default OfflineManager;

/**
 * Offline Storage Service for intelligent data caching
 */
export class OfflineStorage {
  private static instance: OfflineStorage;
  private cacheConfig: Map<string, CacheConfig> = new Map();

  private constructor() {
    this.initializeCacheConfig();
  }

  public static getInstance(): OfflineStorage {
    if (!OfflineStorage.instance) {
      OfflineStorage.instance = new OfflineStorage();
    }
    return OfflineStorage.instance;
  }

  /**
   * Initialize cache configuration for different data types
   */
  private initializeCacheConfig(): void {
    this.cacheConfig.set('shifts', {
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      maxSize: 100,
      priority: 'HIGH',
      syncStrategy: 'IMMEDIATE',
    });

    this.cacheConfig.set('reports', {
      ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxSize: 50,
      priority: 'HIGH',
      syncStrategy: 'BATCH',
    });

    this.cacheConfig.set('templates', {
      ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxSize: 20,
      priority: 'NORMAL',
      syncStrategy: 'LAZY',
    });

    this.cacheConfig.set('media', {
      ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxSize: 10, // Limited due to size
      priority: 'LOW',
      syncStrategy: 'BACKGROUND',
    });
  }

  /**
   * Store data with intelligent caching
   */
  public async store(
    key: string,
    data: any,
    category: string = 'default'
  ): Promise<void> {
    try {
      const config = this.cacheConfig.get(category) || this.getDefaultConfig();
      const cacheEntry: CacheEntry = {
        data,
        timestamp: Date.now(),
        ttl: config.ttl,
        category,
        size: this.calculateSize(data),
      };

      await AsyncStorage.setItem(`@cache_${key}`, JSON.stringify(cacheEntry));

      // Manage cache size
      await this.manageCacheSize(category);

    } catch (error) {
      logger.error('Failed to store data:', error);
    }
  }

  /**
   * Retrieve data from cache
   */
  public async retrieve(key: string): Promise<any | null> {
    try {
      const cachedData = await AsyncStorage.getItem(`@cache_${key}`);
      if (!cachedData) return null;

      const cacheEntry: CacheEntry = JSON.parse(cachedData);

      // Check if data is still valid
      if (Date.now() - cacheEntry.timestamp > cacheEntry.ttl) {
        await AsyncStorage.removeItem(`@cache_${key}`);
        return null;
      }

      return cacheEntry.data;
    } catch (error) {
      logger.error('Failed to retrieve data:', error);
      return null;
    }
  }

  /**
   * Manage cache size by removing old entries
   */
  private async manageCacheSize(category: string): Promise<void> {
    const config = this.cacheConfig.get(category);
    if (!config) return;

    const keys = await AsyncStorage.getAllKeys();
    const categoryKeys = keys.filter(key => key.startsWith(`@cache_`) && key.includes(category));

    if (categoryKeys.length <= config.maxSize) return;

    // Get all cache entries with timestamps
    const entries: Array<{ key: string; timestamp: number }> = [];

    for (const key of categoryKeys) {
      try {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const entry: CacheEntry = JSON.parse(data);
          entries.push({ key, timestamp: entry.timestamp });
        }
      } catch (error) {
        // Remove corrupted entries
        await AsyncStorage.removeItem(key);
      }
    }

    // Sort by timestamp (oldest first) and remove excess
    entries.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = entries.slice(0, entries.length - config.maxSize);

    for (const entry of toRemove) {
      await AsyncStorage.removeItem(entry.key);
    }
  }

  /**
   * Calculate data size for cache management
   */
  private calculateSize(data: any): number {
    return JSON.stringify(data).length;
  }

  /**
   * Get default cache configuration
   */
  private getDefaultConfig(): CacheConfig {
    return {
      ttl: 60 * 60 * 1000, // 1 hour
      maxSize: 50,
      priority: 'NORMAL',
      syncStrategy: 'BATCH',
    };
  }

  /**
   * Clear cache for a specific category
   */
  public async clearCategory(category: string): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const categoryKeys = keys.filter(key =>
        key.startsWith(`@cache_`) && key.includes(category)
      );

      await AsyncStorage.multiRemove(categoryKeys);
    } catch (error) {
      logger.error('Failed to clear cache category:', error);
    }
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<CacheStats> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith('@cache_'));

      const stats: CacheStats = {
        totalEntries: cacheKeys.length,
        totalSize: 0,
        categories: {},
      };

      for (const key of cacheKeys) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data) {
            const entry: CacheEntry = JSON.parse(data);
            stats.totalSize += entry.size;

            if (!stats.categories[entry.category]) {
              stats.categories[entry.category] = {
                count: 0,
                size: 0,
              };
            }

            stats.categories[entry.category].count++;
            stats.categories[entry.category].size += entry.size;
          }
        } catch (error) {
          // Remove corrupted entries
          await AsyncStorage.removeItem(key);
        }
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return {
        totalEntries: 0,
        totalSize: 0,
        categories: {},
      };
    }
  }
}

interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of entries
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  syncStrategy: 'IMMEDIATE' | 'BATCH' | 'LAZY' | 'BACKGROUND';
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  category: string;
  size: number;
}

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  categories: {
    [category: string]: {
      count: number;
      size: number;
    };
  };
}
