import { PrismaClient, Role, ChallengeStatus, OrderStatus, TradingAccountStatus, RuleType } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import Decimal from 'decimal.js';
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

async function main() {
  console.log('🌱 Creating admin trading account...\n');

  // Get admin user
  const adminUser = await prisma.user.findUnique({
    where: { email: 'admin@tradeing.local' },
  });

  if (!adminUser) {
    throw new Error('Admin user not found.');
  }

  console.log(`✅ Found admin user: ${adminUser.email} (${adminUser.id})`);

  // Check if admin already has a trading account
  const existingAccount = await prisma.tradingAccount.findFirst({
    where: { userId: adminUser.id },
  });

  if (existingAccount) {
    console.log(`⏭️  Trading account already exists: ${existingAccount.accountNumber}`);
    console.log(`   Status: ${existingAccount.status}`);
    console.log(`   Balance: $${existingAccount.currentBalance}`);
    console.log(`   ID: ${existingAccount.id}`);
    console.log(`\n✅ Admin account ready!`);
    return;
  }

  // Get rule set
  let ruleSet = await prisma.ruleSet.findFirst({
    where: { name: 'Standard Rules' },
  });

  if (!ruleSet) {
    console.log('📋 Creating rule set...');
    
    // Create rules
    const profitTargetRule = await prisma.tradingRule.create({
      data: {
        name: 'Profit Target',
        description: 'Reach 10% profit to pass',
        type: RuleType.PROFIT_TARGET,
        value: new Decimal(10),
        isPercentage: true,
        isActive: true,
      },
    });

    const maxDrawdownRule = await prisma.tradingRule.create({
      data: {
        name: 'Maximum Drawdown',
        description: 'Do not lose more than 10%',
        type: RuleType.MAX_DRAWDOWN,
        value: new Decimal(10),
        isPercentage: true,
        isActive: true,
      },
    });

    const dailyLossRule = await prisma.tradingRule.create({
      data: {
        name: 'Daily Loss Limit',
        description: 'Do not lose more than 5% in one day',
        type: RuleType.DAILY_LOSS,
        value: new Decimal(5),
        isPercentage: true,
        isActive: true,
      },
    });

    const minTradingDaysRule = await prisma.tradingRule.create({
      data: {
        name: 'Minimum Trading Days',
        description: 'Trade at least 5 days',
        type: RuleType.MIN_TRADING_DAYS,
        value: new Decimal(5),
        isPercentage: false,
        isActive: true,
      },
    });

    ruleSet = await prisma.ruleSet.create({
      data: {
        name: 'Standard Rules',
        description: 'Standard challenge rules',
        isActive: true,
      },
    });

    await prisma.ruleSetRule.createMany({
      data: [
        { ruleSetId: ruleSet.id, ruleId: profitTargetRule.id },
        { ruleSetId: ruleSet.id, ruleId: maxDrawdownRule.id },
        { ruleSetId: ruleSet.id, ruleId: dailyLossRule.id },
        { ruleSetId: ruleSet.id, ruleId: minTradingDaysRule.id },
      ],
    });

    console.log(`✅ Rule set created: ${ruleSet.name}`);
  } else {
    console.log(`✅ Found existing rule set: ${ruleSet.name}`);
  }

  // Get challenge plan
  let challengePlan = await prisma.challengePlan.findFirst({
    where: { status: ChallengeStatus.ACTIVE },
  });

  if (!challengePlan) {
    console.log('🎯 Creating challenge plan...');
    challengePlan = await prisma.challengePlan.create({
      data: {
        name: '$100K Challenge',
        description: 'Standard $100K trading challenge',
        accountSize: new Decimal(100000),
        price: new Decimal(499),
        currency: 'USD',
        status: ChallengeStatus.ACTIVE,
        ruleSetId: ruleSet.id,
      },
    });
    console.log(`✅ Challenge plan created: ${challengePlan.name}`);
  } else {
    console.log(`✅ Found existing challenge plan: ${challengePlan.name}`);
  }

  // Create order
  console.log('📦 Creating order...');
  const order = await prisma.order.create({
    data: {
      userId: adminUser.id,
      challengePlanId: challengePlan.id,
      amount: challengePlan.price,
      currency: challengePlan.currency,
      status: OrderStatus.PAID,
      planSnapshot: {
        name: challengePlan.name,
        accountSize: challengePlan.accountSize.toString(),
        price: challengePlan.price.toString(),
      },
    },
  });
  console.log(`✅ Order created: ${order.id}`);

  // Create payment
  console.log('💳 Creating payment...');
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: challengePlan.price,
      currency: challengePlan.currency,
      status: 'COMPLETED',
      provider: 'DEV_TEST',
      providerReference: `ADMIN-TEST-${Date.now()}`,
      method: 'TEST',
      reference: 'ADMIN_TEST_PAYMENT',
      metadata: {
        note: 'Admin test account',
        createdBy: 'create-admin-account.ts',
      },
    },
  });
  console.log(`✅ Payment created: ${payment.id}`);

  // Generate account number
  const year = new Date().getFullYear();
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  const accountNumber = `TRD-${year}-${randomNum}`;

  // Create trading account
  console.log('💼 Creating trading account...');
  const tradingAccount = await prisma.tradingAccount.create({
    data: {
      userId: adminUser.id,
      challengePlanId: challengePlan.id,
      orderId: order.id,
      ruleSetId: ruleSet.id,
      accountNumber,
      initialBalance: challengePlan.accountSize,
      currentBalance: challengePlan.accountSize,
      equity: challengePlan.accountSize,
      status: TradingAccountStatus.ACTIVE,
      startedAt: new Date(),
    },
  });
  console.log(`✅ Trading account created: ${tradingAccount.accountNumber}`);
  console.log(`   ID: ${tradingAccount.id}`);

  // Create initial account snapshot
  console.log('📊 Creating account snapshot...');
  await prisma.accountSnapshot.create({
    data: {
      tradingAccountId: tradingAccount.id,
      balance: challengePlan.accountSize,
      equity: challengePlan.accountSize,
      realizedPnl: new Decimal(0),
      unrealizedPnl: new Decimal(0),
      totalPnl: new Decimal(0),
    },
  });
  console.log(`✅ Snapshot created`);

  // Create notification preference
  const existingPref = await prisma.notificationPreference.findUnique({
    where: { userId: adminUser.id },
  });

  if (!existingPref) {
    console.log('🔔 Creating notification preferences...');
    await prisma.notificationPreference.create({
      data: {
        userId: adminUser.id,
        inAppEnabled: true,
        emailEnabled: false,
        tradeNotifications: true,
        accountNotifications: true,
        challengeNotifications: true,
        orderNotifications: true,
        systemNotifications: true,
      },
    });
    console.log(`✅ Notification preferences created`);
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorId: adminUser.id,
      action: 'DEV_ACCOUNT_CREATED',
      entityType: 'TradingAccount',
      entityId: tradingAccount.id,
      metadata: {
        accountNumber: tradingAccount.accountNumber,
        source: 'create-admin-account.ts',
        note: 'Admin test account',
      },
    },
  });

  console.log(`\n✅ Admin trading account ready!`);
  console.log(`\n📊 Account Details:`);
  console.log(`   Account Number: ${tradingAccount.accountNumber}`);
  console.log(`   Account ID: ${tradingAccount.id}`);
  console.log(`   User: ${adminUser.email}`);
  console.log(`   Challenge: ${challengePlan.name}`);
  console.log(`   Balance: $${tradingAccount.currentBalance.toLocaleString()}`);
  console.log(`   Status: ${tradingAccount.status}`);
  console.log(`\n🔐 Login with:`);
  console.log(`   Email: admin@tradeing.local`);
  console.log(`   Password: Admin123!SecurePassword`);
  console.log(`\n⚠️  This is a TEST account for development only!\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error creating admin account:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
