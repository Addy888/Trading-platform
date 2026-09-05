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

async function checkTables() {
  try {
    const tables = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME IN ('payouts', 'kyc_submissions', 'platform_settings')
    `;

    console.log('Tables from 20260904 migration:');
    if (tables.length === 0) {
      console.log('   ❌ None of the tables exist - migration needs to be applied');
    } else {
      tables.forEach((t) => {
        console.log(`   ✅ ${t.TABLE_NAME} exists`);
      });
      if (tables.length === 3) {
        console.log('\n✅ All tables exist - migration can be marked as applied');
      } else {
        console.log(`\n⚠️  Only ${tables.length}/3 tables exist - migration needs attention`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTables();
