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
    // 1. Update status enum in payments table
    console.log('Updating payments.status enum...');
    try {
      await connection.execute(`
        ALTER TABLE payments 
        MODIFY COLUMN status ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED', 'REFUNDED') 
        NOT NULL DEFAULT 'PENDING'
      `);
      console.log('✓ payments.status enum updated');
    } catch (e) {
      console.log('payments.status update notice:', e.message);
    }

    // 2. Modify orderId to be nullable in payments
    console.log('Modifying payments.orderId to be nullable...');
    try {
      await connection.execute(`
        ALTER TABLE payments MODIFY COLUMN orderId VARCHAR(191) NULL
      `);
      console.log('✓ payments.orderId made nullable');
    } catch (e) {
      console.log('payments.orderId update notice:', e.message);
    }

    // 3. Add columns to payments if they do not exist
    const [cols] = await connection.execute('SHOW COLUMNS FROM payments');
    const existingCols = cols.map((c) => c.Field);

    if (!existingCols.includes('userId')) {
      console.log('Adding userId to payments...');
      await connection.execute(`ALTER TABLE payments ADD COLUMN userId VARCHAR(191) NULL`);
    }

    if (!existingCols.includes('walletId')) {
      console.log('Adding walletId to payments...');
      await connection.execute(`ALTER TABLE payments ADD COLUMN walletId VARCHAR(191) NULL`);
    }

    if (!existingCols.includes('idempotencyKey')) {
      console.log('Adding idempotencyKey to payments...');
      await connection.execute(`ALTER TABLE payments ADD COLUMN idempotencyKey VARCHAR(191) NULL`);
    }

    // Add unique indexes on payments
    const [indexes] = await connection.execute('SHOW INDEX FROM payments');
    const existingIndexes = indexes.map((i) => i.Key_name);

    if (!existingIndexes.includes('payments_providerReference_key')) {
      console.log('Adding unique key payments_providerReference_key...');
      try {
        await connection.execute(`ALTER TABLE payments ADD UNIQUE KEY payments_providerReference_key (providerReference)`);
      } catch (err) {
        console.log('providerReference index notice:', err.message);
      }
    }

    if (!existingIndexes.includes('payments_idempotencyKey_key')) {
      console.log('Adding unique key payments_idempotencyKey_key...');
      try {
        await connection.execute(`ALTER TABLE payments ADD UNIQUE KEY payments_idempotencyKey_key (idempotencyKey)`);
      } catch (err) {
        console.log('idempotencyKey index notice:', err.message);
      }
    }

    // 4. Create wallets table
    console.log('Creating wallets table if not exists...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS wallets (
        id VARCHAR(191) NOT NULL,
        userId VARCHAR(191) NOT NULL,
        currency VARCHAR(191) NOT NULL DEFAULT 'USD',
        balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        lockedBalance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL,
        UNIQUE KEY wallets_userId_key (userId),
        PRIMARY KEY (id),
        CONSTRAINT wallets_userId_fkey FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('✓ wallets table ready');

    // 5. Create wallet_ledgers table
    console.log('Creating wallet_ledgers table if not exists...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS wallet_ledgers (
        id VARCHAR(191) NOT NULL,
        walletId VARCHAR(191) NOT NULL,
        type ENUM('DEPOSIT', 'WITHDRAWAL', 'TRANSFER_TO_TRADING', 'TRANSFER_FROM_TRADING', 'ORDER_PURCHASE', 'ADMIN_ADJUSTMENT', 'REFUND') NOT NULL,
        direction ENUM('CREDIT', 'DEBIT') NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        balanceBefore DECIMAL(12, 2) NOT NULL,
        balanceAfter DECIMAL(12, 2) NOT NULL,
        currency VARCHAR(191) NOT NULL DEFAULT 'USD',
        referenceType VARCHAR(191) NOT NULL,
        referenceId VARCHAR(191) NULL,
        providerReference VARCHAR(191) NULL,
        description TEXT NULL,
        metadata JSON NULL,
        actorId VARCHAR(191) NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX wallet_ledgers_walletId_createdAt_idx (walletId, createdAt),
        INDEX wallet_ledgers_providerReference_idx (providerReference),
        INDEX wallet_ledgers_referenceType_referenceId_idx (referenceType, referenceId),
        PRIMARY KEY (id),
        CONSTRAINT wallet_ledgers_walletId_fkey FOREIGN KEY (walletId) REFERENCES wallets(id) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('✓ wallet_ledgers table ready');

    // 6. Ensure payments foreign keys
    try {
      await connection.execute(`
        ALTER TABLE payments 
        ADD CONSTRAINT payments_userId_fkey FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      `);
    } catch (e) {
      // Index/fkey already exists
    }

    try {
      await connection.execute(`
        ALTER TABLE payments 
        ADD CONSTRAINT payments_walletId_fkey FOREIGN KEY (walletId) REFERENCES wallets(id) ON DELETE SET NULL
      `);
    } catch (e) {
      // Index/fkey already exists
    }

    // 7. Seed wallets for all existing users if missing
    const [users] = await connection.execute('SELECT id FROM users');
    for (const u of users) {
      const [existingWallet] = await connection.execute('SELECT id FROM wallets WHERE userId = ?', [u.id]);
      if (existingWallet.length === 0) {
        const walletId = require('crypto').randomUUID();
        await connection.execute(
          'INSERT INTO wallets (id, userId, currency, balance, lockedBalance, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(3))',
          [walletId, u.id, 'USD', '0.00', '0.00']
        );
        console.log(`✓ Created wallet for user: ${u.id}`);
      }
    }

    // 8. Populate payments.userId and payments.walletId from orders if empty
    await connection.execute(`
      UPDATE payments p
      JOIN orders o ON p.orderId = o.id
      JOIN wallets w ON o.userId = w.userId
      SET p.userId = o.userId, p.walletId = w.id
      WHERE p.userId IS NULL
    `);
    console.log('✓ Existing payments mapped to users and wallets');

    console.log('\n========================================');
    console.log('✓✓✓ PAYMENT & WALLET MIGRATION COMPLETE! ✓✓✓');
    console.log('========================================\n');
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

applyMigration();
