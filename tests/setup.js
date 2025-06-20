const { PrismaClient } = require('@prisma/client');
// Note: bcrypt removed - authentication now handled by Clerk

// Test database setup
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/bahinlink_test'
    }
  }
});

// Global test setup
beforeAll(async () => {
  // Clean up test database
  await cleanupDatabase();
  
  // Seed test data
  await seedTestData();
});

afterAll(async () => {
  // Clean up after all tests
  await cleanupDatabase();
  await prisma.$disconnect();
});

// Clean up database before each test
beforeEach(async () => {
  // Clean up dynamic test data (keep seed data)
  await cleanupDynamicData();
});

async function cleanupDatabase() {
  // Delete in correct order to avoid foreign key constraints
  await prisma.locationTracking.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.report.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.emergencyAlert.deleteMany();
  await prisma.message.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.supervisor.deleteMany();
  await prisma.client.deleteMany();
  await prisma.site.deleteMany();
  await prisma.user.deleteMany();
}

async function cleanupDynamicData() {
  // Clean up data that changes during tests but keep seed data
  await prisma.locationTracking.deleteMany({
    where: {
      NOT: {
        agentId: { in: ['test-agent-1', 'test-agent-2'] }
      }
    }
  });
  
  await prisma.attendance.deleteMany({
    where: {
      NOT: {
        agentId: { in: ['test-agent-1', 'test-agent-2'] }
      }
    }
  });
  
  await prisma.report.deleteMany({
    where: {
      NOT: {
        agentId: { in: ['test-agent-1', 'test-agent-2'] }
      }
    }
  });
  
  await prisma.shift.deleteMany({
    where: {
      NOT: {
        agentId: { in: ['test-agent-1', 'test-agent-2'] }
      }
    }
  });
}

