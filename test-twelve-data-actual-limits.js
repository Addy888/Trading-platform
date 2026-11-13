/**
 * TWELVE DATA ACTUAL LIMITATIONS AUDIT
 * 
 * This script makes REAL API calls to Twelve Data to determine:
 * 1. Whether REST API works for Forex quotes and historical candles
 * 2. Whether WebSocket endpoint is accessible
 * 3. Actual error codes returned
 * 4. Maximum outputsize supported
 * 5. Whether symbols are permitted
 * 6. Rate limit behavior
 */

const API_KEY = '02884101fc5646aea4b2af4239448176'; // From .env file
const BASE_URL = 'https://api.twelvedata.com';

// Test results collector
const results = {
  timestamp: new Date().toISOString(),
  apiKey: API_KEY ? '***CONFIGURED***' : 'MISSING',
  tests: {}
};

/**
 * Make a REST API request and capture full response details
 */
async function testRestEndpoint(testName, path, params) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST: ${testName}`);
  console.log(`${'='.repeat(80)}`);
  
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  
  // Add API key
  url.searchParams.set('apikey', API_KEY);
  
  console.log(`\nRequest URL: ${url.toString().replace(API_KEY, '***API_KEY***')}`);
  console.log(`Request params:`, JSON.stringify(params, null, 2));
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`\nHTTP Status: ${response.status} ${response.statusText}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Headers:`, {
      'content-type': response.headers.get('content-type'),
      'retry-after': response.headers.get('retry-after'),
      'x-ratelimit-limit': response.headers.get('x-ratelimit-limit'),
      'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
      'x-ratelimit-reset': response.headers.get('x-ratelimit-reset')
    });
    
    let body;
    try {
      body = await response.json();
    } catch (e) {
      const text = await response.text();
      console.log(`\nResponse (text): ${text.substring(0, 500)}`);
      
      results.tests[testName] = {
        status: response.status,
        success: false,
        error: 'Invalid JSON response',
        responseText: text.substring(0, 500),
        duration
      };
      return { success: false, status: response.status, error: 'Invalid JSON', rawResponse: text };
    }
    
    console.log(`\nResponse body:`, JSON.stringify(body, null, 2).substring(0, 2000));
    
    // Check for API errors
    if (body.status === 'error' || body.code === 'error' || !response.ok) {
      console.log(`\n❌ FAILED: ${body.message || body.code || 'Unknown error'}`);
      
      results.tests[testName] = {
        status: response.status,
        success: false,
        error: body.message || body.code || 'Request failed',
        errorCode: body.code,
        body,
        duration
      };
      
      return { success: false, status: response.status, error: body.message, body };
    }
    
    // Success case
    console.log(`\n✅ SUCCESS`);
    
    const dataCount = Array.isArray(body.values) ? body.values.length :
                      Array.isArray(body.data) ? body.data.length :
                      body.price ? 1 : 0;
    
    console.log(`Data points returned: ${dataCount}`);
    
    results.tests[testName] = {
      status: response.status,
      success: true,
      dataCount,
      body: {
        meta: body.meta,
        status: body.status,
        sampleData: body.values ? body.values.slice(0, 3) : 
                    body.data ? body.data.slice(0, 3) :
                    body.price ? { price: body.price, timestamp: body.timestamp } : null
      },
      duration
    };
    
    return { success: true, status: response.status, body, dataCount };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`\n❌ ERROR: ${error.message}`);
    
    results.tests[testName] = {
      status: null,
      success: false,
      error: error.message,
      duration
    };
    
    return { success: false, error: error.message };
  }
}

/**
 * Test WebSocket connection attempt
 */
async function testWebSocket() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST: WebSocket Connection`);
  console.log(`${'='.repeat(80)}`);
  
  return new Promise((resolve) => {
    const WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price?apikey=' + API_KEY;
    console.log(`\nWebSocket URL: wss://ws.twelvedata.com/v1/quotes/price?apikey=***API_KEY***`);
    
    try {
      const ws = new WebSocket(WS_URL);
      const timeout = setTimeout(() => {
        console.log(`\n⏱️ TIMEOUT: No response after 5 seconds`);
        ws.close();
        results.tests['websocket_connection'] = {
          success: false,
          error: 'Connection timeout after 5 seconds'
        };
        resolve({ success: false, error: 'Timeout' });
      }, 5000);
      
      ws.onopen = () => {
        console.log(`\n✅ WebSocket connection opened`);
        
        // Try to subscribe to EUR/USD
        const subscribeMsg = {
          action: 'subscribe',
          params: {
            symbols: 'EUR/USD'
          }
        };
        console.log(`\nSending subscribe message:`, JSON.stringify(subscribeMsg, null, 2));
        ws.send(JSON.stringify(subscribeMsg));
        
        // Wait for response
        setTimeout(() => {
          ws.close();
        }, 3000);
      };
      
      ws.onmessage = (event) => {
        console.log(`\n📨 WebSocket message received:`, event.data);
        const msg = JSON.parse(event.data);
        
        if (msg.event === 'subscribe-status') {
          clearTimeout(timeout);
          if (msg.status === 'ok') {
            console.log(`\n✅ WebSocket subscription successful`);
            results.tests['websocket_connection'] = {
              success: true,
              subscriptionStatus: 'ok',
              message: msg
            };
            ws.close();
            resolve({ success: true, subscriptionStatus: 'ok' });
          } else {
            console.log(`\n❌ WebSocket subscription failed: ${msg.status}`);
            results.tests['websocket_connection'] = {
              success: false,
              error: `Subscription status: ${msg.status}`,
              message: msg
            };
            ws.close();
            resolve({ success: false, error: msg.status, message: msg });
          }
        } else if (msg.event === 'price') {
          console.log(`\n✅ Received price update: ${msg.symbol} = ${msg.price}`);
        }
      };
      
      ws.onerror = (error) => {
        clearTimeout(timeout);
        console.log(`\n❌ WebSocket error:`, error.message || error.type);
        results.tests['websocket_connection'] = {
          success: false,
          error: `WebSocket error: ${error.message || error.type}`
        };
        resolve({ success: false, error: error.message });
      };
      
      ws.onclose = (event) => {
        clearTimeout(timeout);
        console.log(`\n🔌 WebSocket closed: code=${event.code}, reason=${event.reason || 'none'}`);
        if (!results.tests['websocket_connection']) {
          results.tests['websocket_connection'] = {
            success: false,
            error: `Connection closed: code=${event.code}, reason=${event.reason || 'unknown'}`
          };
          resolve({ success: false, error: `Closed: ${event.code}` });
        }
      };
      
    } catch (error) {
      console.log(`\n❌ WebSocket setup error: ${error.message}`);
      results.tests['websocket_connection'] = {
        success: false,
        error: error.message
      };
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * Main test suite
 */
async function runTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  TWELVE DATA API LIMITATIONS AUDIT                         ║');
  console.log('║                                                                            ║');
  console.log('║  Testing actual API capabilities and plan restrictions                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nTimestamp: ${results.timestamp}`);
  console.log(`API Key: ${results.apiKey}`);
  
  if (!API_KEY) {
    console.log('\n❌ CRITICAL: No API key found in .env file');
    console.log('Cannot proceed with tests.');
    return;
  }
  
  // TEST 1: Latest quote for EUR/USD
  await testRestEndpoint(
    'EURUSD_quote',
    '/quote',
    {
      symbol: 'EUR/USD'
    }
  );
  
  // Wait 2 seconds to avoid rate limit
  console.log('\n⏳ Waiting 2 seconds to avoid rate limit...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // TEST 2: Historical candles - 100 candles (current default)
  await testRestEndpoint(
    'EURUSD_1min_100_candles',
    '/time_series',
    {
      symbol: 'EUR/USD',
      interval: '1min',
      outputsize: '100',
      timezone: 'UTC',
      order: 'ASC'
    }
  );
  
  // Wait 2 seconds
  console.log('\n⏳ Waiting 2 seconds to avoid rate limit...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // TEST 3: Historical candles - 500 candles (claimed in previous reports)
  await testRestEndpoint(
    'EURUSD_1min_500_candles',
    '/time_series',
    {
      symbol: 'EUR/USD',
      interval: '1min',
      outputsize: '500',
      timezone: 'UTC',
      order: 'ASC'
    }
  );
  
  // Wait 2 seconds
  console.log('\n⏳ Waiting 2 seconds to avoid rate limit...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // TEST 4: Historical candles - 5000 candles (maximum allowed by API)
  await testRestEndpoint(
    'EURUSD_1min_5000_candles',
    '/time_series',
    {
      symbol: 'EUR/USD',
      interval: '1min',
      outputsize: '5000',
      timezone: 'UTC',
      order: 'ASC'
    }
  );
  
  // Wait 2 seconds
  console.log('\n⏳ Waiting 2 seconds to avoid rate limit...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // TEST 5: GBP/USD quote
  await testRestEndpoint(
    'GBPUSD_quote',
    '/quote',
    {
      symbol: 'GBP/USD'
    }
  );
  
  // Wait 2 seconds
  console.log('\n⏳ Waiting 2 seconds to avoid rate limit...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // TEST 6: USD/JPY 1min candles
  await testRestEndpoint(
    'USDJPY_1min_100_candles',
    '/time_series',
    {
      symbol: 'USD/JPY',
      interval: '1min',
      outputsize: '100',
      timezone: 'UTC',
      order: 'ASC'
    }
  );
  
  // Wait 2 seconds
  console.log('\n⏳ Waiting 2 seconds to avoid rate limit...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // TEST 7: 1-hour candles
  await testRestEndpoint(
    'EURUSD_1h_100_candles',
    '/time_series',
    {
      symbol: 'EUR/USD',
      interval: '1h',
      outputsize: '100',
      timezone: 'UTC',
      order: 'ASC'
    }
  );
  
  // Wait 2 seconds
  console.log('\n⏳ Waiting 2 seconds to avoid rate limit...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // TEST 8: WebSocket connection (if supported by plan)
  if (typeof WebSocket !== 'undefined') {
    await testWebSocket();
  } else {
    console.log('\n⚠️ WebSocket not available in Node.js environment');
    console.log('WebSocket test should be run in browser or with ws library');
    results.tests['websocket_connection'] = {
      success: false,
      error: 'WebSocket API not available in this environment'
    };
  }
  
  // Final summary
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('AUDIT SUMMARY');
  console.log(`${'='.repeat(80)}`);
  
  const testNames = Object.keys(results.tests);
  const passedTests = testNames.filter(name => results.tests[name].success);
  const failedTests = testNames.filter(name => !results.tests[name].success);
  
  console.log(`\nTotal tests: ${testNames.length}`);
  console.log(`Passed: ${passedTests.length} ✅`);
  console.log(`Failed: ${failedTests.length} ❌`);
  
  if (passedTests.length > 0) {
    console.log(`\n✅ PASSED TESTS:`);
    passedTests.forEach(name => {
      const test = results.tests[name];
      console.log(`  - ${name}: ${test.dataCount ? `${test.dataCount} data points` : 'success'}`);
    });
  }
  
  if (failedTests.length > 0) {
    console.log(`\n❌ FAILED TESTS:`);
    failedTests.forEach(name => {
      const test = results.tests[name];
      console.log(`  - ${name}: ${test.error || 'Unknown error'}`);
      if (test.errorCode) {
        console.log(`    Error code: ${test.errorCode}`);
      }
    });
  }
  
  // Determine actual limitations
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('IDENTIFIED LIMITATIONS');
  console.log(`${'='.repeat(80)}`);
  
  const limitations = [];
  
  // Check if REST API works
  const restWorks = results.tests['EURUSD_quote']?.success || results.tests['EURUSD_1min_100_candles']?.success;
  if (!restWorks) {
    limitations.push('❌ REST API not working - API key may be invalid or expired');
  } else {
    console.log('✅ REST API: Working');
  }
  
  // Check maximum candles
  const candles100 = results.tests['EURUSD_1min_100_candles']?.dataCount || 0;
  const candles500 = results.tests['EURUSD_1min_500_candles']?.dataCount || 0;
  const candles5000 = results.tests['EURUSD_1min_5000_candles']?.dataCount || 0;
  
  console.log(`\nHistorical candle limits:`);
  console.log(`  - 100 requested: ${candles100} received`);
  console.log(`  - 500 requested: ${candles500} received`);
  console.log(`  - 5000 requested: ${candles5000} received`);
  
  if (candles100 < 100 && candles100 > 0) {
    limitations.push(`⚠️ Limited historical data: Only ${candles100} candles available (not 100)`);
  }
  if (candles500 < 500 && results.tests['EURUSD_1min_500_candles']?.success) {
    limitations.push(`⚠️ 500 candles requested but only ${candles500} returned`);
  }
  if (!results.tests['EURUSD_1min_5000_candles']?.success) {
    limitations.push('❌ 5000 candle request failed - likely plan restriction');
  }
  
  // Check WebSocket
  const wsWorks = results.tests['websocket_connection']?.success;
  if (wsWorks) {
    console.log('✅ WebSocket: Supported');
  } else {
    limitations.push('❌ WebSocket not supported by current plan');
    console.log(`❌ WebSocket: ${results.tests['websocket_connection']?.error || 'Not available'}`);
  }
  
  // Check symbols
  const symbolTests = ['EURUSD_quote', 'GBPUSD_quote', 'USDJPY_1min_100_candles'];
  const workingSymbols = symbolTests.filter(test => results.tests[test]?.success);
  if (workingSymbols.length < symbolTests.length) {
    console.log(`\n⚠️ Some symbols not available: ${symbolTests.length - workingSymbols.length} failed`);
  } else {
    console.log(`\n✅ All tested symbols available (EUR/USD, GBP/USD, USD/JPY)`);
  }
  
  if (limitations.length === 0) {
    console.log(`\n✅ No critical limitations detected`);
  } else {
    console.log(`\n${'─'.repeat(80)}`);
    console.log('DETECTED LIMITATIONS:');
    limitations.forEach(limitation => console.log(limitation));
  }
  
  // Save results
  const fs = require('fs');
  const outputFile = 'TWELVE_DATA_ACTUAL_LIMITS_AUDIT.json';
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n📄 Full results saved to: ${outputFile}`);
  
  console.log(`\n${'='.repeat(80)}\n`);
}

// Run the tests
runTests().catch(error => {
  console.error('\n❌ Audit failed:', error);
  process.exit(1);
});
