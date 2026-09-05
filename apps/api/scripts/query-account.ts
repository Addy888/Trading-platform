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
  const accountId = '53d75a67-253b-421d-b865-4ed8251ecc66';
  
  console.log('=== INVESTIGATING ACCOUNT ===');
  console.log('Account ID:', accountId);
  console.log('');
  
  // Find the account
  const account = await prisma.tradingAccount.findUnique({
    where: { id: accountId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        }
      },
      challengePlan: {
        select: {
          name: true,
          accountSize: true,
          status: true,
        }
      },
      order: {
        select: {
          id: true,
          status: true,
        }
      }
    }
  });
  
  if (!account) {
    console.log('❌ ACCOUNT NOT FOUND');
    console.log('');
    
    // Find all accounts in the database
    console.log('=== ALL ACCOUNTS IN DATABASE ===');
    const allAccounts = await prisma.tradingAccount.findMany({
      include: {
        user: {
          select: {
            email: true,
          }
        }
      }
    });
    
    allAccounts.forEach((acc) => {
      console.log(`Account: ${acc.accountNumber}`);
      console.log(`  ID: ${acc.id}`);
      console.log(`  Owner: ${acc.user.email}`);
      console.log(`  Status: ${acc.status}`);
      console.log(`  Balance: $${acc.currentBalance}`);
      console.log('');
    });
  } else {
    console.log('✅ ACCOUNT FOUND');
    console.log('Account Number:', account.accountNumber);
    console.log('Owner User ID:', account.userId);
    console.log('Owner Email:', account.user.email);
    console.log('Owner Name:', `${account.user.firstName} ${account.user.lastName}`);
    console.log('Status:', account.status);
    console.log('Balance:', `$${account.currentBalance}`);
    console.log('Equity:', `$${account.equity}`);
    console.log('Challenge Plan:', account.challengePlan?.name || 'None');
    console.log('Order Status:', account.order?.status || 'None');
    console.log('');
  }
  
  // Find User Test
  console.log('=== FINDING USER TEST ===');
  const userTest = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { contains: 'user@tradeing.local' } },
        { firstName: { contains: 'User' } },
        { lastName: { contains: 'Test' } },
      ]
    }
  });
  
  if (userTest) {
    console.log('✅ USER TEST FOUND');
    console.log('User ID:', userTest.id);
    console.log('Email:', userTest.email);
    console.log('Name:', `${userTest.firstName} ${userTest.lastName}`);
    console.log('');
    
    // Find User Test's accounts
    console.log('=== USER TEST ACCOUNTS ===');
    const userAccounts = await prisma.tradingAccount.findMany({
      where: { userId: userTest.id },
      include: {
        challengePlan: {
          select: {
            name: true,
          }
        }
      }
    });
    
    if (userAccounts.length === 0) {
      console.log('❌ NO ACCOUNTS FOUND FOR USER TEST');
    } else {
      userAccounts.forEach((acc) => {
        console.log(`Account: ${acc.accountNumber}`);
        console.log(`  ID: ${acc.id}`);
        console.log(`  Status: ${acc.status}`);
        console.log(`  Balance: $${acc.currentBalance}`);
        console.log(`  Challenge: ${acc.challengePlan?.name || 'None'}`);
        console.log('');
      });
    }
  } else {
    console.log('❌ USER TEST NOT FOUND');
  }
  
  // Check if there's a mismatch
  if (account && userTest && account.userId !== userTest.id) {
    console.log('⚠️  OWNERSHIP MISMATCH');
    console.log('Account belongs to:', account.user.email);
    console.log('But trying to access as:', userTest.email);
    console.log('This is why ACCESS DENIED is showing.');
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
