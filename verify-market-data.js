/**
 * Market Data Verification Script
 * 
 * Tests the Twelve Data integration end-to-end
 */

const API_KEY = '02884101fc5646aea4b2af4239448176';

async function testQuote() {
  console.log('\n=== Testing Quote Endpoint ===');
  try {
    const response = await fetch(
      `https://api.twelvedata.com/quote?symbol=EUR/USD&apikey=${API_KEY}`
    );
    const data = await response.json();
    
    if (data.symbol) {
      console.log('✅ Quote test PASSED');
      console.log(`   Symbol: ${data.symbol}`);
      console.log(`   Price: ${data.close}`);
      console.log(`   Open: ${data.open}`);
      console.log(`   High: ${data.high}`);
      console.log(`   Low: ${data.low}`);
      console.log(`   Market Open: ${data.is_market_open}`);
      return true;
    } else {
      console.log('❌ Quote test FAILED');
      console.log('   Response:', JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.log('❌ Quote test ERROR:', error.message);
    return false;
  }
}

async function testCandles() {
  console.log('\n=== Testing Candles Endpoint ===');
  
  const timeframes = ['1min', '5min', '10min', '15min', '30min', '1h', '4h', '1day'];
  let successCount = 0;
  
  for (const interval of timeframes) {
    try {
      const response = await fetch(
        `https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=${interval}&outputsize=5&apikey=${API_KEY}`
      );
      const data = await response.json();
      
      if (data.values && data.values.length > 0) {
        console.log(`✅ ${interval.padEnd(6)} - ${data.values.length} candles`);
        successCount++;
      } else if (data.status === 'error') {
        console.log(`❌ ${interval.padEnd(6)} - Error: ${data.message}`);
      } else {
        console.log(`⚠️  ${interval.padEnd(6)} - No data`);
      }
      
      // Rate limit protection - wait between requests
      await new Promise(resolve => setTimeout(resolve, 8000));
    } catch (error) {
      console.log(`❌ ${interval.padEnd(6)} - ERROR: ${error.message}`);
    }
  }
  
  console.log(`\n${successCount}/${timeframes.length} timeframes working`);
  return successCount === timeframes.length;
}

async function testLocalAPI() {
  console.log('\n=== Testing Local API Backend ===');
  
  try {
    // Test health endpoint
    const healthResponse = await fetch('http://localhost:3001/api/health');
    const health = await healthResponse.json();
    
    if (health.status === 'ok') {
      console.log('✅ Backend health check PASSED');
      console.log(`   Database: ${health.database}`);
      return true;
    } else {
      console.log('❌ Backend health check FAILED');
      return false;
    }
  } catch (error) {
    console.log('❌ Backend health check ERROR:', error.message);
    console.log('   Make sure the API server is running on port 3001');
    return false;
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   Market Data Verification Script                     ║');
  console.log('║   Testing Twelve Data Integration                     ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  
  const results = {
    quote: false,
    candles: false,
    backend: false,
  };
  
  // Test local backend first
  results.backend = await testLocalAPI();
  
  // Test quote endpoint
  results.quote = await testQuote();
  
  // Test candles endpoint (will take ~1 minute due to rate limiting)
  console.log('\n⚠️  Candle tests will take ~1 minute due to rate limiting (8 req/min)');
  results.candles = await testCandles();
  
  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   Test Summary                                        ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║   Backend Health:      ${results.backend ? '✅ PASS' : '❌ FAIL'}                         ║`);
  console.log(`║   Quote Endpoint:      ${results.quote ? '✅ PASS' : '❌ FAIL'}                         ║`);
  console.log(`║   Candles Endpoint:    ${results.candles ? '✅ PASS' : '❌ FAIL'}                         ║`);
  console.log('╚═══════════════════════════════════════════════════════╝');
  
  const allPassed = results.backend && results.quote && results.candles;
  
  if (allPassed) {
    console.log('\n🎉 All tests PASSED! Market data integration is working correctly.');
    console.log('\nNext steps:');
    console.log('1. Open http://localhost:3000 in your browser');
    console.log('2. Login and navigate to a trading account');
    console.log('3. Ensure "LIVE" mode is selected');
    console.log('4. Select EUR/USD and try different timeframes');
    console.log('5. Verify the chart displays real candles');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
    if (!results.backend) {
      console.log('\nBackend is not running. Start it with:');
      console.log('   cd apps/api');
      console.log('   npm run start:dev');
    }
  }
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
