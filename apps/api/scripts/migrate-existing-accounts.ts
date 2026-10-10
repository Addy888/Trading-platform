/**
 * Data Migration Script: Populate High Water Mark for Existing Accounts
 * 
 * This script initializes the highWaterMark field for existing trading accounts.
 * For accounts with no trades, HWM = initialBalance
 * For accounts with trades, HWM = max(initialBalance, highest equity in history)
 */

import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import Decimal from 'decimal.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create adapter
const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'trading_app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tradeing_db',
  connectionLimit: 10,
  acquireTimeout: 10000,
  idleTimeout: 60000,
  allowPublicKeyRetrieval: true,
  connectTimeout: 10000,
});

const prisma = new PrismaClient({ adapter });

async function migrateExistingAccounts() {
  console.log('Starting data migration for existing trading accounts...\n');

  // Find all accounts with highWaterMark = 0 (needs initialization)
  const accounts = await prisma.tradingAccount.findMany({
    where: {
      highWaterMark: 0,
    },
    include: {
      snapshots: {
        orderBy: {
          equity: 'desc',
        },
        take: 1,
      },
    },
  });

  console.log(`Found ${accounts.length} accounts needing HWM initialization\n`);

  let updatedCount = 0;

  for (const account of accounts) {
    let hwm: Decimal;

    if (account.snapshots.length > 0) {
      // Use highest snapshot equity
      const highestSnapshot = account.snapshots[0];
      hwm = Decimal.max(
        new Decimal(account.initialBalance),
        new Decimal(highestSnapshot.equity),
        new Decimal(account.equity),
      );
    } else {
      // No snapshots, use current equity or initial balance, whichever is higher
      hwm = Decimal.max(
        new Decimal(account.initialBalance),
        new Decimal(account.equity),
      );
    }

    await prisma.tradingAccount.update({
      where: { id: account.id },
      data: {
        highWaterMark: hwm,
        dailyStartBalance: account.currentBalance,
        dailyStartEquity: account.equity,
        lastDailyResetAt: new Date(),
      },
    });

    updatedCount++;
    console.log(`✓ Account ${account.accountNumber}: HWM = ${hwm.toFixed(2)}`);
  }

  console.log(`\n✅ Migration complete! Updated ${updatedCount} accounts.`);
}

migrateExistingAccounts()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
