const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'trading_app',
    password: 'TradingSecure2026!',
    database: 'tradeing_db'
  });
  
  const [columns] = await conn.execute('SHOW COLUMNS FROM users');
  console.log('User table columns:');
  columns.forEach(c => {
    console.log(`  ${c.Field.padEnd(30)} ${c.Type}`);
  });
  
  await conn.end();
})();
