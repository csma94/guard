#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../src/config/logger');

/**
 * Production-ready database migration script
 */
class DatabaseMigrator {
  constructor() {
    this.prisma = new PrismaClient();
    this.migrationsPath = path.join(__dirname, '../../prisma/migrations');
    this.backupPath = path.join(__dirname, '../../backups');
  }

  /**
   * Run database migrations with backup and rollback capabilities
   */
  async migrate(options = {}) {
    const {
      createBackup = true,
      dryRun = false,
      force = false,
      environment = process.env.NODE_ENV || 'development',
    } = options;

    try {
      logger.info('Starting database migration process', {
        environment,
        createBackup,
        dryRun,
        force,
      });

      // Validate environment
      await this.validateEnvironment(environment);

      // Create backup before migration (production only)
      let backupFile = null;
      if (createBackup && environment === 'production') {
        backupFile = await this.createBackup();
        logger.info('Database backup created', { backupFile });
      }

      // Check migration status
      const migrationStatus = await this.checkMigrationStatus();
      logger.info('Current migration status', migrationStatus);

      if (dryRun) {
        logger.info('Dry run mode - no changes will be applied');
        await this.showPendingMigrations();
        return { success: true, dryRun: true };
      }

      // Apply migrations
      const migrationResult = await this.applyMigrations(force);
      
      // Verify migration success
      await this.verifyMigrations();

      // Update system configuration
      await this.updateSystemConfiguration();

      logger.info('Database migration completed successfully', {
        appliedMigrations: migrationResult.appliedMigrations,
        backupFile,
      });

      return {
        success: true,
        appliedMigrations: migrationResult.appliedMigrations,
        backupFile,
      };

    } catch (error) {
      logger.error('Database migration failed', {
        error: error.message,
        stack: error.stack,
      });

      // Attempt rollback if backup exists
      if (options.createBackup && backupFile) {
        logger.info('Attempting to restore from backup due to migration failure');
        try {
          await this.restoreFromBackup(backupFile);
          logger.info('Database restored from backup successfully');
        } catch (rollbackError) {
          logger.error('Failed to restore from backup', {
            error: rollbackError.message,
          });
        }
      }

      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  /**
   * Validate environment and prerequisites
   */
  async validateEnvironment(environment) {
    // Check database connection
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      logger.info('Database connection verified');
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }

    // Check required environment variables
    const requiredVars = [
      'DATABASE_URL',
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Production-specific checks
    if (environment === 'production') {
      // Ensure backup directory exists
      await fs.mkdir(this.backupPath, { recursive: true });

      // Check disk space
      const stats = await fs.stat(this.backupPath);
      // Additional production checks can be added here
    }
  }

  /**
   * Check current migration status
   */
  async checkMigrationStatus() {
    try {
      const result = execSync('npx prisma migrate status --schema=./prisma/schema.prisma', {
        encoding: 'utf8',
        cwd: path.join(__dirname, '../..'),
      });

      return {
        status: 'checked',
        output: result,
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        output: error.stdout || error.stderr,
      };
    }
  }

  /**
   * Show pending migrations
   */
  async showPendingMigrations() {
    try {
      const result = execSync('npx prisma migrate diff --from-schema-datamodel ./prisma/schema.prisma --to-schema-datasource ./prisma/schema.prisma', {
        encoding: 'utf8',
        cwd: path.join(__dirname, '../..'),
      });

      logger.info('Pending migrations', { diff: result });
      return result;
    } catch (error) {
      logger.warn('Could not determine pending migrations', {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Apply database migrations
   */
  async applyMigrations(force = false) {
    try {
      const command = force 
        ? 'npx prisma migrate deploy --schema=./prisma/schema.prisma'
        : 'npx prisma migrate deploy --schema=./prisma/schema.prisma';

      const result = execSync(command, {
        encoding: 'utf8',
        cwd: path.join(__dirname, '../..'),
      });

      // Parse applied migrations from output
      const appliedMigrations = this.parseAppliedMigrations(result);

      return {
        success: true,
        output: result,
        appliedMigrations,
      };
    } catch (error) {
      throw new Error(`Migration failed: ${error.message}\nOutput: ${error.stdout || error.stderr}`);
    }
  }

  /**
   * Verify migrations were applied correctly
   */
  async verifyMigrations() {
    try {
      // Test basic database operations
      await this.prisma.$queryRaw`SELECT COUNT(*) FROM "User"`;
      await this.prisma.$queryRaw`SELECT COUNT(*) FROM "Agent"`;
      await this.prisma.$queryRaw`SELECT COUNT(*) FROM "Site"`;
      
      logger.info('Migration verification successful');
      return true;
    } catch (error) {
      throw new Error(`Migration verification failed: ${error.message}`);
    }
  }

  /**
   * Create database backup
   */
  async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.backupPath, `backup-${timestamp}.sql`);

    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
      }

      // Extract connection details from DATABASE_URL
      const url = new URL(databaseUrl);
      const host = url.hostname;
      const port = url.port || 5432;
      const database = url.pathname.slice(1);
      const username = url.username;
      const password = url.password;

      // Create pg_dump command
      const command = `PGPASSWORD="${password}" pg_dump -h ${host} -p ${port} -U ${username} -d ${database} -f "${backupFile}" --verbose --no-owner --no-privileges`;

      execSync(command, {
        encoding: 'utf8',
        stdio: 'inherit',
      });

      // Verify backup file was created
      const stats = await fs.stat(backupFile);
      if (stats.size === 0) {
        throw new Error('Backup file is empty');
      }

      logger.info('Database backup created successfully', {
        file: backupFile,
        size: stats.size,
      });

      return backupFile;
    } catch (error) {
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * Restore database from backup
   */
  async restoreFromBackup(backupFile) {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
      }

      // Extract connection details from DATABASE_URL
      const url = new URL(databaseUrl);
      const host = url.hostname;
      const port = url.port || 5432;
      const database = url.pathname.slice(1);
      const username = url.username;
      const password = url.password;

      // Create psql restore command
      const command = `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${username} -d ${database} -f "${backupFile}" --quiet`;

      execSync(command, {
        encoding: 'utf8',
        stdio: 'inherit',
      });

      logger.info('Database restored from backup successfully', {
        backupFile,
      });

      return true;
    } catch (error) {
      throw new Error(`Backup restoration failed: ${error.message}`);
    }
  }

  /**
   * Update system configuration after migration
   */
  async updateSystemConfiguration() {
    try {
      await this.prisma.systemConfiguration.upsert({
        where: { key: 'LAST_MIGRATION' },
        update: { 
          value: { 
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
          }
        },
        create: { 
          key: 'LAST_MIGRATION',
          value: { 
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
          }
        },
      });

      logger.info('System configuration updated');
    } catch (error) {
      logger.warn('Failed to update system configuration', {
        error: error.message,
      });
    }
  }

  /**
   * Parse applied migrations from command output
   */
  parseAppliedMigrations(output) {
    const migrations = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('Applied migration')) {
        const match = line.match(/Applied migration (\d+_\w+)/);
        if (match) {
          migrations.push(match[1]);
        }
      }
    }
    
    return migrations;
  }

  /**
   * Rollback to specific migration
   */
  async rollback(migrationName) {
    try {
      logger.info('Rolling back to migration', { migrationName });

      // This would require custom rollback logic
      // Prisma doesn't support automatic rollbacks
      throw new Error('Rollback functionality requires manual implementation');
    } catch (error) {
      logger.error('Rollback failed', { error: error.message });
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--no-backup':
        options.createBackup = false;
        break;
      case '--force':
        options.force = true;
        break;
      case '--environment':
        options.environment = args[++i];
        break;
    }
  }

  const migrator = new DatabaseMigrator();
  
  migrator.migrate(options)
    .then((result) => {
      console.log('Migration completed successfully:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = DatabaseMigrator;
