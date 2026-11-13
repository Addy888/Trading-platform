/**
 * COMPLETE END-TO-END BROWSER VERIFICATION
 * 
 * This script:
 * 1. Creates/logs in as test user
 * 2. Tests ALL historical candle endpoints
 * 3. Verifies data quality
 * 4. Provides evidence for manual browser test
 */

const axios = require('axios');
const fs = require('fs');

const API_URL = 'http://localhost:3001/api';
const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY'];
const TIMEFRAMES = ['1min', '5min', '15min', '30min', '1h', '4h', '1day'];

const results = {
  auth: null,
  health: null,
  marketStatus: null,
  candleTests: {},
  summary: {}
};

// Test credentials
const TEST_USER = {
  email: 'test_browser_verification@trading.local',
  password: 'TestBrowser123!',
  firstName: 'Browser',
  lastName: 'Test'
};

async function setup() {
  console.log('='.repeat(80));
  console.log('COMPLETE END-TO-END HISTORICAL CANDLE VERIFICATION');
  console.log('='.repeat(80));
  console.log(`Start Time: ${new Date().toISOString()}\n`);
}

async function testHealth() {
  console.log('\n=== TEST 1: BACKEND HEALTH ===\n');
  
  try {
    const response = await axios.get(`${API_URL}/health`);
    results.health = {
      status: 'PASS',
      data: response.data
    };
    
    console.log('✅ Backend Health: OK');
    console.log('   Database:', response.data.database);
    console.log('   Market Data Provider:', response.data.marketData.primaryProvider);
    console.log('   Provider Status:', response.data.marketData.providers.TWELVE_DATA.status);
    console.log('   Last Candle Success:', response.data.marketData.candleLastSuccessAt);
    
    return true;
  } catch (error) {
    results.health = {
      status: 'FAIL',
      error: error.message
    };
    console.error('❌ Backend Health: FAILED');
    console.error('   Error:', error.message);
    return false;
  }
}

async function getAuthToken() {
  console.log('\n=== TEST 2: AUTHENTICATION ===\n');
  
  try {
    // Try to register (will fail if exists, that's OK)
    try {
      await axios.post(`${API_URL}/auth/register`, TEST_USER);
      console.log('✅ Test user registered');
    } catch (regError) {
      if (regError.response?.status === 409) {
        console.log('✅ Test user already exists');
      } else {
        throw regError;
      }
    }
    
    // Login
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: TEST_USER.email,
      password: TEST_USER.password
    });
    
    const token = loginResponse.data.accessToken;
    const userId = loginResponse.data.user.id;
    
    results.auth = {
      status: 'PASS',
      userId,
      tokenLength: token.length
    };
    
    console.log('✅ Authentication successful');
    console.log('   User ID:', userId);
    console.log('   Token length:', token.length);
    
    return token;
  } catch (error) {
    results.auth = {
      status: 'FAIL',
      error: error.message
    };
    console.error('❌ Authentication FAILED');
    console.error('   Error:', error.message);
    return null;
  }
}

