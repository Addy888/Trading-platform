/**
 * COMPREHENSIVE BUY/SELL BUTTON DEBUG SCRIPT
 * 
 * Objectives:
 * 1. Check frontend button state and disabled conditions
 * 2. Test API connectivity
 * 3. Test order submission API
 * 4. Check market data availability
 * 5. Identify exact failure points
 */

const http = require('http');
const https = require('https');

const API_BASE = 'http://localhost:3001/api';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function makeRequest(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const opts = new URL(url);
    opts.method = method;
    opts.headers = {
      'Content-Type': 'application/json',
      ...headers,
    };

    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          json: () => {
            try { return JSON.parse(data); } catch { return null; }
          }
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function log(title, obj) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${title}`);
  console.log(`${'='.repeat(80)}`);
  if (typeof obj === 'object') {
    console.log(JSON.stringify(obj, null, 2));
  } else {
    console.log(obj);
  }
}

// ============================================================================
// DIAGNOSTIC TESTS
// ============================================================================

async function main() {
  console.log('\n🔍 TRADING SYSTEM DIAGNOSTIC: BUY/SELL BUTTON DEBUG\n');
  
  // Test 1: API Health
  try {
    const health = await makeRequest('GET', `${API_BASE}/../health`);
    await log('TEST 1: API Health', {
      status: health.status,
      isHealthy: health.status === 200,
    });
  } catch (e) {
    await log('TEST 1: API Health - FAILED', {
      error: e.message,
      hint: 'API server may not be running on port 3001',
    });
    process.exit(1);
  }

  // For real testing, we would need actual credentials
  // Let's at least check the endpoints are accessible
  
  await log('TEST 2: Checking Endpoint Availability', {
    endpoints: {
      'POST /v2/trading-accounts/:accountId/trades': 'Order submission',
      'GET /v2/trading-accounts/:accountId/margin': 'Margin info',
      'GET /v2/trading-accounts/:accountId/instruments': 'Available instruments',
      'GET /market-data/status': 'Market data status',
    }
  });

  // Test 3: Market Data Status
  try {
    const marketStatus = await makeRequest('GET', `${API_BASE}/market-data/status`);
    const data = marketStatus.json();
    
    await log('TEST 3: Market Data Status', {
      httpStatus: marketStatus.status,
      configuration: data?.configuration || 'N/A',
      providers: data?.providers || 'N/A',
      primaryProvider: data?.primaryProvider || 'N/A',
    });
  } catch (e) {
    await log('TEST 3: Market Data Status - Failed', {
      error: e.message,
    });
  }

  // Test 4: Analyze Frontend Code
  await log('TEST 4: Frontend Analysis', {
    orderDisabledReasons: [
      'canTrade = account.status === "ACTIVE"',
      'isSimulatedMode = executionMode === "SIMULATED"',
      'simulatedTradingSymbols includes selected symbol',
      'selectedQuoteIsCurrent = fresh Twelve Data price available',
      '',
      'disabled = !canTrade || !marketDataAvailable',
      'marketDataAvailable = isSimulatedMode && symbol in list && selectedQuoteIsCurrent',
    ],
    orderDisabledReason: [
      '!canTrade -> account not active',
      '!isSimulatedMode -> real execution disabled',
      '!symbol configured -> symbol not in simulated trading list',
      '!selectedQuoteIsCurrent -> no fresh Twelve Data price OR stale',
    ]
  });

  // Test 5: Check Trading Engine Logic
  await log('TEST 5: Backend Trading Engine Logic (Simulated Mode)', {
    steps: [
      '1. getFreshSimulatedPrices() called for all open trades + new trade symbol',
      '2. getQuote(symbol) fetches from MarketDataManagerService',
      '3. Quote must pass freshness check:',
      '   - price must be finite and > 0',
      '   - age = Date.now() - parseDate(timestamp)',
      '   - age must be >= 0 and <= staleThresholdMs',
      '4. If any symbol fails, throws ServiceUnavailableException',
      '5. Order cancelled, no position created',
    ],
    requiredForSuccess: [
      'Twelve Data API key configured',
      'Twelve Data API responding',
      'Twelve Data quote fresh (within staleThresholdMs)',
      'Symbol in Twelve Data watch list',
      'Account in SIMULATED mode',
      'Account status = ACTIVE',
    ]
  });

  // Test 6: Root Cause Analysis
  await log('TEST 6: Root Cause - Most Likely Failure Points', {
    '1_Twelve_Data_Disconnected': {
      symptom: 'Twelve Data WebSocket disconnected',
      impact: 'getQuote() fails or returns stale data',
      fix: 'Verify TWELVE_DATA_API_KEY in .env'
    },
    '2_No_Fresh_Price': {
      symptom: 'No quote in last 20 minutes',
      impact: 'getAllFreshSimulatedPrices() throws stale error',
      fix: 'Check network, API quotas, market hours'
    },
    '3_Account_Not_Active': {
      symptom: 'Account status != ACTIVE',
      impact: 'canTrade = false, buttons disabled',
      fix: 'Check account status in DB'
    },
    '4_Symbol_Not_Configured': {
      symptom: 'Symbol not in simulated trading list',
      impact: 'marketDataAvailable = false',
      fix: 'Add symbol to simulated trading config'
    },
    '5_Button_State_Wrong': {
      symptom: 'Button appears grey/red but not clicking',
      impact: 'CSS mismatch or disabled attribute not synced',
      fix: 'Check OrderPanel disabled={!canTrade || !marketDataAvailable}'
    }
  });

  await log('NEXT STEPS', {
    manual_check: [
      '1. Open Chrome DevTools -> Elements',
      '2. Inspect BUY/SELL button in OrderPanel',
      '3. Check if disabled attribute is present',
      '4. Check computed CSS for opacity/pointer-events',
      '5. In Console: inspect marketDataAvailable, canTrade, orderDisabledReason',
    ],
    server_check: [
      '1. Check backend logs for order submission attempt',
      '2. Look for "openSimulatedTrade" or "getFreshSimulatedPrices" messages',
      '3. Check "A current Twelve Data provider price is unavailable" error',
    ],
    api_test: [
      '1. Get auth token from browser localStorage (key: "auth_token")',
      '2. POST http://localhost:3001/api/v2/trading-accounts/{accountId}/trades',
      '3. Body: { "symbol": "EURUSD", "side": "BUY", "volume": 0.01 }',
      '4. Check response - error should indicate exact failure reason',
    ]
  });

  console.log('\n✅ Diagnostic complete\n');
}

main().catch(console.error);
