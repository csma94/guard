import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export interface OfflineRecord {
  id: string;
  table: string;
  data: any;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  timestamp: string;
  synced: boolean;
  syncAttempts: number;
  lastSyncAttempt?: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  dependencies?: string[];
  conflictResolution?: 'CLIENT_WINS' | 'SERVER_WINS' | 'MERGE' | 'MANUAL';
}

export interface SyncConflict {
  id: string;
  table: string;
  localData: any;
  serverData: any;
  conflictType: 'UPDATE_UPDATE' | 'UPDATE_DELETE' | 'DELETE_UPDATE';
  timestamp: string;
  resolved: boolean;
}

class OfflineStorageService {
  private static instance: OfflineStorageService;
  private db: SQLite.WebSQLDatabase | null = null;
  private isInitialized = false;
  private encryptionKey: string | null = null;

  private constructor() {}

  public static getInstance(): OfflineStorageService {
    if (!OfflineStorageService.instance) {
      OfflineStorageService.instance = new OfflineStorageService();
    }
    return OfflineStorageService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize encryption key
      await this.initializeEncryption();

      // Open database
      this.db = SQLite.openDatabase('bahinlink_offline.db');

      // Create tables
      await this.createTables();

      // Set up database optimization
      await this.optimizeDatabase();

      this.isInitialized = true;
      logger.info('Offline storage service initialized');
    } catch (error) {
      logger.error('Failed to initialize offline storage:', error);
      throw error;
    }
  }

  private async initializeEncryption(): Promise<void> {
    try {
      let key = await AsyncStorage.getItem('offline_encryption_key');
      if (!key) {
        key = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${Date.now()}_${Math.random()}`
        );
        await AsyncStorage.setItem('offline_encryption_key', key);
      }
      this.encryptionKey = key;
    } catch (error) {
      logger.error('Failed to initialize encryption:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          // Offline records table
          tx.executeSql(`
            CREATE TABLE IF NOT EXISTS offline_records (
              id TEXT PRIMARY KEY,
              table_name TEXT NOT NULL,
              data TEXT NOT NULL,
              operation TEXT NOT NULL,
              timestamp TEXT NOT NULL,
              synced INTEGER DEFAULT 0,
              sync_attempts INTEGER DEFAULT 0,
              last_sync_attempt TEXT,
              priority TEXT DEFAULT 'NORMAL',
              dependencies TEXT,
              conflict_resolution TEXT DEFAULT 'SERVER_WINS',
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Sync conflicts table
          tx.executeSql(`
            CREATE TABLE IF NOT EXISTS sync_conflicts (
              id TEXT PRIMARY KEY,
              table_name TEXT NOT NULL,
              local_data TEXT NOT NULL,
              server_data TEXT NOT NULL,
              conflict_type TEXT NOT NULL,
              timestamp TEXT NOT NULL,
              resolved INTEGER DEFAULT 0,
              resolution_data TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Cached data table
          tx.executeSql(`
            CREATE TABLE IF NOT EXISTS cached_data (
              id TEXT PRIMARY KEY,
              table_name TEXT NOT NULL,
              data TEXT NOT NULL,
              expires_at TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // File attachments table
          tx.executeSql(`
            CREATE TABLE IF NOT EXISTS file_attachments (
              id TEXT PRIMARY KEY,
              original_path TEXT NOT NULL,
              local_path TEXT NOT NULL,
              file_name TEXT NOT NULL,
              file_size INTEGER NOT NULL,
              mime_type TEXT,
              encrypted INTEGER DEFAULT 1,
              synced INTEGER DEFAULT 0,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Create indexes for performance
          tx.executeSql('CREATE INDEX IF NOT EXISTS idx_offline_records_synced ON offline_records(synced)');
          tx.executeSql('CREATE INDEX IF NOT EXISTS idx_offline_records_priority ON offline_records(priority)');
          tx.executeSql('CREATE INDEX IF NOT EXISTS idx_offline_records_table ON offline_records(table_name)');
          tx.executeSql('CREATE INDEX IF NOT EXISTS idx_cached_data_expires ON cached_data(expires_at)');
          tx.executeSql('CREATE INDEX IF NOT EXISTS idx_file_attachments_synced ON file_attachments(synced)');
        },
        (error) => {
          logger.error('Failed to create tables:', error);
          reject(error);
        },
        () => {
          logger.info('Database tables created successfully');
          resolve();
        }
      );
    });
  }

  private async optimizeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          // Enable WAL mode for better concurrency
          tx.executeSql('PRAGMA journal_mode=WAL');
          
          // Set cache size
          tx.executeSql('PRAGMA cache_size=10000');
          
          // Enable foreign keys
          tx.executeSql('PRAGMA foreign_keys=ON');
          
          // Set synchronous mode
          tx.executeSql('PRAGMA synchronous=NORMAL');
        },
        (error) => {
          logger.error('Failed to optimize database:', error);
          reject(error);
        },
        () => {
          resolve();
        }
      );
    });
  }

  public async storeOfflineRecord(record: Omit<OfflineRecord, 'id' | 'timestamp' | 'synced' | 'syncAttempts'>): Promise<string> {
    if (!this.isInitialized) await this.initialize();

    const id = await this.generateId();
    const timestamp = new Date().toISOString();
    
    const fullRecord: OfflineRecord = {
      id,
      timestamp,
      synced: false,
      syncAttempts: 0,
      ...record,
    };

    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          tx.executeSql(
            `INSERT INTO offline_records 
             (id, table_name, data, operation, timestamp, synced, sync_attempts, priority, dependencies, conflict_resolution)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              fullRecord.id,
              fullRecord.table,
              this.encryptData(JSON.stringify(fullRecord.data)),
              fullRecord.operation,
              fullRecord.timestamp,
              fullRecord.synced ? 1 : 0,
              fullRecord.syncAttempts,
              fullRecord.priority,
              fullRecord.dependencies ? JSON.stringify(fullRecord.dependencies) : null,
              fullRecord.conflictResolution,
            ],
            (_, result) => {
              logger.debug('Offline record stored:', fullRecord.id);
              resolve(fullRecord.id);
            },
            (_, error) => {
              logger.error('Failed to store offline record:', error);
              reject(error);
              return false;
            }
          );
        }
      );
    });
  }

  public async getUnsyncedRecords(limit: number = 50): Promise<OfflineRecord[]> {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          tx.executeSql(
            `SELECT * FROM offline_records 
             WHERE synced = 0 
             ORDER BY 
               CASE priority 
                 WHEN 'CRITICAL' THEN 1 
                 WHEN 'HIGH' THEN 2 
                 WHEN 'NORMAL' THEN 3 
                 WHEN 'LOW' THEN 4 
               END,
               timestamp ASC
             LIMIT ?`,
            [limit],
            (_, result) => {
              const records: OfflineRecord[] = [];
              for (let i = 0; i < result.rows.length; i++) {
                const row = result.rows.item(i);
                records.push({
                  id: row.id,
                  table: row.table_name,
                  data: JSON.parse(this.decryptData(row.data)),
                  operation: row.operation,
                  timestamp: row.timestamp,
                  synced: row.synced === 1,
                  syncAttempts: row.sync_attempts,
                  lastSyncAttempt: row.last_sync_attempt,
                  priority: row.priority,
                  dependencies: row.dependencies ? JSON.parse(row.dependencies) : undefined,
                  conflictResolution: row.conflict_resolution,
                });
              }
              resolve(records);
            },
            (_, error) => {
              logger.error('Failed to get unsynced records:', error);
              reject(error);
              return false;
            }
          );
        }
      );
    });
  }

  public async markRecordAsSynced(recordId: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          tx.executeSql(
            'UPDATE offline_records SET synced = 1 WHERE id = ?',
            [recordId],
            (_, result) => {
              logger.debug('Record marked as synced:', recordId);
              resolve();
            },
            (_, error) => {
              logger.error('Failed to mark record as synced:', error);
              reject(error);
              return false;
            }
          );
        }
      );
    });
  }

  public async incrementSyncAttempts(recordId: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          tx.executeSql(
            'UPDATE offline_records SET sync_attempts = sync_attempts + 1, last_sync_attempt = ? WHERE id = ?',
            [new Date().toISOString(), recordId],
            (_, result) => {
              resolve();
            },
            (_, error) => {
              logger.error('Failed to increment sync attempts:', error);
              reject(error);
              return false;
            }
          );
        }
      );
    });
  }

  public async storeConflict(conflict: Omit<SyncConflict, 'id' | 'timestamp' | 'resolved'>): Promise<string> {
    if (!this.isInitialized) await this.initialize();

    const id = await this.generateId();
    const timestamp = new Date().toISOString();

    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          tx.executeSql(
            `INSERT INTO sync_conflicts 
             (id, table_name, local_data, server_data, conflict_type, timestamp, resolved)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              conflict.table,
              this.encryptData(JSON.stringify(conflict.localData)),
              this.encryptData(JSON.stringify(conflict.serverData)),
              conflict.conflictType,
              timestamp,
              0,
            ],
            (_, result) => {
              logger.info('Sync conflict stored:', id);
              resolve(id);
            },
            (_, error) => {
              logger.error('Failed to store sync conflict:', error);
              reject(error);
              return false;
            }
          );
        }
      );
    });
  }

  public async cacheData(table: string, data: any, expiresIn?: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    const id = `${table}_${await this.generateId()}`;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn).toISOString() : null;

    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          tx.executeSql(
            `INSERT OR REPLACE INTO cached_data 
             (id, table_name, data, expires_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              id,
              table,
              this.encryptData(JSON.stringify(data)),
              expiresAt,
              new Date().toISOString(),
            ],
            (_, result) => {
              resolve();
            },
            (_, error) => {
              logger.error('Failed to cache data:', error);
              reject(error);
              return false;
            }
          );
        }
      );
    });
  }

  public async getCachedData(table: string): Promise<any[]> {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          tx.executeSql(
            `SELECT data FROM cached_data 
             WHERE table_name = ? 
             AND (expires_at IS NULL OR expires_at > ?)
             ORDER BY updated_at DESC`,
            [table, new Date().toISOString()],
            (_, result) => {
              const data: any[] = [];
              for (let i = 0; i < result.rows.length; i++) {
                const row = result.rows.item(i);
                data.push(JSON.parse(this.decryptData(row.data)));
              }
              resolve(data);
            },
            (_, error) => {
              logger.error('Failed to get cached data:', error);
              reject(error);
              return false;
            }
          );
        }
      );
    });
  }

  public async cleanupExpiredData(): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          // Clean expired cached data
          tx.executeSql(
            'DELETE FROM cached_data WHERE expires_at IS NOT NULL AND expires_at < ?',
            [now]
          );

          // Clean old synced records (older than 30 days)
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          tx.executeSql(
            'DELETE FROM offline_records WHERE synced = 1 AND timestamp < ?',
            [thirtyDaysAgo]
          );

          // Clean resolved conflicts (older than 7 days)
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          tx.executeSql(
            'DELETE FROM sync_conflicts WHERE resolved = 1 AND timestamp < ?',
            [sevenDaysAgo]
          );
        },
        (error) => {
          logger.error('Failed to cleanup expired data:', error);
          reject(error);
        },
        () => {
          logger.info('Expired data cleaned up');
          resolve();
        }
      );
    });
  }

  private encryptData(data: string): string {
    // Simple encryption - in production, use proper encryption
    if (!this.encryptionKey) return data;
    
    try {
      // This is a simplified encryption - use proper crypto library in production
      return Buffer.from(data).toString('base64');
    } catch (error) {
      logger.error('Failed to encrypt data:', error);
      return data;
    }
  }

  private decryptData(encryptedData: string): string {
    // Simple decryption - in production, use proper decryption
    if (!this.encryptionKey) return encryptedData;
    
    try {
      // This is a simplified decryption - use proper crypto library in production
      return Buffer.from(encryptedData, 'base64').toString();
    } catch (error) {
      logger.error('Failed to decrypt data:', error);
      return encryptedData;
    }
  }

  private async generateId(): Promise<string> {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${Date.now()}_${Math.random()}`
    );
  }

  public async getStorageStats(): Promise<{
    unsyncedRecords: number;
    cachedItems: number;
    conflicts: number;
    totalSize: number;
  }> {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.db!.transaction(
        (tx) => {
          let stats = {
            unsyncedRecords: 0,
            cachedItems: 0,
            conflicts: 0,
            totalSize: 0,
          };

          tx.executeSql(
            'SELECT COUNT(*) as count FROM offline_records WHERE synced = 0',
            [],
            (_, result) => {
              stats.unsyncedRecords = result.rows.item(0).count;
            }
          );

          tx.executeSql(
            'SELECT COUNT(*) as count FROM cached_data',
            [],
            (_, result) => {
              stats.cachedItems = result.rows.item(0).count;
            }
          );

          tx.executeSql(
            'SELECT COUNT(*) as count FROM sync_conflicts WHERE resolved = 0',
            [],
            (_, result) => {
              stats.conflicts = result.rows.item(0).count;
              resolve(stats);
            }
          );
        },
        (error) => {
          reject(error);
        }
      );
    });
  }
}

export default OfflineStorageService.getInstance();