async function testMarketStatus(token) {
  console.log('\n=== TEST 3: MARKET DATA STATUS ===\n');
  
  try {
    const response = await axios.get(`${API_URL}/market/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    results.marketStatus = {
      status: 'PASS',
      configured: response.data.configuration.configured,
      provider: response.data.primaryProvider
    };
    
    console.log('✅ Market Data Status: OK');
    console.log('   Configured:', response.data.configuration.configured);
    console.log('   Provider:', response.data.primaryProvider);
    console.log('   Candle Status:', response.data.providers.TWELVE_DATA.candleStatus);
    console.log('   Quote Status:', response.data.providers.TWELVE_DATA.quoteStatus);
    
    return response.data.configuration.configured;
  } catch (error) {
    results.marketStatus = {
      status: 'FAIL',
      error: error.message
    };
    console.error('❌ Market Data Status: FAILED');
    return false;
  }
}

async function testHistoricalCandles(token) {
  console.log('\n=== TEST 4: HISTORICAL CANDLES (ALL COMBINATIONS) ===\n');
  
  let totalTests = 0;
  let passedTests = 0;
  
  for (const symbol of SYMBOLS) {
    console.log(`\n--- Testing ${symbol} ---\n`);
    
    for (const timeframe of TIMEFRAMES) {
      totalTests++;
      const testKey = `${symbol}_${timeframe}`;
      
      try {
        const startTime = Date.now();
        const response = await axios.get(`${API_URL}/market/candles`, {
          params: {
            symbol,
            interval: timeframe,
            outputsize: 100
          },
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const elapsed = Date.now() - startTime;
        const data = response.data;
        const candles = data.candles || [];
        
        // Validate candles
        const validation = validateCandles(candles);
        
        const passed = 
          candles.length >= 50 &&
          validation.duplicates === 0 &&
          validation.ohlcViolations === 0 &&
          validation.invalidTimestamps === 0 &&
          validation.sorted === true;
        
        if (passed) {
          passedTests++;
          console.log(`  ✅ ${timeframe}: ${candles.length} candles (${elapsed}ms)`);
        } else {
          console.log(`  ❌ ${timeframe}: FAILED`);
          console.log(`     Candles: ${candles.length}`);
          console.log(`     Duplicates: ${validation.duplicates}`);
          console.log(`     OHLC violations: ${validation.ohlcViolations}`);
          console.log(`     Sorted: ${validation.sorted}`);
        }
        
        results.candleTests[testKey] = {
          status: passed ? 'PASS' : 'FAIL',
          candleCount: candles.length,
          responseTime: elapsed,
          validation,
          dataStatus: data.metadata?.dataStatus,
          firstCandle: candles[0]?.timestamp,
          lastCandle: candles[candles.length - 1]?.timestamp
        };
        
      } catch (error) {
        console.log(`  ❌ ${timeframe}: ERROR - ${error.message}`);
        results.candleTests[testKey] = {
          status: 'ERROR',
          error: error.message,
          responseStatus: error.response?.status
        };
      }
    }
  }
  
  console.log(`\n✅ Historical Candles: ${passedTests}/${totalTests} tests passed`);
  return { totalTests, passedTests };
}

function validateCandles(candles) {
  const validation = {
    duplicates: 0,
    ohlcViolations: 0,
    invalidTimestamps: 0,
    sorted: true,
    priceRange: { min: Infinity, max: -Infinity }
  };
  
  const timestamps = new Set();
  let prevTime = 0;
  
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    
    // Check timestamp
    const timestamp = Date.parse(candle.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      validation.invalidTimestamps++;
      continue;
    }
    
    const timeSeconds = Math.floor(timestamp / 1000);
    
    // Check for duplicates
    if (timestamps.has(timeSeconds)) {
      validation.duplicates++;
    }
    timestamps.add(timeSeconds);
    
    // Check chronological order
    if (timeSeconds < prevTime) {
      validation.sorted = false;
    }
    prevTime = timeSeconds;
    
    // Parse OHLC
    const open = parseFloat(candle.open);
    const high = parseFloat(candle.high);
    const low = parseFloat(candle.low);
    const close = parseFloat(candle.close);
    
    // Track price range
    validation.priceRange.min = Math.min(validation.priceRange.min, low);
    validation.priceRange.max = Math.max(validation.priceRange.max, high);
    
    // Validate OHLC constraints
    const maxPrice = Math.max(open, close);
    const minPrice = Math.min(open, close);
    
    if (high < maxPrice || high < low || low > minPrice || low > high) {
      validation.ohlcViolations++;
    }
  }
  
  return validation;
}

function generateReport() {
  console.log('\n'.repeat(2));
  console.log('='.repeat(80));
  console.log('COMPLETE VERIFICATION REPORT'.padStart(55));
  console.log('='.repeat(80));
  console.log('\n');
  
  // Test Summary
  console.log('TEST RESULTS');
  console.log('-'.repeat(80));
  console.log(`Backend Health: ${results.health?.status || 'NOT RUN'}`);
  console.log(`Authentication: ${results.auth?.status || 'NOT RUN'}`);
  console.log(`Market Status: ${results.marketStatus?.status || 'NOT RUN'}`);
  
  const candleTestResults = Object.values(results.candleTests);
  const passedCandles = candleTestResults.filter(t => t.status === 'PASS').length;
  const totalCandles = candleTestResults.length;
  console.log(`Historical Candles: ${passedCandles}/${totalCandles} passed`);
  console.log('');
  
  // Detailed Candle Results
  console.log('DETAILED CANDLE TEST RESULTS');
  console.log('-'.repeat(80));
  
  for (const symbol of SYMBOLS) {
    console.log(`\n${symbol}:`);
    for (const timeframe of TIMEFRAMES) {
      const testKey = `${symbol}_${timeframe}`;
      const result = results.candleTests[testKey];
      
      if (!result) {
        console.log(`  ${timeframe}: NOT RUN`);
        continue;
      }
      
      const icon = result.status === 'PASS' ? '✅' : result.status === 'ERROR' ? '❌' : '⚠️ ';
      console.log(`  ${icon} ${timeframe}: ${result.status}`);
      
      if (result.status === 'PASS' || result.status === 'FAIL') {
        console.log(`     Candles: ${result.candleCount}`);
        console.log(`     Response time: ${result.responseTime}ms`);
        console.log(`     Data status: ${result.dataStatus}`);
        
        if (result.validation && (result.validation.duplicates > 0 || result.validation.ohlcViolations > 0)) {
          console.log(`     ⚠️  Duplicates: ${result.validation.duplicates}`);
          console.log(`     ⚠️  OHLC violations: ${result.validation.ohlcViolations}`);
        }
      }
      
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    }
  }
  
  console.log('\n');
  
  // Overall Verdict
  console.log('OVERALL VERDICT');
  console.log('-'.repeat(80));
  
  const allPassed = 
    results.health?.status === 'PASS' &&
    results.auth?.status === 'PASS' &&
    results.marketStatus?.status === 'PASS' &&
    passedCandles === totalCandles;
  
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED - BACKEND READY FOR BROWSER TEST');
    console.log('');
    console.log('NEXT STEP: BROWSER VERIFICATION');
    console.log('1. Open http://localhost:3000 in your browser');
    console.log('2. Login with:');
    console.log(`   Email: ${TEST_USER.email}`);
    console.log(`   Password: ${TEST_USER.password}`);
    console.log('3. Navigate to Trading Dashboard');
    console.log('4. Select EURUSD + 1m timeframe');
    console.log('5. Verify historical candles load');
    console.log('6. Wait 2 minutes to verify live updates');
    console.log('7. Test timeframe switching (5m, 15m, 1H)');
    console.log('8. Test symbol switching (GBPUSD, USDJPY)');
  } else {
    console.log('❌ SOME TESTS FAILED - FIX ISSUES BEFORE BROWSER TEST');
  }
  
  console.log('');
  console.log('='.repeat(80));
  console.log('');
  
  // Save results
  results.summary = {
    timestamp: new Date().toISOString(),
    allPassed,
    totalTests: totalCandles + 3,
    passedTests: (results.health?.status === 'PASS' ? 1 : 0) +
                 (results.auth?.status === 'PASS' ? 1 : 0) +
                 (results.marketStatus?.status === 'PASS' ? 1 : 0) +
                 passedCandles
  };
  
  fs.writeFileSync(
    'BROWSER_TEST_RESULTS.json',
    JSON.stringify(results, null, 2),
    'utf8'
  );
  console.log('📝 Detailed results saved to BROWSER_TEST_RESULTS.json\n');
}

async function main() {
  await setup();
  
  try {
    // Test 1: Health
    const healthOK = await testHealth();
    if (!healthOK) {
      console.error('\n❌ Backend health check failed. Cannot continue.');
      generateReport();
      return;
    }
    
    // Test 2: Auth
    const token = await getAuthToken();
    if (!token) {
      console.error('\n❌ Authentication failed. Cannot continue.');
      generateReport();
      return;
    }
    
    // Test 3: Market Status
    const marketConfigured = await testMarketStatus(token);
    if (!marketConfigured) {
      console.error('\n❌ Market data not configured. Cannot continue.');
      generateReport();
      return;
    }
    
    // Test 4: Historical Candles
    await testHistoricalCandles(token);
    
    // Generate report
    generateReport();
    
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error);
    console.error(error.stack);
    generateReport();
  }
}

main().catch(console.error);
