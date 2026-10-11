/**
 * Reset Twelve Data Provider State
 * 
 * This script resets the provider from ERROR state to AVAILABLE
 * by calling the admin reset endpoint.
 */

const http = require('http');

async function login() {
  console.log('🔐 Logging in with admin credentials...');
  
  return new Promise((resolve, reject) => {
    const loginData = JSON.stringify({
      email: 'admin@tradeing.local',
      password: 'Admin@12345'
    });

    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': loginData.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 201) {
          const response = JSON.parse(data);
          console.log('✅ Login successful');
          resolve(response.accessToken);
        } else {
          console.error(`❌ Login failed with status ${res.statusCode}`);
          console.error('Response:', data);
          reject(new Error(`Login failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error.message);
      reject(error);
    });

    req.write(loginData);
    req.end();
  });
}

async function resetProvider(accessToken) {
  console.log('🔄 Resetting Twelve Data provider...');
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/market/twelvedata/reset',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          const response = JSON.parse(data);
          console.log('✅ Provider reset successful');
          console.log('Response:', JSON.stringify(response, null, 2));
          resolve(response);
        } else {
          console.error(`❌ Reset failed with status ${res.statusCode}`);
          console.error('Response:', data);
          reject(new Error(`Reset failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error.message);
      reject(error);
    });

    req.end();
  });
}

async function getProviderStatus(accessToken) {
  console.log('📊 Checking provider status...');
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/market/twelvedata/status',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const response = JSON.parse(data);
          console.log('✅ Provider status retrieved');
          console.log('\n📊 Current Status:');
          console.log(JSON.stringify(response, null, 2));
          resolve(response);
        } else {
          console.error(`❌ Status check failed with status ${res.statusCode}`);
          console.error('Response:', data);
          reject(new Error(`Status check failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error.message);
      reject(error);
    });

    req.end();
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   Twelve Data Provider Reset Script                ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Login
    const accessToken = await login();
    console.log('');

    // Step 2: Get current status
    await getProviderStatus(accessToken);
    console.log('');

    // Step 3: Reset provider
    await resetProvider(accessToken);
    console.log('');

    // Step 4: Verify new status
    await getProviderStatus(accessToken);
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   ✅ Provider Reset Complete                       ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
