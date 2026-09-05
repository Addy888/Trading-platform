import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Create adapter
const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'trading_app',
  password: process.env.DB_PASSWORD || 'TradingSecure2026!',
  database: process.env.DB_NAME || 'tradeing_db',
  connectionLimit: 10,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== ALL USERS ===');
  
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      _count: {
        select: {
          tradingAccounts: true,
        }
      }
    }
  });
  
  for (const user of users) {
    console.log(`\nUser: ${user.email}`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Name: ${user.firstName} ${user.lastName}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Trading Accounts: ${user._count.tradingAccounts}`);
    
    if (user._count.tradingAccounts > 0) {
      const accounts = await prisma.tradingAccount.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          accountNumber: true,
          status: true,
          currentBalance: true,
        }
      });
      
      accounts.forEach(acc => {
        console.log(`    - ${acc.accountNumber} (${acc.status}) $${acc.currentBalance} [ID: ${acc.id}]`);
      });
    }
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
