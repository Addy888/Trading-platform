const mysql = require('mysql2/promise');
require('dotenv').config();

async function applyMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'trading_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tradeing_db',
  });

  console.log('Connected to MySQL database');

  try {
    // 1. Modify challengePlanId to be nullable
    console.log('Making trading_accounts.challengePlanId nullable...');
    await connection.execute(`
      ALTER TABLE trading_accounts MODIFY COLUMN challengePlanId VARCHAR(191) NULL
    `);
    console.log('✓ challengePlanId is now nullable');

    // 2. Modify orderId to be nullable
    console.log('Making trading_accounts.orderId nullable...');
    await connection.execute(`
      ALTER TABLE trading_accounts MODIFY COLUMN orderId VARCHAR(191) NULL
    `);
    console.log('✓ orderId is now nullable');

    // 3. Add executionMode if not exists
    const [cols] = await connection.execute('SHOW COLUMNS FROM trading_accounts');
    const existingCols = cols.map((c) => c.Field);
    if (!existingCols.includes('executionMode')) {
      console.log('Adding executionMode column to trading_accounts...');
      await connection.execute(`
        ALTER TABLE trading_accounts ADD COLUMN executionMode VARCHAR(50) NOT NULL DEFAULT 'SIMULATED'
      `);
      console.log('✓ executionMode column added');
    }

    console.log('\n========================================');
    console.log('✓✓✓ TRADING ACCOUNT FUNDING MIGRATION APPLIED! ✓✓✓');
    console.log('========================================\n');
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

applyMigration();
