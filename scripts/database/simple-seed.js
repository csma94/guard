const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  try {
    // Note: User authentication is now handled by Clerk
    // No need to create users with passwords in the database
    // Users will be created automatically when they sign up through Clerk

    console.log('✅ Database seeding completed (Clerk handles user authentication)');
    console.log('\n📋 Summary:');
    console.log('- Authentication: Handled by Clerk');
    console.log('- Users: Created automatically through Clerk sign-up');
    console.log('\n⚠️  IMPORTANT: Configure Clerk authentication in your environment variables!');
        role: 'ADMIN',
        status: 'ACTIVE',
        profile: {
          firstName: 'Admin',
          lastName: 'User',
          phone: '+1234567890',
          avatar: null
        },
        preferences: {
          theme: 'light',
          notifications: {
            email: true,
            push: true,
            sms: false
          },
          language: 'en'
        }
      }
    });

    console.log('✅ Admin user created:', adminUser.email);

    // Create supervisor user
    const supervisorPasswordHash = await bcrypt.hash('supervisor123', 12);
    const supervisorUser = await prisma.user.upsert({
      where: { email: 'supervisor@bahinlink.com' },
      update: {},
      create: {
        username: 'supervisor',
        email: 'supervisor@bahinlink.com',
        passwordHash: supervisorPasswordHash,
        role: 'SUPERVISOR',
        status: 'ACTIVE',
        profile: {
          firstName: 'John',
          lastName: 'Supervisor',
          phone: '+1234567891',
          avatar: null
        },
        preferences: {
          theme: 'light',
          notifications: {
            email: true,
            push: true,
            sms: true
          },
          language: 'en'
        }
      }
    });

    console.log('✅ Supervisor user created:', supervisorUser.email);

    // Create demo client
    const demoClient = await prisma.client.upsert({
      where: { id: 'demo-client-id' },
      update: {},
      create: {
        id: 'demo-client-id',
        companyName: 'Demo Security Corp',
        contactPerson: {
          name: 'Jane Smith',
          email: 'jane.smith@demosecurity.com',
          phone: '+1234567892',
          position: 'Security Manager'
        },
        billingAddress: {
          street: '123 Business Ave',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'USA'
        },
        contractDetails: {
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          serviceLevel: 'premium',
          billingCycle: 'monthly'
        },
        serviceLevel: 'premium',
        status: 'ACTIVE',
        settings: {
          autoAssignment: true,
          realTimeTracking: true,
          geofencing: true,
          reportingFrequency: 'daily'
        }
      }
    });

    console.log('✅ Demo client created:', demoClient.companyName);

    // Create client user
    const clientPasswordHash = await bcrypt.hash('client123', 12);
    const clientUser = await prisma.user.upsert({
      where: { email: 'client@demosecurity.com' },
      update: {},
      create: {
        username: 'client',
        email: 'client@demosecurity.com',
        passwordHash: clientPasswordHash,
        role: 'CLIENT',
        status: 'ACTIVE',
        clientId: demoClient.id,
        profile: {
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+1234567892',
          avatar: null
        },
        preferences: {
          theme: 'light',
          notifications: {
            email: true,
            push: false,
            sms: true
          },
          language: 'en'
        }
      }
    });

    console.log('✅ Client user created:', clientUser.email);

    // Create demo sites
    const site1 = await prisma.site.upsert({
      where: { id: 'demo-site-1' },
      update: {},
      create: {
        id: 'demo-site-1',
        clientId: demoClient.id,
        name: 'Downtown Office Complex',
        address: {
          street: '456 Main Street',
          city: 'New York',
          state: 'NY',
          zipCode: '10002',
          country: 'USA'
        },
        coordinates: 'POINT(-74.0060 40.7128)', // NYC coordinates
        geofenceRadius: 100,
        qrCode: 'QR_SITE_001',
        siteType: 'commercial',
        accessInstructions: 'Use main entrance. Security desk on ground floor.',
        emergencyContacts: [
          {
            name: 'Building Manager',
            phone: '+1234567893',
            email: 'manager@building.com'
          }
        ],
        equipmentList: [
          'CCTV System',
          'Access Control',
          'Fire Alarm System',
          'Emergency Lighting'
        ],
        status: 'ACTIVE'
      }
    });

    const site2 = await prisma.site.upsert({
      where: { id: 'demo-site-2' },
      update: {},
      create: {
        id: 'demo-site-2',
        clientId: demoClient.id,
        name: 'Shopping Mall Security',
        address: {
          street: '789 Mall Avenue',
          city: 'New York',
          state: 'NY',
          zipCode: '10003',
          country: 'USA'
        },
        coordinates: 'POINT(-73.9851 40.7589)', // NYC coordinates
        geofenceRadius: 150,
        qrCode: 'QR_SITE_002',
        siteType: 'retail',
        accessInstructions: 'Enter through staff entrance. Report to security office.',
        emergencyContacts: [
          {
            name: 'Mall Security',
            phone: '+1234567894',
            email: 'security@mall.com'
          }
        ],
        equipmentList: [
          'CCTV Network',
          'Patrol Points',
          'Emergency Phones',
          'Metal Detectors'
        ],
        status: 'ACTIVE'
      }
    });

    console.log('✅ Demo sites created:', site1.name, 'and', site2.name);

    // Create agent user
    const agentPasswordHash = await bcrypt.hash('agent123', 12);
    const agentUser = await prisma.user.upsert({
      where: { email: 'agent@bahinlink.com' },
      update: {},
      create: {
        username: 'agent',
        email: 'agent@bahinlink.com',
        passwordHash: agentPasswordHash,
        role: 'AGENT',
        status: 'ACTIVE',
        profile: {
          firstName: 'Mike',
          lastName: 'Agent',
          phone: '+1234567895',
          avatar: null
        },
        preferences: {
          theme: 'light',
          notifications: {
            email: true,
            push: true,
            sms: true
          },
          language: 'en'
        }
      }
    });

    // Create agent profile
    const agent = await prisma.agent.upsert({
      where: { userId: agentUser.id },
      update: {},
      create: {
        userId: agentUser.id,
        employeeId: 'EMP001',
        hireDate: new Date('2024-01-15'),
        employmentStatus: 'ACTIVE',
        skills: ['Security Patrol', 'Emergency Response', 'Report Writing'],
        certifications: [
          {
            name: 'Security Guard License',
            issuer: 'State Security Board',
            expiryDate: '2025-01-15'
          }
        ],
        emergencyContact: {
          name: 'Sarah Agent',
          relationship: 'Spouse',
          phone: '+1234567896'
        },
        performanceMetrics: {
          shiftsCompleted: 0,
          averageRating: 0,
          incidentsReported: 0
        }
      }
    });

    console.log('✅ Agent created:', agentUser.email);

    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📋 Demo Credentials:');
    console.log('Admin: admin@bahinlink.com / admin123');
    console.log('Supervisor: supervisor@bahinlink.com / supervisor123');
    console.log('Agent: agent@bahinlink.com / agent123');
    console.log('Client: client@demosecurity.com / client123');

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
