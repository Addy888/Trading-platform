/**
 * Test Market Data End-to-End
 * 
 * Tests the complete market data flow:
 * 1. Login
 * 2. Get provider status
 * 3. Get EUR/USD quote
 * 4. Get EUR/USD candles (multiple timeframes)
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
          console.log('✅ Login successful');
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

async function testQuote(accessToken) {
  console.log('\n📊 Testing EUR/USD Quote...');
  
  try {
    const response = await httpGet('/api/market/twelvedata/quote/EURUSD?mode=LIVE', accessToken);
    
    if (response.success) {
      console.log('✅ Quote request successful');
      console.log(`   Symbol: ${response.symbol}`);
      console.log(`   Mode: ${response.mode}`);
      console.log(`   Provider: ${response.quote.provider || 'N/A'}`);
      console.log(`   Price: ${response.quote.price || response.quote.close || 'N/A'}`);
      console.log(`   Cached: ${response.quote.cached ? 'Yes' : 'No'}`);
      return true;
    } else {
      console.error('❌ Quote request failed:', response.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Quote request error:', error.message);
    return false;
  }
}

async function testCandles(accessToken, interval) {
  console.log(`\n📈 Testing EUR/USD Candles (${interval})...`);
  
  try {
    const response = await httpGet(
      `/api/market/twelvedata/candles?symbol=EUR/USD&interval=${interval}&outputsize=10&mode=LIVE`,
      accessToken
    );
    
    if (response.success) {
      console.log('✅ Candles request successful');
      console.log(`   Symbol: ${response.symbol}`);
      console.log(`   Interval: ${response.interval}`);
      console.log(`   Mode: ${response.mode}`);
      console.log(`   Provider: ${response.provider}`);
      console.log(`   Candles returned: ${response.count}`);
      
      if (response.candles && response.candles.length > 0) {
        const latest = response.candles[response.candles.length - 1];
        console.log(`   Latest candle: O=${latest.open} H=${latest.high} L=${latest.low} C=${latest.close}`);
      }
      return true;
    } else {
      console.error('❌ Candles request failed:', response.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Candles request error:', error.message);
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   Market Data End-to-End Test                      ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Login
    const accessToken = await login();

    // Step 2: Test Quote
    const quoteOk = await testQuote(accessToken);

    // Step 3: Test All Timeframes
    const timeframes = ['1min', '5min', '15min', '30min', '1h', '4h'];
    let allCandlesOk = true;
    
    for (const interval of timeframes) {
      const ok = await testCandles(accessToken, interval);
      if (!ok) allCandlesOk = false;
      
      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Summary
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   Test Results Summary                             ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║   Quote Test:           ${quoteOk ? '✅ PASS' : '❌ FAIL'}                       ║`);
    console.log(`║   Candles Test:         ${allCandlesOk ? '✅ PASS' : '❌ FAIL'}                       ║`);
    console.log('╚════════════════════════════════════════════════════╝\n');

    if (quoteOk && allCandlesOk) {
      console.log('🎉 All tests passed! Market data is working correctly.\n');
      process.exit(0);
    } else {
      console.log('⚠️  Some tests failed. Check the output above for details.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
