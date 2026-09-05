const mysql = require('mysql2/promise');

async function test() {
  console.log('Testing database connection with trading_app user...\n');
  
  try {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'trading_app',
      password: 'TradingSecure2026!',
      database: 'tradeing_db',
    });

    console.log('✓ Connection successful');

    const [result] = await connection.query('SELECT 1 as test');
    console.log('✓ SELECT 1 successful');

    const [tables] = await connection.query('SHOW TABLES');
    console.log(`✓ Found ${tables.length} tables`);

    if (tables.length > 0) {
      const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
      console.log(`✓ Users table: ${users[0].count} records`);
    }

    await connection.end();
    
    console.log('\n✓✓✓ DATABASE CONNECTION WORKING ✓✓✓\n');
    console.log('Ready to start backend: npm run start:dev\n');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Connection failed');
    console.error('Error:', error.code, error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n❌ User trading_app not created yet or password wrong');
      console.error('\nExecute the SQL in: EXECUTE_THIS_SQL.txt');
      console.error('Then run this test again.\n');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('\n❌ Database tradeing_db does not exist');
      console.error('\nExecute the SQL in: EXECUTE_THIS_SQL.txt\n');
    }
    process.exit(1);
  }
}

test();
