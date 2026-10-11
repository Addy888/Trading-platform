/**
 * Authentication Debug Script
 * 
 * Tests the authentication system step by step to identify the exact failure point
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 3306,
  user: 'trading_app',
  password: 'TradingSecure2026!',
  database: 'tradeing_db'
};

const API_URL = 'http://localhost:3001/api';
const TEST_EMAIL = 'admin@tradeing.local';
const TEST_PASSWORD = 'Admin@12345';

async function test1_DatabaseConnection() {
  console.log('\n=== Test 1: Database Connection ===');
  try {
    const conn = await mysql.createConnection(DB_CONFIG);
    console.log('✓ Database connection successful');
    await conn.end();
    return true;
  } catch (error) {
    console.log('✗ Database connection failed:', error.message);
    return false;
  }
}

async function test2_UserExists() {
  console.log('\n=== Test 2: User Exists ===');
  try {
    const conn = await mysql.createConnection(DB_CONFIG);
    const [users] = await conn.execute(
      'SELECT id, email, role, isActive FROM users WHERE email = ?',
      [TEST_EMAIL]
    );
    
    if (users.length === 0) {
      console.log('✗ User not found in database');
      await conn.end();
      return false;
    }
    
    console.log('✓ User found:', {
      id: users[0].id,
      email: users[0].email,
      role: users[0].role,
      isActive: users[0].isActive
    });
    
    await conn.end();
    return true;
  } catch (error) {
    console.log('✗ Query failed:', error.message);
    return false;
  }
}

async function test3_PasswordHash() {
  console.log('\n=== Test 3: Password Hash Verification ===');
  try {
    const conn = await mysql.createConnection(DB_CONFIG);
    const [users] = await conn.execute(
      'SELECT passwordHash FROM users WHERE email = ?',
      [TEST_EMAIL]
    );
    
    if (users.length === 0) {
      console.log('✗ User not found');
      await conn.end();
      return false;
    }
    
    const storedHash = users[0].passwordHash;
    console.log('Stored hash (first 20 chars):', storedHash.substring(0, 20) + '...');
    
    const match = await bcrypt.compare(TEST_PASSWORD, storedHash);
    
    if (match) {
      console.log('✓ Password verification successful');
    } else {
      console.log('✗ Password verification failed');
    }
    
    await conn.end();
    return match;
  } catch (error) {
    console.log('✗ Password check failed:', error.message);
    return false;
  }
}

async function test4_HealthEndpoint() {
  console.log('\n=== Test 4: Health Endpoint (No Auth) ===');
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✓ Health endpoint works:', data);
      return true;
    } else {
      console.log('✗ Health endpoint failed:', response.status, data);
      return false;
    }
  } catch (error) {
    console.log('✗ Health endpoint error:', error.message);
    return false;
  }
}

async function test5_LoginEndpoint() {
  console.log('\n=== Test 5: Login Endpoint ===');
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });
    
    const responseText = await response.text();
    
    console.log('Status Code:', response.status);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    console.log('Response Body:', responseText);
    
    if (response.ok) {
      const data = JSON.parse(responseText);
      if (data.accessToken) {
        console.log('✓ Login successful!');
        console.log('  Token (first 30 chars):', data.accessToken.substring(0, 30) + '...');
        return data.accessToken;
      } else {
        console.log('✗ Login succeeded but no token returned');
        return null;
      }
    } else {
      console.log('✗ Login failed');
      return null;
    }
  } catch (error) {
    console.log('✗ Login error:', error.message);
    return null;
  }
}

async function test6_ProviderStatus(token) {
  console.log('\n=== Test 6: Provider Status Endpoint (With Auth) ===');
  if (!token) {
    console.log('⊘ Skipped - no token available');
    return false;
  }
  
  try {
    const response = await fetch(`${API_URL}/market/twelvedata/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });
    
    const responseText = await response.text();
    
    console.log('Status Code:', response.status);
    console.log('Response Body:', responseText);
    
    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('✓ Provider status endpoint works!');
      console.log('  Primary Provider:', data.primaryProvider);
      return true;
    } else {
      console.log('✗ Provider status endpoint failed');
      return false;
    }
  } catch (error) {
    console.log('✗ Provider status error:', error.message);
    return false;
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   Authentication Debug Script                          ║');
  console.log('║   Testing each component systematically                ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  
  const results = {
    database: false,
    userExists: false,
    passwordHash: false,
    healthEndpoint: false,
    loginEndpoint: false,
    providerStatus: false,
  };
  
  // Run tests in sequence
  results.database = await test1_DatabaseConnection();
  results.userExists = await test2_UserExists();
  results.passwordHash = await test3_PasswordHash();
  results.healthEndpoint = await test4_HealthEndpoint();
  
  const token = await test5_LoginEndpoint();
  results.loginEndpoint = !!token;
  
  results.providerStatus = await test6_ProviderStatus(token);
  
  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   Test Results Summary                                 ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║   Database Connection:      ${results.database ? '✓ PASS' : '✗ FAIL'}                       ║`);
  console.log(`║   User Exists:              ${results.userExists ? '✓ PASS' : '✗ FAIL'}                       ║`);
  console.log(`║   Password Hash:            ${results.passwordHash ? '✓ PASS' : '✗ FAIL'}                       ║`);
  console.log(`║   Health Endpoint:          ${results.healthEndpoint ? '✓ PASS' : '✗ FAIL'}                       ║`);
  console.log(`║   Login Endpoint:           ${results.loginEndpoint ? '✓ PASS' : '✗ FAIL'}                       ║`);
  console.log(`║   Provider Status:          ${results.providerStatus ? '✓ PASS' : '⊘ SKIP'}                       ║`);
  console.log('╚═══════════════════════════════════════════════════════╝');
  
  // Diagnosis
  console.log('\n📋 DIAGNOSIS:');
  if (!results.database) {
    console.log('❌ Database connection failed - check DB credentials');
  } else if (!results.userExists) {
    console.log('❌ User does not exist - run database seed');
  } else if (!results.passwordHash) {
    console.log('❌ Password hash mismatch - user may have different password');
    console.log('   Run: npm run seed to reset password');
  } else if (!results.healthEndpoint) {
    console.log('❌ API server not responding - check if server is running on port 3001');
  } else if (!results.loginEndpoint) {
    console.log('❌ Login endpoint failing despite correct credentials');
    console.log('   Possible causes:');
    console.log('   1. JWT_SECRET not configured');
    console.log('   2. Auth service error');
    console.log('   3. CORS issue');
    console.log('   4. Different server instance running');
  } else if (!results.providerStatus) {
    console.log('❌ Provider status endpoint failing despite valid token');
    console.log('   Check JWT strategy configuration');
  } else {
    console.log('✅ All tests passed! Authentication is working correctly.');
  }
  
  process.exit(results.loginEndpoint ? 0 : 1);
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
