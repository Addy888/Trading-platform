/**
 * Complete End-to-End Test
 * 
 * Tests entire flow:
 * 1. Authentication
 * 2. Provider Status
 * 3. Quotes (symbol normalization)
 * 4. Candles (all timeframes)
 * 5. Error handling
 */

const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:3001/api';
const CREDENTIALS = {
  email: 'admin@tradeing.local',
  password: 'Admin@12345'
};

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, message = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`   ${status} - ${name}${message ? ': ' + message : ''}`);
  results.tests.push({ name, passed, message });
  if (passed) results.passed++;
  else results.failed++;
}

async function httpRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {}
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = jsonData.length;
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function testAuthentication() {
  console.log('\n📋 AUTHENTICATION TESTS');
  console.log('═'.repeat(50));

  try {
    // Test 1: Login
    const loginRes = await httpRequest('POST', '/api/auth/login', CREDENTIALS);
    const loginSuccess = loginRes.status === 201 && loginRes.data.accessToken;
    logTest('Login', loginSuccess, loginSuccess ? 'Token received' : `Status ${loginRes.status}`);
    
    if (!loginSuccess) {
      return null;
    }

    const token = loginRes.data.accessToken;

    // Test 2: Get User Profile
    const meRes = await httpRequest('GET', '/api/auth/me', null, token);
    const meSuccess = meRes.status === 200 && meRes.data.email === CREDENTIALS.email;
    logTest('Get Profile', meSuccess);

    return token;
  } catch (error) {
    logTest('Authentication', false, error.message);
    return null;
  }
}

async function testProviderStatus(token) {
  console.log('\n📊 PROVIDER STATUS TESTS');
  console.log('═'.repeat(50));

  try {
    const res = await httpRequest('GET', '/api/market/twelvedata/status', null, token);
    const success = res.status === 200;
    logTest('Provider Status Endpoint', success);

    if (success) {
      const provider = res.data.providers.TWELVE_DATA;
      logTest('Provider Available', provider.status === 'AVAILABLE', provider.status);
      logTest('No Errors', provider.errorCount === 0, `Errors: ${provider.errorCount}`);
      return provider.status === 'AVAILABLE';
    }

    return false;
  } catch (error) {
    logTest('Provider Status', false, error.message);
    return false;
  }
}

async function testQuotes(token) {
  console.log('\n💱 QUOTE TESTS (Symbol Normalization)');
  console.log('═'.repeat(50));

  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY'];

  for (const symbol of symbols) {
    try {
      const res = await httpRequest('GET', `/api/market/twelvedata/quote/${symbol}?mode=LIVE`, null, token);
      const success = res.status === 200 && res.data.success;
      const price = res.data.quote?.close || res.data.quote?.price;
      logTest(`Quote ${symbol}`, success, success ? `Price: ${price}` : res.data.error);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      logTest(`Quote ${symbol}`, false, error.message);
    }
  }
}

async function testCandles(token) {
  console.log('\n📈 CANDLE TESTS (All Timeframes)');
  console.log('═'.repeat(50));

  const timeframes = [
    { interval: '1min', label: '1 minute' },
    { interval: '5min', label: '5 minutes' },
    { interval: '10min', label: '10 minutes (maps to 15min)' },
    { interval: '15min', label: '15 minutes' },
    { interval: '30min', label: '30 minutes' },
    { interval: '1h', label: '1 hour' },
    { interval: '4h', label: '4 hours' },
    { interval: '1day', label: '1 day' },
  ];

  for (const { interval, label } of timeframes) {
    try {
      const res = await httpRequest(
        'GET',
        `/api/market/twelvedata/candles?symbol=EURUSD&interval=${interval}&outputsize=5&mode=LIVE`,
        null,
        token
      );
      const success = res.status === 200 && res.data.success && res.data.count > 0;
      logTest(`Candles ${label}`, success, success ? `${res.data.count} candles` : res.data.error);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      logTest(`Candles ${interval}`, false, error.message);
    }
  }
}

async function testErrorHandling(token) {
  console.log('\n⚠️  ERROR HANDLING TESTS');
  console.log('═'.repeat(50));

  try {
    // Test 1: Invalid symbol
    const res1 = await httpRequest('GET', '/api/market/twelvedata/quote/INVALID?mode=LIVE', null, token);
    const test1 = res1.status === 200 && !res1.data.success;
    logTest('Invalid Symbol Handling', test1);

    // Test 2: Missing authentication
    const res2 = await httpRequest('GET', '/api/market/twelvedata/status', null, null);
    const test2 = res2.status === 401;
    logTest('Missing Auth Rejection', test2);

    // Test 3: Provider status after errors
    const res3 = await httpRequest('GET', '/api/market/twelvedata/status', null, token);
    const provider = res3.data.providers.TWELVE_DATA;
    const test3 = provider.status === 'AVAILABLE';
    logTest('Provider Recovery', test3, provider.status);
  } catch (error) {
    logTest('Error Handling', false, error.message);
  }
}

function printSummary() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║                  TEST SUMMARY                      ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║   Total Tests:  ${(results.passed + results.failed).toString().padEnd(37)}║`);
  console.log(`║   Passed:       ${results.passed.toString().padEnd(37)}║`);
  console.log(`║   Failed:       ${results.failed.toString().padEnd(37)}║`);
  console.log(`║   Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%${' '.repeat(33)}║`);
  console.log('╚════════════════════════════════════════════════════╝\n');

  if (results.failed > 0) {
    console.log('❌ Failed Tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`   - ${t.name}: ${t.message}`);
    });
    console.log('');
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║        Complete End-to-End Test Suite             ║');
  console.log('╚════════════════════════════════════════════════════╝');

  try {
    // Run all test suites
    const token = await testAuthentication();
    
    if (!token) {
      console.log('\n❌ Authentication failed. Cannot proceed with other tests.\n');
      process.exit(1);
    }

    const providerOk = await testProviderStatus(token);
    
    if (!providerOk) {
      console.log('\n⚠️  Provider not available. Market data tests may fail.\n');
    }

    await testQuotes(token);
    await testCandles(token);
    await testErrorHandling(token);

    // Print summary
    printSummary();

    // Exit with appropriate code
    if (results.failed === 0) {
      console.log('🎉 All tests passed! System is fully functional.\n');
      process.exit(0);
    } else {
      console.log(`⚠️  ${results.failed} test(s) failed. Review the results above.\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
