/**
 * Test MySQL connection using mysql2 package
 * mysql2 has better support for MySQL 8+ authentication
 */

const mysql = require('mysql2/promise');

async function testConnection() {
  const passwords = ['root', '', 'password', 'mysql', 'admin', '123456'];
  
  console.log('Testing MySQL connection with mysql2 package...');
  console.log('Host: localhost');
  console.log('Port: 3306');
  console.log('User: root\n');

  for (const password of passwords) {
    console.log(`Trying password: ${password === '' ? '(empty)' : '"' + password + '"'}`);
    
    let connection;
    try {
      connection = await mysql.createConnection({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: password,
        connectTimeout: 5000,
      });

      console.log('✓ Connection successful!');

      const [rows] = await connection.query('SELECT 1 as test');
      console.log('✓ Query successful:', rows);

      const [databases] = await connection.query('SHOW DATABASES');
      const dbNames = databases.map(d => d.Database);
      console.log('✓ Available databases:', dbNames);

      const hasTradeingDb = dbNames.includes('tradeing_db');
      console.log(`✓ Database "tradeing_db" ${hasTradeingDb ? 'EXISTS' : 'DOES NOT EXIST'}`);

      if (!hasTradeingDb) {
        console.log('\n⚠ Creating database "tradeing_db"...');
        await connection.query('CREATE DATABASE tradeing_db');
        console.log('✓ Database created successfully!');
      }

      await connection.end();
      
      console.log('\n========================================');
      console.log('✓✓✓ SUCCESS! ✓✓✓');
      console.log('========================================');
      console.log(`Correct password: ${password === '' ? '(empty string)' : '"' + password + '"'}`);
      console.log('\nUpdate your .env file with:');
      console.log(`DB_PASSWORD="${password}"`);
      console.log('========================================\n');
      process.exit(0);
    } catch (error) {
      console.error('✗ Failed:', error.code || error.message);
      
      if (connection) {
        try {
          await connection.end();
        } catch (e) {
          // ignore
        }
      }
    }
  }
  
  console.error('\n========================================');
  console.error('✗✗✗ ALL PASSWORDS FAILED ✗✗✗');
  console.error('========================================');
  console.error('\nPlease check:');
  console.error('1. What is the actual MySQL root password?');
  console.error('2. You can reset it or create a new user');
  console.error('3. Check MySQL error log for authentication issues');
  console.error('========================================\n');
  process.exit(1);
}

testConnection();
