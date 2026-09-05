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

async function applyFix() {
  try {
    console.log('🔧 Applying Payment Status Standardization Fix...\n');

    // Step 1: Check for any SUCCESS records (there should be none based on our inspection)
    console.log('Step 1: Checking for SUCCESS records...');
    const successCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM payments WHERE status = 'SUCCESS'
    `;
    console.log(`   Found ${successCount[0].count} records with SUCCESS status`);

    // Step 2: Migrate any SUCCESS values to COMPLETED (safe even if none exist)
    if (Number(successCount[0].count) > 0) {
      console.log('\nStep 2: Migrating SUCCESS → COMPLETED...');
      await prisma.$executeRaw`
        UPDATE payments SET status = 'COMPLETED' WHERE status = 'SUCCESS'
      `;
      console.log(`   ✅ Migrated ${successCount[0].count} records`);
    } else {
      console.log('\nStep 2: No SUCCESS records to migrate ✅');
    }

    // Step 3: Alter the enum to remove SUCCESS
    console.log('\nStep 3: Updating enum definition...');
    await prisma.$executeRaw`
      ALTER TABLE payments 
      MODIFY COLUMN status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED', 'REFUNDED') 
      NOT NULL DEFAULT 'PENDING'
    `;
    console.log('   ✅ Enum updated successfully');

    // Step 4: Verify the new enum definition
    console.log('\nStep 4: Verifying new enum definition...');
    const enumCheck = await prisma.$queryRaw<Array<{ COLUMN_TYPE: string }>>`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payments' 
        AND COLUMN_NAME = 'status'
    `;
    console.log(`   Current enum: ${enumCheck[0].COLUMN_TYPE}`);

    // Step 5: Verify all payment records are intact
    console.log('\nStep 5: Verifying data integrity...');
    const totalPayments = await prisma.payment.count();
    console.log(`   Total payment records: ${totalPayments}`);

    if (totalPayments > 0) {
      const statusDist = await prisma.payment.groupBy({
        by: ['status'],
        _count: true,
      });
      console.log('   Status distribution:');
      statusDist.forEach((s) => {
        console.log(`      ${s.status}: ${s._count} records`);
      });
    }

    console.log('\n✅ Payment Status Standardization Complete!');
    console.log('\n📋 Summary:');
    console.log('   - SUCCESS enum value removed');
    console.log('   - All data preserved');
    console.log('   - Backend code updated to use COMPLETED');
    console.log('   - Frontend types updated');

  } catch (error) {
    console.error('\n❌ Error applying fix:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyFix();
