import { PrismaClient, Role } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

// Create adapter with connection config (same as PrismaService)
const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tradeing_db',
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Test accounts for development
  const testAccounts = [
    {
      email: 'admin@tradeing.local',
      password: 'Admin@12345',
      firstName: 'Admin',
      lastName: 'Test',
      role: Role.ADMIN,
      isEmailVerified: true,
      isActive: true,
    },
    {
      email: 'user@tradeing.local',
      password: 'User@12345',
      firstName: 'User',
      lastName: 'Test',
      role: Role.USER,
      isEmailVerified: true,
      isActive: true,
    },
  ];

  let createdCount = 0;
  let existingCount = 0;

  for (const account of testAccounts) {
    const existing = await prisma.user.findUnique({
      where: { email: account.email },
    });

    if (existing) {
      console.log(`⏭️  ${account.role} account already exists: ${account.email}`);
      existingCount++;
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, 10);

    const user = await prisma.user.create({
      data: {
        email: account.email,
        passwordHash,
        firstName: account.firstName,
        lastName: account.lastName,
        role: account.role,
        isEmailVerified: account.isEmailVerified,
        isActive: account.isActive,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: `${account.role}_CREATED`,
        entityType: 'User',
        entityId: user.id,
        metadata: { email: user.email, source: 'seed' },
      },
    });

    console.log(`✅ ${account.role} account created: ${account.email}`);
    createdCount++;
  }

  console.log(`\n📊 Seed Summary:`);
  console.log(`   - Created: ${createdCount} accounts`);
  console.log(`   - Existing: ${existingCount} accounts`);
  console.log(`\n🔐 Test Account Credentials:`);
  console.log(`\n   ADMIN Account:`);
  console.log(`   Email: admin@tradeing.local`);
  console.log(`   Password: Admin@12345`);
  console.log(`   Role: ADMIN`);
  console.log(`\n   USER Account:`);
  console.log(`   Email: user@tradeing.local`);
  console.log(`   Password: User@12345`);
  console.log(`   Role: USER`);
  console.log(`\n⚠️  These are TEST accounts for development only!\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
