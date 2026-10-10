// Script to apply broker_connections migration manually
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

  console.log('Connected to database');

  try {
    // Check if table already exists
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'broker_connections'"
    );

    if (tables.length > 0) {
      console.log('✓ broker_connections table already exists');
      process.exit(0);
    }

    console.log('Creating broker_connections table...');

    await connection.execute(`
      CREATE TABLE broker_connections (
        id VARCHAR(191) NOT NULL,
        userId VARCHAR(191) NOT NULL,
        provider VARCHAR(191) NOT NULL,
        status VARCHAR(191) NOT NULL DEFAULT 'DISCONNECTED',
        clientId VARCHAR(191) NULL,
        encryptedToken TEXT NULL,
        encryptedRefresh TEXT NULL,
        tokenExpiresAt DATETIME(3) NULL,
        lastConnectedAt DATETIME(3) NULL,
        lastErrorMessage TEXT NULL,
        lastErrorCode VARCHAR(191) NULL,
        metadata JSON NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL,
        INDEX broker_connections_userId_status_idx(userId, status),
        UNIQUE KEY broker_connections_userId_provider_key(userId, provider),
        PRIMARY KEY (id),
        CONSTRAINT broker_connections_userId_fkey 
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    console.log('✓ broker_connections table created successfully');

  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

applyMigration();
