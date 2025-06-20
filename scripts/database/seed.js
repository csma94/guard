#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
// Note: bcrypt removed - authentication now handled by Clerk
const logger = require('../../src/config/logger');

/**
 * Production-ready database seeding script
 */
class DatabaseSeeder {
  constructor() {
    this.prisma = new PrismaClient();
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Run database seeding
   */
  async seed(options = {}) {
    const {
      force = false,
      seedType = 'basic', // basic, demo, production
      skipExisting = true,
    } = options;

    try {
      logger.info('Starting database seeding process', {
        environment: this.environment,
        seedType,
        force,
        skipExisting,
      });

      // Check if database is already seeded
      if (!force && skipExisting) {
        const existingData = await this.checkExistingData();
        if (existingData.hasData) {
          logger.info('Database already contains data, skipping seeding', existingData);
          return { success: true, skipped: true, reason: 'Database already seeded' };
        }
      }

      // Run seeding based on type
      const seedResult = await this.runSeeding(seedType);

      // Verify seeding
      await this.verifySeeding();

      logger.info('Database seeding completed successfully', seedResult);

      return {
        success: true,
        ...seedResult,
      };

    } catch (error) {
      logger.error('Database seeding failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  /**
   * Check if database already contains data
   */
  async checkExistingData() {
    try {
      const [userCount, clientCount, siteCount] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.client.count(),
        this.prisma.site.count(),
      ]);

      return {
        hasData: userCount > 0 || clientCount > 0 || siteCount > 0,
        userCount,
        clientCount,
        siteCount,
      };
    } catch (error) {
      logger.warn('Could not check existing data', { error: error.message });
      return { hasData: false };
    }
  }

  /**
   * Run seeding based on type
   */
  async runSeeding(seedType) {
    const results = {};

    switch (seedType) {
      case 'production':
        results.systemConfig = await this.seedSystemConfiguration();
        results.adminUser = await this.seedAdminUser();
        break;

      case 'demo':
        results.systemConfig = await this.seedSystemConfiguration();
        results.adminUser = await this.seedAdminUser();
        results.demoData = await this.seedDemoData();
        break;

      case 'basic':
      default:
        results.systemConfig = await this.seedSystemConfiguration();
        results.adminUser = await this.seedAdminUser();
        results.basicData = await this.seedBasicData();
        break;
    }

    return results;
  }

  /**
   * Seed system configuration
   */
  async seedSystemConfiguration() {
    logger.info('Seeding system configuration');

    const configurations = [
      {
        key: 'SYSTEM_INITIALIZED',
        value: {
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          environment: this.environment,
        },
      },
      {
        key: 'DEFAULT_SETTINGS',
        value: {
          sessionTimeout: 3600, // 1 hour
          maxLoginAttempts: 5,
          passwordMinLength: 8,
          requireTwoFactor: false,
          allowSelfRegistration: false,
        },
      },
      {
        key: 'NOTIFICATION_SETTINGS',
        value: {
          emailEnabled: true,
          smsEnabled: true,
          pushEnabled: true,
          defaultChannels: ['email'],
        },
      },
      {
        key: 'SECURITY_SETTINGS',
        value: {
          jwtExpiresIn: '24h',
          refreshTokenExpiresIn: '7d',
          bcryptRounds: 12,
          rateLimitWindow: 900000, // 15 minutes
          rateLimitMax: 100,
        },
      },
    ];

    const created = [];
    for (const config of configurations) {
      try {
        const result = await this.prisma.systemConfiguration.upsert({
          where: { key: config.key },
          update: { value: config.value },
          create: config,
        });
        created.push(result.key);
      } catch (error) {
        logger.warn(`Failed to create system configuration ${config.key}`, {
          error: error.message,
        });
      }
    }

    logger.info('System configuration seeded', { created });
    return { created };
  }

  /**
   * Seed admin user
   */
  async seedAdminUser() {
    logger.info('Seeding admin user');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@bahinlink.com';
    const adminPassword = process.env.ADMIN_PASSWORD || this.generateSecurePassword();
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';

    try {
      // Check if admin user already exists
      const existingAdmin = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email: adminEmail },
            { username: adminUsername },
            { role: 'ADMIN' },
          ],
        },
      });

      if (existingAdmin) {
        logger.info('Admin user already exists', { id: existingAdmin.id });
        return { exists: true, id: existingAdmin.id };
      }

      // Note: Password hashing now handled by Clerk
      const hashedPassword = 'clerk_managed_password';

      // Create admin user
      const adminUser = await this.prisma.user.create({
        data: {
          username: adminUsername,
          email: adminEmail,
          passwordHash: hashedPassword,
          role: 'ADMIN',
          status: 'ACTIVE',
          profile: {
            firstName: 'System',
            lastName: 'Administrator',
            phone: '+1234567890',
          },
        },
      });

      // Log admin credentials (only in development)
      if (this.environment === 'development') {
        logger.info('Admin user created', {
          id: adminUser.id,
          username: adminUsername,
          email: adminEmail,
          password: adminPassword,
        });
      } else {
        logger.info('Admin user created', {
          id: adminUser.id,
          username: adminUsername,
          email: adminEmail,
        });
      }

      return {
        created: true,
        id: adminUser.id,
        username: adminUsername,
        email: adminEmail,
        ...(this.environment === 'development' && { password: adminPassword }),
      };

    } catch (error) {
      logger.error('Failed to create admin user', { error: error.message });
      throw error;
    }
  }

  /**
   * Seed basic data for development/testing
   */
  async seedBasicData() {
    logger.info('Seeding basic data');

    const results = {};

    try {
      // Create test client
      const testClient = await this.prisma.client.create({
        data: {
          companyName: 'Test Security Services',
          contactPerson: {
            name: 'John Doe',
            email: 'john@testsecurity.com',
            phone: '+1234567890',
          },
          billingAddress: {
            street: '123 Test Street',
            city: 'Test City',
            state: 'TS',
            zipCode: '12345',
            country: 'USA',
          },
          status: 'ACTIVE',
          metadata: {
            billingRate: 35.00,
            contractStart: new Date().toISOString(),
            contractEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
      });
      results.testClient = testClient.id;

      // Create test site
      const testSite = await this.prisma.site.create({
        data: {
          clientId: testClient.id,
          name: 'Test Security Site',
          address: {
            street: '456 Site Street',
            city: 'Site City',
            state: 'SC',
            zipCode: '67890',
            country: 'USA',
          },
          coordinates: 'POINT(-122.4194 37.7749)', // San Francisco
          geofenceRadius: 100,
          status: 'ACTIVE',
          operatingHours: {
            monday: { start: '09:00', end: '17:00' },
            tuesday: { start: '09:00', end: '17:00' },
            wednesday: { start: '09:00', end: '17:00' },
            thursday: { start: '09:00', end: '17:00' },
            friday: { start: '09:00', end: '17:00' },
            saturday: { start: '10:00', end: '16:00' },
            sunday: { start: '10:00', end: '16:00' },
          },
        },
      });
      results.testSite = testSite.id;

      // Create test supervisor
      const supervisorPassword = this.generateSecurePassword();
      const hashedSupervisorPassword = 'clerk_managed_password';

      const testSupervisor = await this.prisma.user.create({
        data: {
          username: 'supervisor',
          email: 'supervisor@bahinlink.com',
          passwordHash: hashedSupervisorPassword,
          role: 'SUPERVISOR',
          status: 'ACTIVE',
          profile: {
            firstName: 'Test',
            lastName: 'Supervisor',
            phone: '+1234567891',
          },
        },
      });
      results.testSupervisor = {
        id: testSupervisor.id,
        username: 'supervisor',
        ...(this.environment === 'development' && { password: supervisorPassword }),
      };

      // Create test agent
      const agentPassword = this.generateSecurePassword();
      const hashedAgentPassword = 'clerk_managed_password';

      const testAgentUser = await this.prisma.user.create({
        data: {
          username: 'agent',
          email: 'agent@bahinlink.com',
          passwordHash: hashedAgentPassword,
          role: 'AGENT',
          status: 'ACTIVE',
          profile: {
            firstName: 'Test',
            lastName: 'Agent',
            phone: '+1234567892',
          },
        },
      });

      const testAgent = await this.prisma.agent.create({
        data: {
          userId: testAgentUser.id,
          employeeId: 'EMP001',
          hireDate: new Date(),
          employmentStatus: 'ACTIVE',
          skills: ['Security', 'Customer Service'],
          certifications: [
            { name: 'Basic Security', issueDate: new Date(), expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
            { name: 'First Aid', issueDate: new Date(), expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) }
          ],
        },
      });

      results.testAgent = {
        id: testAgent.id,
        userId: testAgentUser.id,
        username: 'agent',
        ...(this.environment === 'development' && { password: agentPassword }),
      };

      logger.info('Basic data seeded successfully', results);
      return results;

    } catch (error) {
      logger.error('Failed to seed basic data', { error: error.message });
      throw error;
    }
  }

  /**
   * Seed demo data for demonstrations
   */
  async seedDemoData() {
    logger.info('Seeding demo data');

    // First seed basic data
    const basicData = await this.seedBasicData();

    // Add additional demo-specific data
    const results = { ...basicData };

    try {
      // Create additional demo clients
      const demoClients = await Promise.all([
        this.createDemoClient('ABC Security Corp', 'abc@security.com'),
        this.createDemoClient('XYZ Protection Services', 'xyz@protection.com'),
      ]);
      results.demoClients = demoClients.map(c => c.id);

      // Create demo shifts
      const demoShifts = await this.createDemoShifts(basicData.testSite, basicData.testAgent.id);
      results.demoShifts = demoShifts.map(s => s.id);

      logger.info('Demo data seeded successfully', results);
      return results;

    } catch (error) {
      logger.error('Failed to seed demo data', { error: error.message });
      throw error;
    }
  }

  /**
   * Create demo client
   */
  async createDemoClient(companyName, email) {
    return await this.prisma.client.create({
      data: {
        companyName,
        contactPerson: {
          name: `Contact for ${companyName}`,
          email,
          phone: '+1234567890',
        },
        billingAddress: {
          street: '123 Demo Street',
          city: 'Demo City',
          state: 'DC',
          zipCode: '12345',
          country: 'USA',
        },
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Create demo shifts
   */
  async createDemoShifts(siteId, agentId) {
    const shifts = [];
    const now = new Date();

    // Create shifts for the next 7 days
    for (let i = 0; i < 7; i++) {
      const shiftDate = new Date(now);
      shiftDate.setDate(now.getDate() + i);
      shiftDate.setHours(9, 0, 0, 0);

      const endDate = new Date(shiftDate);
      endDate.setHours(17, 0, 0, 0);

      const shift = await this.prisma.shift.create({
        data: {
          siteId,
          agentId,
          startTime: shiftDate,
          endTime: endDate,
          status: 'SCHEDULED',
          shiftType: 'REGULAR',
          createdBy: '00000000-0000-0000-0000-000000000000', // Will be updated with actual admin ID
          requirements: {
            skills: ['Security'],
            certifications: [],
          },
        },
      });

      shifts.push(shift);
    }

    return shifts;
  }

  /**
   * Verify seeding was successful
   */
  async verifySeeding() {
    try {
      const [userCount, clientCount, siteCount, configCount] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.client.count(),
        this.prisma.site.count(),
        this.prisma.systemConfiguration.count(),
      ]);

      logger.info('Seeding verification', {
        userCount,
        clientCount,
        siteCount,
        configCount,
      });

      if (userCount === 0) {
        throw new Error('No users created during seeding');
      }

      if (configCount === 0) {
        throw new Error('No system configuration created during seeding');
      }

      return true;
    } catch (error) {
      throw new Error(`Seeding verification failed: ${error.message}`);
    }
  }

  /**
   * Generate secure password
   */
  generateSecurePassword(length = 16) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }

  /**
   * Clear all data (use with caution)
   */
  async clearData() {
    if (this.environment === 'production') {
      throw new Error('Cannot clear data in production environment');
    }

    logger.warn('Clearing all database data');

    // Delete in reverse dependency order
    await this.prisma.auditLog.deleteMany();
    await this.prisma.notification.deleteMany();
    await this.prisma.message.deleteMany();
    await this.prisma.report.deleteMany();
    await this.prisma.shift.deleteMany();
    await this.prisma.agent.deleteMany();
    await this.prisma.site.deleteMany();
    await this.prisma.client.deleteMany();
    await this.prisma.user.deleteMany();
    await this.prisma.systemConfiguration.deleteMany();

    logger.info('Database data cleared');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--force':
        options.force = true;
        break;
      case '--type':
        options.seedType = args[++i];
        break;
      case '--clear':
        options.clear = true;
        break;
    }
  }

  const seeder = new DatabaseSeeder();

  if (options.clear) {
    seeder.clearData()
      .then(() => {
        console.log('Database cleared successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed to clear database:', error.message);
        process.exit(1);
      });
  } else {
    seeder.seed(options)
      .then((result) => {
        console.log('Seeding completed successfully:', result);
        process.exit(0);
      })
      .catch((error) => {
        console.error('Seeding failed:', error.message);
        process.exit(1);
      });
  }
}

module.exports = DatabaseSeeder;
