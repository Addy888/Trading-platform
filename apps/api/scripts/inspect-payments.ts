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
  allowPublicKeyRetrieval: true,
  connectionLimit: 10,
  acquireTimeout: 10000,
  idleTimeout: 60000,
});

const prisma = new PrismaClient({ adapter });

async function inspect() {
  try {
    console.log('🔍 Inspecting Payments Table...\n');

    // Count total payments
    const totalPayments = await prisma.payment.count();
    console.log(`📊 Total Payments: ${totalPayments}`);

    if (totalPayments > 0) {
      // Get distinct statuses
      const payments = await prisma.payment.findMany({
        select: { status: true },
      });

      const statusCounts: Record<string, number> = {};
      payments.forEach((p) => {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      });

      console.log('\n📈 Status Distribution:');
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`   ${status}: ${count} records`);
      });

      // Sample payment records
      const samplePayments = await prisma.payment.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              amount: true,
              status: true,
            },
          },
        },
      });

      console.log('\n📋 Sample Payment Records:');
      samplePayments.forEach((p) => {
        console.log(`   ID: ${p.id}`);
        console.log(`   Status: ${p.status}`);
        console.log(`   Amount: ${p.amount} ${p.currency}`);
        console.log(`   Order Status: ${p.order.status}`);
        console.log(`   Created: ${p.createdAt}`);
        console.log('   ---');
      });
    } else {
      console.log('\n✅ No payment records found in database.');
    }

    // Check enum definition from database
    console.log('\n🔧 Database Enum Definition:');
    const enumCheck = await prisma.$queryRaw<Array<{ COLUMN_TYPE: string }>>`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payments' 
        AND COLUMN_NAME = 'status'
    `;

    if (enumCheck && enumCheck.length > 0) {
      console.log(`   ${enumCheck[0].COLUMN_TYPE}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

inspect();
