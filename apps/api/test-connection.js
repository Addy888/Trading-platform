const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('\nTesting database connection...\n');
  
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'trading_app',
      password: 'TradingSecure2026!',
      database: 'tradeing_db',
    });

    await connection.query('SELECT 1');
    console.log('✓ Database connection successful');

    const [tables] = await connection.query('SHOW TABLES');
    console.log(`✓ Found ${tables.length} tables`);

    await connection.end();
    
    console.log('\n✓✓✓ All checks passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('✗ Connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
