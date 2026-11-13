/**
 * END-TO-END HISTORICAL CANDLE VERIFICATION
 * 
 * Tests the complete data flow:
 * Twelve Data API → Backend Provider → Backend Controller → Frontend → Browser
 */

const axios = require('axios');

const BACKEND_URL = 'http://localhost:3001/api';
const FRONTEND_URL = 'http://localhost:3000';
const TEST_SYMBOL = 'EURUSD';
const TEST_TIMEFRAMES = ['1min', '5min', '15min', '30min', '1h', '4h', '1day'];
const EXPECTED_CANDLES = 100;

// Test results storage
const results = {
  backend: [],
  frontend: [],
  timeframes: {},
  errors: [],
  summary: {}
};

/**
 * TEST 1: Verify Backend Health
 */
async function testBackendHealth() {
  console.log('\n=== TEST 1: BACKEND HEALTH CHECK ===\n');
  
  try {
    // Test root health endpoint
    const healthResponse = await axios.get(`${BACKEND_URL.replace('/api', '')}/health`, {
      validateStatus: () => true
    });
    
    console.log('Health endpoint response:', {
      status: healthResponse.status,
      statusText: healthResponse.statusText,
      data: healthResponse.data
    });
    
    if (healthResponse.status === 200) {
      console.log('✅ Backend health check PASSED');
      results.backend.push({ test: 'health', status: 'PASS' });
    } else {
      console.log(`❌ Backend health check returned ${healthResponse.status}`);
      results.backend.push({ test: 'health', status: 'FAIL', code: healthResponse.status });
    }
  } catch (error) {
    console.error('❌ Backend health check ERROR:', error.message);
    results.backend.push({ test: 'health', status: 'ERROR', message: error.message });
  }
}

/**
 * TEST 2: Verify Market Data Status (requires auth token)
 */