async function seedTestData() {
  // Create test users
  const hashedPassword = 'clerk_managed_password';
  
  // Admin user
  const adminUser = await prisma.user.create({
    data: {
      id: 'test-admin-1',
      username: 'testadmin',
      email: 'admin@test.com',
      password: hashedPassword,
      role: 'ADMIN',
      profile: {
        firstName: 'Test',
        lastName: 'Admin',
        phoneNumber: '+1234567890',
      },
      isActive: true,
      emailVerified: true,
    },
  });

  // Supervisor user
  const supervisorUser = await prisma.user.create({
    data: {
      id: 'test-supervisor-1',
      username: 'testsupervisor',
      email: 'supervisor@test.com',
      password: hashedPassword,
      role: 'SUPERVISOR',
      profile: {
        firstName: 'Test',
        lastName: 'Supervisor',
        phoneNumber: '+1234567891',
      },
      isActive: true,
      emailVerified: true,
    },
  });

  // Agent users
  const agentUser1 = await prisma.user.create({
    data: {
      id: 'test-agent-user-1',
      username: 'testagent1',
      email: 'agent1@test.com',
      password: hashedPassword,
      role: 'AGENT',
      profile: {
        firstName: 'Test',
        lastName: 'Agent One',
        phoneNumber: '+1234567892',
      },
      isActive: true,
      emailVerified: true,
    },
  });

  const agentUser2 = await prisma.user.create({
    data: {
      id: 'test-agent-user-2',
      username: 'testagent2',
      email: 'agent2@test.com',
      password: hashedPassword,
      role: 'AGENT',
      profile: {
        firstName: 'Test',
        lastName: 'Agent Two',
        phoneNumber: '+1234567893',
      },
      isActive: true,
      emailVerified: true,
    },
  });

  // Client user
  const clientUser = await prisma.user.create({
    data: {
      id: 'test-client-user-1',
      username: 'testclient',
      email: 'client@test.com',
      password: hashedPassword,
      role: 'CLIENT',
      profile: {
        firstName: 'Test',
        lastName: 'Client',
        phoneNumber: '+1234567894',
      },
      isActive: true,
      emailVerified: true,
    },
  });

  // Create test client
  const testClient = await prisma.client.create({
    data: {
      id: 'test-client-1',
      userId: clientUser.id,
      companyName: 'Test Security Company',
      contactInfo: {
        email: 'contact@testsecurity.com',
        phone: '+1234567895',
        address: '123 Test Street, Test City, TC 12345',
      },
      billingInfo: {
        address: '123 Test Street, Test City, TC 12345',
        paymentMethod: 'INVOICE',
      },
      contractDetails: {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        serviceLevel: 'PREMIUM',
      },
      status: 'ACTIVE',
    },
  });

  // Create test supervisor
  const testSupervisor = await prisma.supervisor.create({
    data: {
      id: 'test-supervisor-1',
      userId: supervisorUser.id,
      employeeId: 'SUP001',
      department: 'Operations',
      managedSites: ['test-site-1', 'test-site-2'],
      permissions: ['MANAGE_AGENTS', 'APPROVE_REPORTS', 'VIEW_ANALYTICS'],
    },
  });

  // Create test agents
  const testAgent1 = await prisma.agent.create({
    data: {
      id: 'test-agent-1',
      userId: agentUser1.id,
      employeeId: 'AGT001',
      employmentStatus: 'ACTIVE',
      employmentType: 'FULL_TIME',
      skills: ['Security Patrol', 'Emergency Response', 'Report Writing'],
      certifications: ['Security Guard License', 'First Aid'],
      hourlyRate: 25.00,
      supervisorId: testSupervisor.id,
    },
  });

  const testAgent2 = await prisma.agent.create({
    data: {
      id: 'test-agent-2',
      userId: agentUser2.id,
      employeeId: 'AGT002',
      employmentStatus: 'ACTIVE',
      employmentType: 'PART_TIME',
      skills: ['Security Patrol', 'Access Control'],
      certifications: ['Security Guard License'],
      hourlyRate: 22.00,
      supervisorId: testSupervisor.id,
    },
  });

  // Create test sites
  const testSite1 = await prisma.site.create({
    data: {
      id: 'test-site-1',
      name: 'Test Office Building',
      address: '456 Business Ave, Test City, TC 12345',
      coordinates: 'POINT(-122.4194 37.7749)',
      clientId: testClient.id,
      contactInfo: {
        primaryContact: 'John Doe',
        phone: '+1234567896',
        email: 'john@testbuilding.com',
      },
      requirements: {
        securityLevel: 'HIGH',
        accessControl: true,
        cameraSystem: true,
        alarmSystem: true,
      },
      operatingHours: {
        monday: { open: '06:00', close: '22:00' },
        tuesday: { open: '06:00', close: '22:00' },
        wednesday: { open: '06:00', close: '22:00' },
        thursday: { open: '06:00', close: '22:00' },
        friday: { open: '06:00', close: '22:00' },
        saturday: { open: '08:00', close: '18:00' },
        sunday: { open: '08:00', close: '18:00' },
      },
      status: 'ACTIVE',
    },
  });

  const testSite2 = await prisma.site.create({
    data: {
      id: 'test-site-2',
      name: 'Test Warehouse',
      address: '789 Industrial Blvd, Test City, TC 12345',
      coordinates: 'POINT(-122.4094 37.7849)',
      clientId: testClient.id,
      contactInfo: {
        primaryContact: 'Jane Smith',
        phone: '+1234567897',
        email: 'jane@testwarehouse.com',
      },
      requirements: {
        securityLevel: 'MEDIUM',
        accessControl: false,
        cameraSystem: true,
        alarmSystem: true,
      },
      operatingHours: {
        monday: { open: '00:00', close: '23:59' },
        tuesday: { open: '00:00', close: '23:59' },
        wednesday: { open: '00:00', close: '23:59' },
        thursday: { open: '00:00', close: '23:59' },
        friday: { open: '00:00', close: '23:59' },
        saturday: { open: '00:00', close: '23:59' },
        sunday: { open: '00:00', close: '23:59' },
      },
      status: 'ACTIVE',
    },
  });

  console.log('Test data seeded successfully');
}

// Export for use in tests
module.exports = {
  prisma,
  cleanupDatabase,
  cleanupDynamicData,
  seedTestData,
};
