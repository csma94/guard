import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from '@jest/globals';

// Global test setup
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/bahinlink_test',
    },
  },
});

beforeAll(async () => {
  // Connect to test database
  await prisma.$connect();
  
  // Run migrations
  const { execSync } = require('child_process');
  execSync('npx prisma migrate deploy', {
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/bahinlink_test',
    },
  });
});

afterAll(async () => {
  // Clean up test database
  await prisma.$executeRaw`TRUNCATE TABLE "User", "Agent", "Client", "Site", "Shift", "Report", "Incident", "Notification" RESTART IDENTITY CASCADE`;
  await prisma.$disconnect();
});

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.CLERK_SECRET_KEY = 'test-clerk-secret';
process.env.NODE_ENV = 'test';

// Mock external services
jest.mock('../src/services/integrationService', () => ({
  integrationService: {
    sendEmail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    sendSMS: jest.fn().mockResolvedValue({ messageId: 'test-sms-id' }),
    sendPushNotification: jest.fn().mockResolvedValue({ success: 1, failure: 0 }),
    sendWebhook: jest.fn().mockResolvedValue({}),
    getWeatherData: jest.fn().mockResolvedValue({
      temperature: 22,
      condition: 'Clear',
      description: 'Clear sky',
    }),
    reverseGeocode: jest.fn().mockResolvedValue({
      address: '123 Test Street, Test City, TC 12345',
      components: [],
      placeId: 'test-place-id',
    }),
    uploadFile: jest.fn().mockResolvedValue({
      url: 'https://test-bucket.s3.amazonaws.com/test-file.jpg',
      key: 'test-file.jpg',
      bucket: 'test-bucket',
    }),
    notifyEmergencyServices: jest.fn().mockResolvedValue({}),
    sendAnalyticsEvent: jest.fn().mockResolvedValue({}),
  },
}));

// Global test utilities
global.testUtils = {
  createTestUser: async (overrides = {}) => {
    return prisma.user.create({
      data: {
        email: 'test@example.com',
        password: '$2b$10$test.hash.password',
        firstName: 'Test',
        lastName: 'User',
        role: 'AGENT',
        isActive: true,
        ...overrides,
      },
    });
  },

  createTestClient: async (overrides = {}) => {
    return prisma.client.create({
      data: {
        companyName: 'Test Company',
        contactEmail: 'contact@testcompany.com',
        contactPhone: '+1234567890',
        status: 'ACTIVE',
        billingAddress: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'TC',
          zipCode: '12345',
          country: 'US',
        },
        ...overrides,
      },
    });
  },

  createTestSite: async (clientId: string, overrides = {}) => {
    return prisma.site.create({
      data: {
        name: 'Test Site',
        clientId,
        address: {
          street: '456 Site Street',
          city: 'Site City',
          state: 'SC',
          zipCode: '67890',
          country: 'US',
        },
        siteType: 'commercial',
        status: 'ACTIVE',
        ...overrides,
      },
    });
  },

  createTestAgent: async (userId: string, overrides = {}) => {
    return prisma.agent.create({
      data: {
        userId,
        employeeId: 'EMP001',
        status: 'ACTIVE',
        hireDate: new Date(),
        ...overrides,
      },
    });
  },

  createTestShift: async (agentId: string, siteId: string, overrides = {}) => {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 8 * 60 * 60 * 1000); // 8 hours later

    return prisma.shift.create({
      data: {
        agentId,
        siteId,
        startTime,
        endTime,
        status: 'SCHEDULED',
        ...overrides,
      },
    });
  },

  createTestIncident: async (siteId: string, reportedBy: string, overrides = {}) => {
    return prisma.incident.create({
      data: {
        type: 'SECURITY_BREACH',
        severity: 'MEDIUM',
        status: 'OPEN',
        title: 'Test Incident',
        description: 'Test incident description',
        location: 'Test Location',
        siteId,
        reportedBy,
        ...overrides,
      },
    });
  },

  createTestReport: async (agentId: string, siteId: string, overrides = {}) => {
    return prisma.report.create({
      data: {
        type: 'PATROL',
        title: 'Test Report',
        description: 'Test report description',
        status: 'SUBMITTED',
        agentId,
        siteId,
        ...overrides,
      },
    });
  },

  cleanupTestData: async () => {
    // Clean up in reverse dependency order
    await prisma.notification.deleteMany();
    await prisma.report.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.site.deleteMany();
    await prisma.client.deleteMany();
    await prisma.user.deleteMany();
  },

  generateJWT: (payload: any) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  },

  mockClerkUser: (overrides = {}) => ({
    id: 'clerk_test_user_id',
    emailAddresses: [{ emailAddress: 'test@example.com' }],
    firstName: 'Test',
    lastName: 'User',
    ...overrides,
  }),
};

// Extend global types
declare global {
  var testUtils: {
    createTestUser: (overrides?: any) => Promise<any>;
    createTestClient: (overrides?: any) => Promise<any>;
    createTestSite: (clientId: string, overrides?: any) => Promise<any>;
    createTestAgent: (userId: string, overrides?: any) => Promise<any>;
    createTestShift: (agentId: string, siteId: string, overrides?: any) => Promise<any>;
    createTestIncident: (siteId: string, reportedBy: string, overrides?: any) => Promise<any>;
    createTestReport: (agentId: string, siteId: string, overrides?: any) => Promise<any>;
    cleanupTestData: () => Promise<void>;
    generateJWT: (payload: any) => string;
    mockClerkUser: (overrides?: any) => any;
  };
}

export { prisma };
