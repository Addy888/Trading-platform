/**
 * Complete End-to-End Verification
 * Tests database connection, admin login, and all critical endpoints
 */

const mysql = require('mysql2/promise');
const http = require('http');

const API_BASE = 'http://localhost:3001/api';
let authToken = '';

async function main() {
  console.log('\n========================================');
  console.log('END-TO-END VERIFICATION');
  console.log('========================================\n');

  try {
    // Test 1: Database Connection
    console.log('TEST 1: Database Connection');
    await testDatabaseConnection();
    console.log('✓ PASSED\n');

    // Test 2: Health Endpoint
    console.log('TEST 2: Health Endpoint');
    await testHealthEndpoint();
    console.log('✓ PASSED\n');

    // Test 3: Admin Login
    console.log('TEST 3: Admin Login');
    await testAdminLogin();
    console.log('✓ PASSED\n');

    // Test 4: Get Current User
    console.log('TEST 4: Get Current User');
    await testGetMe();
    console.log('✓ PASSED\n');

    // Test 5: Admin Dashboard
    console.log('TEST 5: Admin Dashboard');
    await testAdminDashboard();
    console.log('✓ PASSED\n');

    console.log('========================================');
    console.log('✓✓✓ ALL TESTS PASSED ✓✓✓');
    console.log('========================================');
    console.log('\nSetup is complete and working correctly!');
    console.log('\nYou can now:');
    console.log('1. Open frontend: http://localhost:3000');
    console.log('2. Login as admin: admin@tradeing.local / Admin@12345');
    console.log('3. Access admin panel at: /admin');
    console.log('========================================\n');
    process.exit(0);

  } catch (error) {
    console.error('\n✗ TEST FAILED:', error.message);
    console.error('\nPlease check the error above and verify:');
    console.error('1. Database user created: setup-database.cmd');
    console.error('2. Prisma generated: npx prisma generate');
    console.error('3. Database seeded: npm run prisma:seed');
    console.error('4. Backend running: npm run start:dev');
    process.exit(1);
  }
}

async function testDatabaseConnection() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'trading_app',
    password: 'TradingSecure2026!',
    database: 'tradeing_db',
  });

  await connection.query('SELECT 1');

  const [tables] = await connection.query('SHOW TABLES');
  console.log(`  Tables: ${tables.length}`);

  const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
  console.log(`  Users: ${users[0].count}`);

  await connection.end();
}

async function testHealthEndpoint() {
  const data = await makeRequest('GET', '/health');
  console.log(`  Status: ${data.status}`);
  console.log(`  Database: ${data.database}`);
  
  if (data.database !== 'healthy') {
    throw new Error('Database is not healthy');
  }
}

async function testAdminLogin() {
  const data = await makeRequest('POST', '/auth/login', {
    email: 'admin@tradeing.local',
    password: 'Admin@12345',
  });

  if (!data.accessToken) {
    throw new Error('No access token received');
  }

  if (data.user.role !== 'ADMIN') {
    throw new Error('User is not ADMIN');
  }

  authToken = data.accessToken;
  console.log(`  Role: ${data.user.role}`);
  console.log(`  Email: ${data.user.email}`);
}

async function testGetMe() {
  const data = await makeRequest('GET', '/auth/me', null, authToken);

  if (data.role !== 'ADMIN') {
    throw new Error('User is not ADMIN');
  }

  console.log(`  Role: ${data.role}`);
  console.log(`  Email: ${data.email}`);
}

async function testAdminDashboard() {
  const data = await makeRequest('GET', '/admin/dashboard', null, authToken);

  console.log(`  Total Users: ${data.users.total}`);
  console.log(`  Challenge Plans: ${data.challengePlans.total}`);
}

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: `/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.message || data}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Request failed: ${e.message}. Is the backend running?`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

main();
