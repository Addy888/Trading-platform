/**
 * Twelve Data Connection Test Script
 * 
 * This script verifies the actual Twelve Data API connection
 * WITHOUT exposing credentials in logs or reports.
 * 
 * Run: node test-twelvedata-connection.js
 */

require('dotenv').config();

const API_KEY = process.env.TWELVE_DATA_API_KEY;

async function testTwelveDataConnection() {
  console.log('='.repeat(70));
  console.log('TWELVE DATA CONNECTION TEST');
  console.log('='.repeat(70));
  console.log('');

  // Check if API key is configured
  if (!API_KEY || API_KEY.trim() === '') {
    console.log('❌ BLOCKED: TWELVE_DATA_API_KEY not configured in .env');
    console.log('   Configure the API key and retry.');
    return { status: 'BLOCKED', reason: 'API key not configured' };
  }

  console.log('✓ API key is configured');
  console.log('  Length:', API_KEY.length, 'characters');
  console.log('  Format:', API_KEY.substring(0, 8) + '...' + API_KEY.substring(API_KEY.length - 4));
  console.log('');

  // Test symbols (commonly supported by Twelve Data)
  const testSymbols = ['EUR/USD', 'AAPL', 'BTC/USD'];
  
  for (const symbol of testSymbols) {
    console.log(`Testing symbol: ${symbol}`);
    console.log('-'.repeat(70));
    
    try {
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
      
      // Make request without logging the full URL (contains API key)
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      const status = response.status;
      console.log('  HTTP Status:', status);

      if (!response.ok) {
        console.log('  ❌ HTTP Error:', response.statusText);
        const errorText = await response.text();
        console.log('  Error details:', errorText.substring(0, 200));
        console.log('');
        continue;
      }

      const data = await response.json();

      // Check for API-level errors
      if (data.status === 'error') {
        console.log('  ❌ API Error:', data.message);
        if (data.code) {
          console.log('  Error Code:', data.code);
        }
        console.log('');
        continue;
      }

      // Check for rate limit
      if (data.code === 429) {
        console.log('  ❌ Rate Limit Exceeded');
        console.log('  Message:', data.message);
        console.log('');
        continue;
      }

      // Success - validate data structure
      if (data.symbol && data.close) {
        console.log('  ✓ Valid quote received');
        console.log('  Symbol:', data.symbol);
        console.log('  Name:', data.name || 'N/A');
        console.log('  Exchange:', data.exchange || 'N/A');
        console.log('  Currency:', data.currency || 'N/A');
        console.log('  Price (close):', data.close);
        console.log('  Open:', data.open || 'N/A');
        console.log('  High:', data.high || 'N/A');
        console.log('  Low:', data.low || 'N/A');
        console.log('  Volume:', data.volume || 'N/A');
        console.log('  Datetime:', data.datetime || 'N/A');
        console.log('  Market Open:', data.is_market_open || 'N/A');
        console.log('');
        console.log('  ✅ CONNECTION SUCCESSFUL');
        console.log('');
        
        return {
          status: 'PASS',
          symbol: data.symbol,
          price: data.close,
          timestamp: data.datetime,
          exchange: data.exchange,
        };
      } else {
        console.log('  ⚠️  Unexpected response structure');
        console.log('  Response keys:', Object.keys(data).join(', '));
        console.log('');
      }
    } catch (error) {
      console.log('  ❌ Request failed:', error.message);
      console.log('');
      
      if (error.name === 'AbortError') {
        console.log('  Reason: Request timeout (10s)');
      } else if (error.message.includes('fetch')) {
        console.log('  Reason: Network error - check internet connection');
      }
      console.log('');
    }
  }

  return { status: 'FAILED', reason: 'All test symbols failed' };
}

// Run the test
testTwelveDataConnection()
  .then((result) => {
    console.log('='.repeat(70));
    console.log('TEST RESULT:', result.status);
    if (result.reason) {
      console.log('REASON:', result.reason);
    }
    console.log('='.repeat(70));
    
    process.exit(result.status === 'PASS' ? 0 : 1);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
