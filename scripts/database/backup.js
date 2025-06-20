#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const logger = require('../../src/config/logger');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Production-ready database backup and restore utility
 */
class DatabaseBackupManager {
  constructor() {
    this.backupPath = path.join(__dirname, '../../backups');
    this.environment = process.env.NODE_ENV || 'development';
    this.maxBackups = parseInt(process.env.MAX_BACKUPS) || 30;
  }

  /**
   * Create database backup
   */
  async createBackup(options = {}) {
    const {
      compress = true,
      includeData = true,
      includeSchema = true,
      customName = null,
    } = options;

    try {
      logger.info('Starting database backup', {
        compress,
        includeData,
        includeSchema,
        customName,
      });

      // Ensure backup directory exists
      await fs.mkdir(this.backupPath, { recursive: true });

      // Generate backup filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = customName || `backup-${timestamp}`;
      const backupFile = path.join(this.backupPath, `${baseName}.sql`);
      const compressedFile = `${backupFile}.gz`;

      // Validate database connection
      await this.validateDatabaseConnection();

      // Create backup
      const backupResult = await this.performBackup(backupFile, {
        includeData,
        includeSchema,
      });

      // Compress backup if requested
      let finalFile = backupFile;
      if (compress) {
        await this.compressBackup(backupFile, compressedFile);
        await fs.unlink(backupFile); // Remove uncompressed file
        finalFile = compressedFile;
      }

      // Generate checksum
      const checksum = await this.generateChecksum(finalFile);

      // Create metadata file
      const metadata = {
        filename: path.basename(finalFile),
        timestamp: new Date().toISOString(),
        environment: this.environment,
        size: (await fs.stat(finalFile)).size,
        checksum,
        compressed: compress,
        includeData,
        includeSchema,
        databaseUrl: this.sanitizeDatabaseUrl(process.env.DATABASE_URL),
        version: process.env.npm_package_version || '1.0.0',
      };

      await fs.writeFile(
        `${finalFile}.meta`,
        JSON.stringify(metadata, null, 2)
      );

      // Clean up old backups
      await this.cleanupOldBackups();

      logger.info('Database backup completed successfully', {
        file: finalFile,
        size: metadata.size,
        checksum: metadata.checksum,
      });

      return {
        success: true,
        file: finalFile,
        metadata,
      };

    } catch (error) {
      logger.error('Database backup failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Restore database from backup
   */
  async restoreBackup(backupFile, options = {}) {
    const {
      force = false,
      skipValidation = false,
    } = options;

    try {
      logger.info('Starting database restore', {
        backupFile,
        force,
        skipValidation,
      });

      // Validate backup file exists
      await fs.access(backupFile);

      // Load and validate metadata
      const metadata = await this.loadBackupMetadata(backupFile);
      if (!skipValidation) {
        await this.validateBackup(backupFile, metadata);
      }

      // Confirm restore in production
      if (this.environment === 'production' && !force) {
        throw new Error('Production restore requires --force flag');
      }

      // Create pre-restore backup
      let preRestoreBackup = null;
      if (this.environment === 'production') {
        logger.info('Creating pre-restore backup');
        const preRestoreResult = await this.createBackup({
          customName: `pre-restore-${Date.now()}`,
        });
        preRestoreBackup = preRestoreResult.file;
      }

      // Decompress backup if needed
      let sqlFile = backupFile;
      if (metadata.compressed) {
        sqlFile = await this.decompressBackup(backupFile);
      }

      // Perform restore
      await this.performRestore(sqlFile);

      // Clean up temporary decompressed file
      if (metadata.compressed && sqlFile !== backupFile) {
        await fs.unlink(sqlFile);
      }

      logger.info('Database restore completed successfully', {
        backupFile,
        preRestoreBackup,
      });

      return {
        success: true,
        backupFile,
        preRestoreBackup,
      };

    } catch (error) {
      logger.error('Database restore failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * List available backups
   */
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupPath);
      const backups = [];

      for (const file of files) {
        if (file.endsWith('.sql') || file.endsWith('.sql.gz')) {
          const filePath = path.join(this.backupPath, file);
          const metaPath = `${filePath}.meta`;
          
          let metadata = null;
          try {
            const metaContent = await fs.readFile(metaPath, 'utf8');
            metadata = JSON.parse(metaContent);
          } catch (error) {
            // Metadata file doesn't exist or is invalid
          }

          const stats = await fs.stat(filePath);
          
          backups.push({
            filename: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            metadata,
          });
        }
      }

      // Sort by creation date (newest first)
      backups.sort((a, b) => b.created - a.created);

      return backups;
    } catch (error) {
      logger.error('Failed to list backups', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate database connection
   */
  async validateDatabaseConnection() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not configured');
    }

    try {
      // Test connection with a simple query
      const url = new URL(databaseUrl);
      const testCommand = `PGPASSWORD="${url.password}" psql -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.slice(1)} -c "SELECT 1;" --quiet`;
      
      execSync(testCommand, { stdio: 'pipe' });
      logger.info('Database connection validated');
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  /**
   * Perform database backup using pg_dump
   */
  async performBackup(backupFile, options) {
    const { includeData, includeSchema } = options;
    const databaseUrl = process.env.DATABASE_URL;
    const url = new URL(databaseUrl);

    let pgDumpOptions = [
      '--verbose',
      '--no-owner',
      '--no-privileges',
      '--format=plain',
    ];

    if (!includeData) {
      pgDumpOptions.push('--schema-only');
    }

    if (!includeSchema) {
      pgDumpOptions.push('--data-only');
    }

    const command = `PGPASSWORD="${url.password}" pg_dump -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.slice(1)} ${pgDumpOptions.join(' ')} -f "${backupFile}"`;

    try {
      execSync(command, { stdio: 'inherit' });
      
      // Verify backup file was created and is not empty
      const stats = await fs.stat(backupFile);
      if (stats.size === 0) {
        throw new Error('Backup file is empty');
      }

      return {
        success: true,
        size: stats.size,
      };
    } catch (error) {
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * Perform database restore using psql
   */
  async performRestore(sqlFile) {
    const databaseUrl = process.env.DATABASE_URL;
    const url = new URL(databaseUrl);

    const command = `PGPASSWORD="${url.password}" psql -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.slice(1)} -f "${sqlFile}" --quiet`;

    try {
      execSync(command, { stdio: 'inherit' });
      logger.info('Database restore completed');
    } catch (error) {
      throw new Error(`Database restore failed: ${error.message}`);
    }
  }

  /**
   * Compress backup file
   */
  async compressBackup(inputFile, outputFile) {
    try {
      const data = await fs.readFile(inputFile);
      const compressed = await gzip(data);
      await fs.writeFile(outputFile, compressed);
      
      logger.info('Backup compressed', {
        originalSize: data.length,
        compressedSize: compressed.length,
        ratio: Math.round((1 - compressed.length / data.length) * 100),
      });
    } catch (error) {
      throw new Error(`Backup compression failed: ${error.message}`);
    }
  }

  /**
   * Decompress backup file
   */
  async decompressBackup(compressedFile) {
    try {
      const compressed = await fs.readFile(compressedFile);
      const decompressed = await gunzip(compressed);
      
      const tempFile = compressedFile.replace('.gz', '.temp');
      await fs.writeFile(tempFile, decompressed);
      
      return tempFile;
    } catch (error) {
      throw new Error(`Backup decompression failed: ${error.message}`);
    }
  }

  /**
   * Generate file checksum
   */
  async generateChecksum(filePath) {
    try {
      const data = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(data).digest('hex');
    } catch (error) {
      throw new Error(`Checksum generation failed: ${error.message}`);
    }
  }

  /**
   * Load backup metadata
   */
  async loadBackupMetadata(backupFile) {
    const metaFile = `${backupFile}.meta`;
    
    try {
      const metaContent = await fs.readFile(metaFile, 'utf8');
      return JSON.parse(metaContent);
    } catch (error) {
      logger.warn('Backup metadata not found or invalid', {
        metaFile,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Validate backup integrity
   */
  async validateBackup(backupFile, metadata) {
    if (!metadata) {
      logger.warn('No metadata available for backup validation');
      return;
    }

    try {
      // Verify file size
      const stats = await fs.stat(backupFile);
      if (stats.size !== metadata.size) {
        throw new Error(`File size mismatch: expected ${metadata.size}, got ${stats.size}`);
      }

      // Verify checksum
      const currentChecksum = await this.generateChecksum(backupFile);
      if (currentChecksum !== metadata.checksum) {
        throw new Error(`Checksum mismatch: backup file may be corrupted`);
      }

      logger.info('Backup validation successful');
    } catch (error) {
      throw new Error(`Backup validation failed: ${error.message}`);
    }
  }

  /**
   * Clean up old backups
   */
  async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();
      
      if (backups.length <= this.maxBackups) {
        return;
      }

      // Sort by creation date and remove oldest
      const toDelete = backups.slice(this.maxBackups);
      
      for (const backup of toDelete) {
        await fs.unlink(backup.path);
        
        // Also delete metadata file if it exists
        const metaPath = `${backup.path}.meta`;
        try {
          await fs.unlink(metaPath);
        } catch (error) {
          // Metadata file might not exist
        }
      }

      logger.info('Old backups cleaned up', {
        deleted: toDelete.length,
        remaining: this.maxBackups,
      });
    } catch (error) {
      logger.warn('Failed to clean up old backups', {
        error: error.message,
      });
    }
  }

  /**
   * Sanitize database URL for logging
   */
  sanitizeDatabaseUrl(url) {
    if (!url) return null;
    
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.username}:***@${parsed.host}${parsed.pathname}`;
    } catch (error) {
      return 'invalid-url';
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = {};

  // Parse command line arguments
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--force':
        options.force = true;
        break;
      case '--no-compress':
        options.compress = false;
        break;
      case '--schema-only':
        options.includeData = false;
        break;
      case '--data-only':
        options.includeSchema = false;
        break;
      case '--name':
        options.customName = args[++i];
        break;
      case '--file':
        options.file = args[++i];
        break;
    }
  }

  const backupManager = new DatabaseBackupManager();

  switch (command) {
    case 'create':
      backupManager.createBackup(options)
        .then((result) => {
          console.log('Backup created successfully:', result);
          process.exit(0);
        })
        .catch((error) => {
          console.error('Backup failed:', error.message);
          process.exit(1);
        });
      break;

    case 'restore':
      if (!options.file) {
        console.error('Restore requires --file option');
        process.exit(1);
      }
      
      backupManager.restoreBackup(options.file, options)
        .then((result) => {
          console.log('Restore completed successfully:', result);
          process.exit(0);
        })
        .catch((error) => {
          console.error('Restore failed:', error.message);
          process.exit(1);
        });
      break;

    case 'list':
      backupManager.listBackups()
        .then((backups) => {
          console.log('Available backups:');
          backups.forEach((backup, index) => {
            console.log(`${index + 1}. ${backup.filename} (${backup.size} bytes, ${backup.created})`);
          });
          process.exit(0);
        })
        .catch((error) => {
          console.error('Failed to list backups:', error.message);
          process.exit(1);
        });
      break;

    default:
      console.log('Usage:');
      console.log('  node backup.js create [--no-compress] [--schema-only] [--data-only] [--name <name>]');
      console.log('  node backup.js restore --file <backup-file> [--force]');
      console.log('  node backup.js list');
      process.exit(1);
  }
}

module.exports = DatabaseBackupManager;
