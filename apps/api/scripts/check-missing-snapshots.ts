import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Create adapter
const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'trading_app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tradeing_db',
  allowPublicKeyRetrieval: true,
  connectionLimit: 10,
  acquireTimeout: 10000,
  idleTimeout: 60000,
});

const prisma = new PrismaClient({ adapter });

async function checkMissingSnapshots() {
  console.log('🔍 Checking for accounts missing rule snapshots...\n');

  const accounts = await prisma.tradingAccount.findMany({
    where: {
      ruleSnapshot: null,
    },
    select: {
      id: true,
      accountNumber: true,
      ruleSetId: true,
      status: true,
      createdAt: true,
      userId: true,
    },
  });

  console.log(`Found ${accounts.length} accounts without rule snapshots\n`);

  if (accounts.length > 0) {
    console.log('Accounts missing snapshots:');
    console.log('═'.repeat(80));
    for (const account of accounts) {
      console.log(`Account Number: ${account.accountNumber}`);
      console.log(`Account ID: ${account.id}`);
      console.log(`Rule Set ID: ${account.ruleSetId || 'MISSING!'}`);
      console.log(`Status: ${account.status}`);
      console.log(`Created: ${account.createdAt.toISOString()}`);
      console.log(`User ID: ${account.userId}`);
      console.log('─'.repeat(80));
    }
  } else {
    console.log('✅ All accounts have rule snapshots');
  }

  await prisma.$disconnect();
}

checkMissingSnapshots().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
