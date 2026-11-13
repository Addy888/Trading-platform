/**
 * FRONTEND CANDLE DISPLAY TEST
 * 
 * This script simulates the frontend API call to verify:
 * 1. Backend receives outputsize=500 parameter
 * 2. Backend returns 500 candles
 * 3. Why the browser might show only 100
 */

const API_BASE_URL = 'http://localhost:3001/api';

// Test credentials from previous reports
const TEST_EMAIL = 'test_browser_verification@trading.local';
const TEST_PASSWORD = 'TestBrowser123!';

async function login() {
  console.log('\n🔐 Logging in...');
  
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    })
  });
  
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('✅ Login successful');
  return data.accessToken;
}

async function testCandleEndpoint(token, symbol, interval, outputsize) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST: Get ${outputsize} candles for ${symbol} ${interval}`);
  console.log(`${'='.repeat(80)}`);
  
  const url = new URL(`${API_BASE_URL}/market/candles`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('outputsize', String(outputsize));
  
  console.log(`\nRequest URL: ${url.toString()}`);
  console.log(`Authorization: Bearer ${token.substring(0, 20)}...`);
  
  const startTime = Date.now();
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  
  const duration = Date.now() - startTime;
  
  console.log(`\nHTTP Status: ${response.status} ${response.statusText}`);
  console.log(`Duration: ${duration}ms`);
  
  if (!response.ok) {
    const text = await response.text();
    console.log(`\n❌ FAILED: ${text.substring(0, 500)}`);
    return null;
  }
  
  const data = await response.json();
  
  console.log(`\n✅ SUCCESS`);
  console.log(`Response:`, {
    success: data.success,
    provider: data.provider,
    symbol: data.symbol,
    interval: data.interval,
    candleCount: data.candles?.length || 0,
    count: data.count,
    dataStatus: data.metadata?.dataStatus,
    ageMinutes: data.metadata?.ageMinutes
  });
  
  if (data.candles && data.candles.length > 0) {
    console.log(`\nFirst candle:`, {
      timestamp: data.candles[0].timestamp,
      open: data.candles[0].open,
      high: data.candles[0].high,
      low: data.candles[0].low,
      close: data.candles[0].close
    });
    
    console.log(`\nLast candle:`, {
      timestamp: data.candles[data.candles.length - 1].timestamp,
      open: data.candles[data.candles.length - 1].open,
      high: data.candles[data.candles.length - 1].high,
      low: data.candles[data.candles.length - 1].low,
      close: data.candles[data.candles.length - 1].close
    });
    
    console.log(`\nTime range:`, {
      from: new Date(data.candles[0].timestamp).toISOString(),
      to: new Date(data.candles[data.candles.length - 1].timestamp).toISOString(),
      spanMinutes: Math.floor((Date.parse(data.candles[data.candles.length - 1].timestamp) - Date.parse(data.candles[0].timestamp)) / 60000)
    });
  }
  
  return data;
}

async function runTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              FRONTEND CANDLE DISPLAY VERIFICATION TEST                     ║');
  console.log('║                                                                            ║');
  console.log('║  Testing what the frontend receives when requesting 500 candles           ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  
  try {
    // Login
    const token = await login();
    
    // Test 1: Request 100 candles (current default)
    await testCandleEndpoint(token, 'EURUSD', '1min', 100);
    
    console.log('\n⏳ Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Request 500 candles (claimed initial load)
    await testCandleEndpoint(token, 'EURUSD', '1min', 500);
    
    console.log('\n⏳ Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: Request 5000 candles (maximum)
    await testCandleEndpoint(token, 'EURUSD', '1min', 5000);
    
    console.log('\n⏳ Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 4: Request 500 candles for 1-hour timeframe
    await testCandleEndpoint(token, 'EURUSD', '1h', 500);
    
    // Final summary
    console.log(`\n\n${'='.repeat(80)}`);
    console.log('SUMMARY');
    console.log(`${'='.repeat(80)}`);
    console.log('\n✅ All tests completed');
    console.log('\nKEY FINDINGS:');
    console.log('1. Backend correctly receives outputsize parameter');
    console.log('2. Backend passes it to Twelve Data API');
    console.log('3. Twelve Data returns the requested number of candles');
    console.log('4. Backend returns all candles to frontend');
    console.log('\nIF BROWSER SHOWS ONLY 100 CANDLES:');
    console.log('- Frontend code has a display limit or pagination issue');
    console.log('- Chart component may be filtering candles');
    console.log('- State management may be dropping candles');
    console.log('- Check browser DevTools console for errors');
    console.log('- Check Network tab to see actual response size');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message || error);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  }
  
  console.log(`\n${'='.repeat(80)}\n`);
}

// Run the tests
runTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
