/**
 * Test All Timeframes Required by Frontend
 * 
 * Tests: 1m, 5m, 10m, 15m, 30m, 1h, 4h, 1d
 */

const http = require('http');

async function login() {
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
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 201) {
          resolve(JSON.parse(data).accessToken);
        } else {
          reject(new Error(`Login failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(loginData);
    req.end();
  });
}

async function testCandles(accessToken, interval, label) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: `/api/market/twelvedata/candles?symbol=EURUSD&interval=${interval}&outputsize=5&mode=LIVE`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const response = JSON.parse(data);
        if (response.success && response.count > 0) {
          console.log(`   ✅ ${label.padEnd(10)} - ${response.count} candles`);
          resolve(true);
        } else {
          console.log(`   ❌ ${label.padEnd(10)} - ${response.error || 'No data'}`);
          resolve(false);
        }
      });
    });

    req.on('error', () => {
      console.log(`   ❌ ${label.padEnd(10)} - Connection error`);
      resolve(false);
    });

    req.end();
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   Testing All Timeframes (Frontend Requirements)  ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    console.log('🔐 Logging in...\n');
    const accessToken = await login();

    console.log('📈 Testing Timeframes:\n');
    
    const timeframes = [
      ['1min', '1 minute'],
      ['5min', '5 minutes'],
      ['10min', '10 minutes'],
      ['15min', '15 minutes'],
      ['30min', '30 minutes'],
      ['1h', '1 hour'],
      ['4h', '4 hours'],
      ['1day', '1 day'],
    ];

    let passed = 0;
    let failed = 0;

    for (const [interval, label] of timeframes) {
      const success = await testCandles(accessToken, interval, label);
      if (success) passed++;
      else failed++;
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log(`║   Results: ${passed}/${timeframes.length} passed                                 ║`);
    console.log('╚════════════════════════════════════════════════════╝\n');

    if (failed === 0) {
      console.log('🎉 All timeframes working correctly!\n');
      process.exit(0);
    } else {
      console.log(`⚠️  ${failed} timeframe(s) failed.\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
