const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Note: User authentication is now handled by Clerk
  // No need to create users with passwords in the database
  // Users will be created automatically when they sign up through Clerk

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📋 Summary:');
  console.log('- Authentication: Handled by Clerk');
  console.log('- Users: Created automatically through Clerk sign-up');
  console.log('\n⚠️  IMPORTANT: Configure Clerk authentication in your environment variables!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
