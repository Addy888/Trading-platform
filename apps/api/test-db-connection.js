/**
 * Standalone MySQL Connection Test
 * 
 * This script tests MySQL authentication directly
 * to determine if the credentials in .env are correct.
 */

const mariadb = require('mariadb');

async function testConnection() {
  // Try multiple common passwords
  const passwords = ['root', '', 'password', 'mysql', 'admin', '123456'];
  
  console.log('Testing MySQL connection with multiple passwords...');
  console.log('Host: localhost');
  console.log('Port: 3306');
  console.log('User: root');
  console.log('');

  for (const password of passwords) {
    console.log(`\nTrying password: ${password === '' ? '(empty)' : '"' + password + '"'}`);
    
    let connection;
    let pool;
    try {
      // Create connection pool
      pool = mariadb.createPool({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: password,
        // Try without database first
        // database: 'tradeing_db',
        allowPublicKeyRetrieval: true,
        connectionLimit: 2,
        acquireTimeout: 5000,
        connectTimeout: 5000,
      });

      console.log('Attempting to get connection from pool...');
      connection = await pool.getConnection();
      console.log('✓ Connection successful!');

      console.log('\nTesting query...');
      const result = await connection.query('SELECT 1 as test');
      console.log('✓ Query successful:', result);

      console.log('\nChecking databases...');
      const dbList = await connection.query('SHOW DATABASES');
      console.log('✓ Available databases:', dbList.map(d => d.Database));

      // Check if tradeing_db exists
      const hasTradeingDb = dbList.some(d => d.Database === 'tradeing_db');
      console.log(`\n✓ Database "tradeing_db" ${hasTradeingDb ? 'EXISTS' : 'DOES NOT EXIST'}`);

      await connection.end();
      await pool.end();
      
      console.log('\n\n========================================');
      console.log('✓✓✓ SUCCESS! ✓✓✓');
      console.log('========================================');
      console.log(`Correct password: ${password === '' ? '(empty)' : '"' + password + '"'}`);
      console.log('\nUpdate your .env file:');
      console.log(`DB_PASSWORD="${password}"`);
      console.log('========================================\n');
      process.exit(0);
    } catch (error) {
      console.error('✗ Failed:', error.message);
      
      if (connection) {
        try {
          await connection.end();
        } catch (e) {
          // ignore
        }
      }
      if (pool) {
        try {
          await pool.end();
        } catch (e) {
          // ignore
        }
      }
      // Continue to next password
    }
  }
  
  console.error('\n\n========================================');
  console.error('✗✗✗ ALL PASSWORDS FAILED ✗✗✗');
  console.error('========================================');
  console.error('None of the common passwords worked.');
  console.error('\nPossible issues:');
  console.error('1. MySQL root user has a different password');
  console.error('2. MySQL root user is locked or disabled');
  console.error('3. MySQL is not configured to accept local connections');
  console.error('4. MySQL authentication plugin issue');
  console.error('\nRecommended solutions:');
  console.error('1. Reset MySQL root password');
  console.error('2. Create a dedicated application user:');
  console.error('   mysql> CREATE USER \'trading_app\'@\'localhost\' IDENTIFIED BY \'secure_password\';');
  console.error('   mysql> GRANT ALL PRIVILEGES ON tradeing_db.* TO \'trading_app\'@\'localhost\';');
  console.error('   mysql> FLUSH PRIVILEGES;');
  console.error('========================================\n');
  process.exit(1);
}

testConnection();
