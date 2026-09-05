/**
 * Test new trading_app user connection
 * Run this AFTER creating the user in MySQL
 */

const mysql = require('mysql2/promise');

async function testNewUser() {
  console.log('Testing trading_app user connection...\n');

  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'trading_app',
      password: 'TradingApp2026!Secure',
      database: 'tradeing_db',
      connectTimeout: 5000,
    });

    console.log('✓ Connection successful!');

    const [result] = await connection.query('SELECT 1 as test');
    console.log('✓ Query successful:', result);

    const [dbCheck] = await connection.query('SELECT DATABASE() as current_db');
    console.log('✓ Current database:', dbCheck[0].current_db);

    // Check if tables exist
    const [tables] = await connection.query('SHOW TABLES');
    console.log('✓ Tables found:', tables.length);
    if (tables.length > 0) {
      console.log('  Tables:', tables.map(t => Object.values(t)[0]).join(', '));
    }

    // Check if users exist (verify data preservation)
    const [userCount] = await connection.query('SELECT COUNT(*) as count FROM users');
    console.log('✓ Users in database:', userCount[0].count);

    await connection.end();
    
    console.log('\n========================================');
    console.log('✓✓✓ NEW USER WORKS! ✓✓✓');
    console.log('========================================');
    console.log('The trading_app user can connect successfully.');
    console.log('Ready to update .env and start the application.');
    console.log('========================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Connection failed!');
    console.error('Error:', error.code, '-', error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n❌ User not created yet or password is wrong.');
      console.error('Please run the CREATE_DB_USER.sql script first.');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('\n❌ Database "tradeing_db" does not exist.');
      console.error('The CREATE_DB_USER.sql script will create it.');
    }
    
    if (connection) {
      try {
        await connection.end();
      } catch (e) {
        // ignore
      }
    }
    process.exit(1);
  }
}

testNewUser();
