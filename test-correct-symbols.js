/**
 * Test Market Data with Correct Symbol Format
 * 
 * Tests EUR/USD with the slash format that Twelve Data expects
 */

const http = require('http');

async function login() {
  console.log('🔐 Logging in...');
  
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
          const response = JSON.parse(data);
          console.log('✅ Login successful\n');
          resolve(response.accessToken);
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

async function httpGet(path, accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Request failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   Testing Market Data with Correct Symbol Format  ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    const accessToken = await login();

    // Test 1: Quote with EUR/USD format
    console.log('📊 Test 1: Getting EUR/USD quote...');
    try {
      const quoteResponse = await httpGet('/api/market/twelvedata/quote/EUR%2FUSD?mode=LIVE', accessToken);
      if (quoteResponse.success) {
        console.log('✅ Quote successful');
        console.log(`   Price: ${quoteResponse.quote.close || quoteResponse.quote.price}`);
        console.log(`   Provider: ${quoteResponse.quote.provider}`);
      } else {
        console.log('❌ Quote failed:', quoteResponse.error);
      }
    } catch (error) {
      console.log('❌ Quote error:', error.message);
    }

    console.log('');

    // Test 2: Candles with EUR/USD format
    console.log('📈 Test 2: Getting EUR/USD candles (1h)...');
    try {
      const candlesResponse = await httpGet(
        '/api/market/twelvedata/candles?symbol=EUR%2FUSD&interval=1h&outputsize=5&mode=LIVE',
        accessToken
      );
      if (candlesResponse.success) {
        console.log('✅ Candles successful');
        console.log(`   Count: ${candlesResponse.count}`);
        console.log(`   Provider: ${candlesResponse.provider}`);
        if (candlesResponse.candles && candlesResponse.candles.length > 0) {
          const latest = candlesResponse.candles[candlesResponse.candles.length - 1];
          console.log(`   Latest: O=${latest.open} H=${latest.high} L=${latest.low} C=${latest.close}`);
        }
      } else {
        console.log('❌ Candles failed:', candlesResponse.error);
      }
    } catch (error) {
      console.log('❌ Candles error:', error.message);
    }

    console.log('');

    // Test 3: Check provider status after tests
    console.log('📊 Test 3: Checking provider status...');
    try {
      const statusResponse = await httpGet('/api/market/twelvedata/status', accessToken);
      const twelveDataStatus = statusResponse.providers.TWELVE_DATA;
      console.log('✅ Status retrieved');
      console.log(`   Status: ${twelveDataStatus.status}`);
      console.log(`   Requests: ${twelveDataStatus.requestCount}`);
      console.log(`   Cache Hits: ${twelveDataStatus.cacheHits}`);
      console.log(`   Errors: ${twelveDataStatus.errorCount}`);
    } catch (error) {
      console.log('❌ Status error:', error.message);
    }

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   Tests Complete                                   ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