async function testMarketDataStatus(token) {
  console.log('\n=== TEST 2: MARKET DATA STATUS ===\n');
  
  try {
    const statusResponse = await axios.get(`${BACKEND_URL}/market/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('Market data status:', {
      primaryProvider: statusResponse.data.primaryProvider,
      configured: statusResponse.data.configuration.configured,
      twelveDataStatus: statusResponse.data.providers.TWELVE_DATA.status,
      candleLastSuccess: statusResponse.data.candleLastSuccessAt,
      quoteStatus: statusResponse.data.providers.TWELVE_DATA.quoteStatus
    });
    
    if (statusResponse.data.configuration.configured) {
      console.log('✅ Market data is configured');
      results.backend.push({ test: 'status', status: 'PASS' });
      return true;
    } else {
      console.log('❌ Market data NOT configured');
      results.backend.push({ test: 'status', status: 'FAIL', reason: 'not_configured' });
      return false;
    }
  } catch (error) {
    console.error('❌ Market data status ERROR:', error.message);
    results.backend.push({ test: 'status', status: 'ERROR', message: error.message });
    return false;
  }
}

/**
 * TEST 3: Test Historical Candles for All Timeframes
 */
async function testHistoricalCandles(token) {
  console.log('\n=== TEST 3: HISTORICAL CANDLES (ALL TIMEFRAMES) ===\n');
  
  for (const timeframe of TEST_TIMEFRAMES) {
    console.log(`\n--- Testing ${TEST_SYMBOL} ${timeframe} ---`);
    
    try {
      const startTime = Date.now();
      const response = await axios.get(`${BACKEND_URL}/market/candles`, {
        params: {
          symbol: TEST_SYMBOL,
          interval: timeframe,
          outputsize: EXPECTED_CANDLES
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const elapsed = Date.now() - startTime;
      
      const data = response.data;
      const candles = data.candles || [];
      
      console.log('Response:', {
        success: data.success,
        provider: data.provider,
        symbol: data.symbol,
        interval: data.interval,
        candleCount: candles.length,
        requestedCount: EXPECTED_CANDLES,
        responseTime: `${elapsed}ms`,
        dataStatus: data.metadata?.dataStatus,
        ageMinutes: data.metadata?.ageMinutes
      });
      
      // Validate candles
      const validation = {
        requested: EXPECTED_CANDLES,
        received: candles.length,
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
          console.error(`  ❌ OHLC violation at candle ${i}:`, {
            timestamp: candle.timestamp,
            open, high, low, close
          });
        }
      }
      
      // Log sample candles
      if (candles.length > 0) {
        console.log('\nFirst candle:', {
          timestamp: candles[0].timestamp,
          open: candles[0].open,
          high: candles[0].high,
          low: candles[0].low,
          close: candles[0].close
        });
        
        console.log('Last candle:', {
          timestamp: candles[candles.length - 1].timestamp,
          open: candles[candles.length - 1].open,
          high: candles[candles.length - 1].high,
          low: candles[candles.length - 1].low,
          close: candles[candles.length - 1].close
        });
      }
      
      console.log('\nValidation:', validation);
      
      // Determine pass/fail
      const passed = 
        validation.received >= 50 && // At least 50 candles
        validation.duplicates === 0 &&
        validation.ohlcViolations === 0 &&
        validation.invalidTimestamps === 0 &&
        validation.sorted === true;
      
      if (passed) {
        console.log(`✅ ${timeframe} PASSED all validation checks`);
      } else {
        console.log(`❌ ${timeframe} FAILED validation`);
      }
      
      results.timeframes[timeframe] = {
        status: passed ? 'PASS' : 'FAIL',
        validation,
        responseTime: elapsed,
        dataStatus: data.metadata?.dataStatus
      };
      
    } catch (error) {
      console.error(`❌ ${timeframe} ERROR:`, error.message);
      if (error.response) {
        console.error('  Response status:', error.response.status);
        console.error('  Response data:', error.response.data);
      }
      results.timeframes[timeframe] = {
        status: 'ERROR',
        message: error.message,
        responseStatus: error.response?.status
      };
    }
  }
}

/**
 * TEST 4: Frontend Health Check
 */
async function testFrontendHealth() {
  console.log('\n=== TEST 4: FRONTEND HEALTH CHECK ===\n');
  
  try {
    const response = await axios.get(FRONTEND_URL, {
      validateStatus: () => true,
      maxRedirects: 0
    });
    
    console.log('Frontend response:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers['content-type']
    });
    
    if (response.status === 200 || response.status === 304) {
      console.log('✅ Frontend is accessible');
      results.frontend.push({ test: 'health', status: 'PASS' });
    } else {
      console.log(`⚠️  Frontend returned ${response.status} (may require login)`);
      results.frontend.push({ test: 'health', status: 'WARN', code: response.status });
    }
  } catch (error) {
    console.error('❌ Frontend health check ERROR:', error.message);
    results.frontend.push({ test: 'health', status: 'ERROR', message: error.message });
  }
}

/**
 * Get auth token (you'll need to provide this)
 */
function getAuthToken() {
  // Check if token is provided as command line argument
  const token = process.argv[2];
  if (token && token.length > 20) {
    return token;
  }
  
  console.log('\n⚠️  WARNING: No authentication token provided');
  console.log('Usage: node test-historical-candles-e2e.js YOUR_ACCESS_TOKEN');
  console.log('\nTo get a token:');
  console.log('1. Open browser and navigate to http://localhost:3000');
  console.log('2. Log in to the application');
  console.log('3. Open DevTools (F12) → Console');
  console.log('4. Type: localStorage.getItem("accessToken")');
  console.log('5. Copy the token and run: node test-historical-candles-e2e.js YOUR_TOKEN');
  console.log('\nWill attempt to run non-authenticated tests only...\n');
  
  return null;
}

/**
 * Generate Test Report
 */
function generateReport() {
  console.log('\n'.repeat(2));
  console.log('='.repeat(80));
  console.log('END-TO-END HISTORICAL CANDLE TEST REPORT'.padStart(55));
  console.log('='.repeat(80));
  console.log('\n');
  
  // Backend Tests
  console.log('BACKEND TESTS');
  console.log('-'.repeat(80));
  results.backend.forEach(test => {
    const icon = test.status === 'PASS' ? '✅' : test.status === 'ERROR' ? '❌' : '⚠️ ';
    console.log(`${icon} ${test.test}: ${test.status}`, test.message || test.reason || '');
  });
  console.log('');
  
  // Timeframe Tests
  console.log('TIMEFRAME TESTS');
  console.log('-'.repeat(80));
  Object.entries(results.timeframes).forEach(([timeframe, result]) => {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'ERROR' ? '❌' : '⚠️ ';
    console.log(`${icon} ${timeframe}: ${result.status}`);
    if (result.validation) {
      console.log(`   Candles: ${result.validation.received}/${result.validation.requested}`);
      console.log(`   Duplicates: ${result.validation.duplicates}`);
      console.log(`   OHLC violations: ${result.validation.ohlcViolations}`);
      console.log(`   Sorted: ${result.validation.sorted ? 'Yes' : 'No'}`);
      console.log(`   Response time: ${result.responseTime}ms`);
      console.log(`   Data status: ${result.dataStatus || 'unknown'}`);
    }
    if (result.message) {
      console.log(`   Error: ${result.message}`);
    }
    console.log('');
  });
  
  // Frontend Tests
  console.log('FRONTEND TESTS');
  console.log('-'.repeat(80));
  results.frontend.forEach(test => {
    const icon = test.status === 'PASS' ? '✅' : test.status === 'ERROR' ? '❌' : '⚠️ ';
    console.log(`${icon} ${test.test}: ${test.status}`, test.message || '');
  });
  console.log('');
  
  // Summary
  const timeframeTests = Object.values(results.timeframes);
  const passedTimeframes = timeframeTests.filter(t => t.status === 'PASS').length;
  const totalTimeframes = timeframeTests.length;
  const backendPassed = results.backend.filter(t => t.status === 'PASS').length;
  
  console.log('SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Backend tests: ${backendPassed}/${results.backend.length} passed`);
  console.log(`Timeframe tests: ${passedTimeframes}/${totalTimeframes} passed`);
  console.log(`Frontend tests: ${results.frontend.filter(t => t.status === 'PASS').length}/${results.frontend.length} passed`);
  console.log('');
  
  const overallPass = backendPassed > 0 && passedTimeframes === totalTimeframes;
  if (overallPass) {
    console.log('✅ OVERALL: ALL HISTORICAL CANDLE TESTS PASSED');
  } else {
    console.log('❌ OVERALL: SOME TESTS FAILED');
  }
  
  console.log('');
  console.log('='.repeat(80));
  console.log('');
  
  // Save results to file
  const fs = require('fs');
  fs.writeFileSync(
    'test-historical-results.json',
    JSON.stringify(results, null, 2),
    'utf8'
  );
  console.log('📝 Detailed results saved to test-historical-results.json');
}

/**
 * Main execution
 */
async function main() {
  console.log('END-TO-END HISTORICAL CANDLE VERIFICATION');
  console.log('Testing: Twelve Data API → Backend → Frontend');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Start Time: ${new Date().toISOString()}`);
  
  const token = getAuthToken();
  
  try {
    // Test 1: Backend health
    await testBackendHealth();
    
    // Test 2-3: Market data (requires token)
    if (token) {
      const isConfigured = await testMarketDataStatus(token);
      
      if (isConfigured) {
        await testHistoricalCandles(token);
      } else {
        console.log('\n⚠️  Skipping historical candle tests - market data not configured');
      }
    } else {
      console.log('\n⚠️  Skipping authenticated tests - no token provided');
    }
    
    // Test 4: Frontend health
    await testFrontendHealth();
    
    // Generate report
    generateReport();
    
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error);
    results.errors.push({
      message: error.message,
      stack: error.stack
    });
    generateReport();
  }
}

// Run the test suite
main().catch(console.error);
