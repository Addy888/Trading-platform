import { PrismaClient, TradingAccountStatus, OrderStatus, PaymentStatusExtended } from '@prisma/client';
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

async function ensureAccountForUser(userId: string, userEmail: string) {
  // Check if user already has an account
  const existingAccount = await prisma.tradingAccount.findFirst({
    where: { userId },
  });

  if (existingAccount) {
    console.log(`✅ User ${userEmail} already has account: ${existingAccount.accountNumber}`);
    return existingAccount;
  }

  console.log(`❌ User ${userEmail} has no account. Creating one...`);

  // Find or create challenge plan
  let challengePlan = await prisma.challengePlan.findFirst({
    where: {
      name: '$100K Challenge',
      status: 'ACTIVE',
    },
  });

  if (!challengePlan) {
    console.log('Creating challenge plan...');
    challengePlan = await prisma.challengePlan.create({
      data: {
        name: '$100K Challenge',
        description: 'Trade a $100,000 account',
        accountSize: 100000,
        price: 499,
        profitTarget: 10,
        maxDrawdown: 10,
        dailyLossLimit: 5,
        minimumTradingDays: 5,
        leverage: 100,
        status: 'ACTIVE',
      },
    });
  }

  // Find or create rule set
  let ruleSet = await prisma.ruleSet.findFirst({
    where: {
      name: 'Standard Rules',
    },
  });

  if (!ruleSet) {
    console.log('Creating rule set...');
    
    // Create rules
    const profitTargetRule = await prisma.tradingRule.findFirst({
      where: { type: 'PROFIT_TARGET' },
    }) || await prisma.tradingRule.create({
      data: {
        type: 'PROFIT_TARGET',
        name: 'Profit Target',
        description: 'Reach the profit target',
        value: 10,
      },
    });

    const maxDrawdownRule = await prisma.tradingRule.findFirst({
      where: { type: 'MAX_DRAWDOWN' },
    }) || await prisma.tradingRule.create({
      data: {
        type: 'MAX_DRAWDOWN',
        name: 'Maximum Drawdown',
        description: 'Do not exceed maximum drawdown',
        value: 10,
      },
    });

    const dailyLossRule = await prisma.tradingRule.findFirst({
      where: { type: 'DAILY_LOSS' },
    }) || await prisma.tradingRule.create({
      data: {
        type: 'DAILY_LOSS',
        name: 'Daily Loss Limit',
        description: 'Do not exceed daily loss limit',
        value: 5,
      },
    });

    const minTradingDaysRule = await prisma.tradingRule.findFirst({
      where: { type: 'MIN_TRADING_DAYS' },
    }) || await prisma.tradingRule.create({
      data: {
        type: 'MIN_TRADING_DAYS',
        name: 'Minimum Trading Days',
        description: 'Trade for minimum number of days',
        value: 5,
      },
    });

    // Create rule set
    ruleSet = await prisma.ruleSet.create({
      data: {
        name: 'Standard Rules',
        description: 'Standard trading rules',
      },
    });

    // Link rules to rule set
    await Promise.all([
      prisma.ruleSetRule.create({
        data: {
          ruleSetId: ruleSet.id,
          ruleId: profitTargetRule.id,
          targetValue: 10,
        },
      }),
      prisma.ruleSetRule.create({
        data: {
          ruleSetId: ruleSet.id,
          ruleId: maxDrawdownRule.id,
          targetValue: 10,
        },
      }),
      prisma.ruleSetRule.create({
        data: {
          ruleSetId: ruleSet.id,
          ruleId: dailyLossRule.id,
          targetValue: 5,
        },
      }),
      prisma.ruleSetRule.create({
        data: {
          ruleSetId: ruleSet.id,
          ruleId: minTradingDaysRule.id,
          targetValue: 5,
        },
      }),
    ]);
  }

  // Create order
  const order = await prisma.order.create({
    data: {
      userId,
      challengePlanId: challengePlan.id,
      amount: 499,
      currency: 'USD',
      status: OrderStatus.PAID,
    },
  });

  // Create payment
  await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: 499,
      currency: 'USD',
      provider: 'DEV_TEST',
      providerReference: `DEV_PAYMENT_${Date.now()}`,
      status: PaymentStatusExtended.COMPLETED,
    },
  });

  // Generate unique account number
  const accountNumber = `TRD-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  // Create trading account
  const tradingAccount = await prisma.tradingAccount.create({
    data: {
      userId,
      challengePlanId: challengePlan.id,
      orderId: order.id,
      ruleSetId: ruleSet.id,
      accountNumber,
      initialBalance: 100000,
      currentBalance: 100000,
      equity: 100000,
      status: TradingAccountStatus.ACTIVE,
      startedAt: new Date(),
    },
  });

  // Create initial snapshot
  await prisma.accountSnapshot.create({
    data: {
      tradingAccountId: tradingAccount.id,
      balance: 100000,
      equity: 100000,
      unrealizedPnl: 0,
      realizedPnl: 0,
    },
  });

  // Create notification preferences if not exist
  const existingPrefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (!existingPrefs) {
    await prisma.notificationPreference.create({
      data: {
        userId,
        inAppEnabled: true,
        emailEnabled: false,
        tradeNotifications: true,
        accountNotifications: true,
        challengeNotifications: true,
        orderNotifications: true,
        systemNotifications: true,
      },
    });
  }

  console.log(`✅ Created trading account: ${accountNumber} (ID: ${tradingAccount.id})`);
  return tradingAccount;
}

async function main() {
  console.log('=== ENSURING TEST ACCOUNTS ===\n');

  // Get all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      _count: {
        select: {
          tradingAccounts: true,
        },
      },
    },
  });

  console.log(`Found ${users.length} users:\n`);

  for (const user of users) {
    console.log(`User: ${user.email} (${user.firstName} ${user.lastName})`);
    console.log(`  Trading Accounts: ${user._count.tradingAccounts}`);
    
    if (user._count.tradingAccounts === 0) {
      await ensureAccountForUser(user.id, user.email);
    }
    
    console.log('');
  }

  // Show final status
  console.log('=== FINAL STATUS ===\n');
  const allAccounts = await prisma.tradingAccount.findMany({
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  allAccounts.forEach((acc) => {
    console.log(`Account: ${acc.accountNumber}`);
    console.log(`  ID: ${acc.id}`);
    console.log(`  Owner: ${acc.user.email}`);
    console.log(`  Status: ${acc.status}`);
    console.log(`  Balance: $${acc.currentBalance}`);
    console.log('');
  });
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
