import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'trading_app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tradeing_db',
  // Fix RSA public key authentication issue
  allowPublicKeyRetrieval: true,
  connectionLimit: 10,
  acquireTimeout: 10000,
  idleTimeout: 60000,
});

const prisma = new PrismaClient({ adapter });

async function verify() {
  console.log('🔍 Verifying test accounts...\n');

  const testEmails = ['admin@tradeing.local', 'user@tradeing.local'];

  for (const email of testEmails) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        passwordHash: true,
        createdAt: true,
      },
    });

    if (user) {
      console.log(`✅ ${user.role} Account Found:`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Active: ${user.isActive}`);
      console.log(`   Email Verified: ${user.isEmailVerified}`);
      console.log(`   Password Hash: ${user.passwordHash.substring(0, 20)}... (${user.passwordHash.length} chars)`);
      console.log(`   Created: ${user.createdAt}`);
      console.log('');
    } else {
      console.log(`❌ Account not found: ${email}\n`);
    }
  }

  await prisma.$disconnect();
}

verify().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
