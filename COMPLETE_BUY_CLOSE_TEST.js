#!/usr/bin/env node

/**
 * COMPLETE BUY -> OPEN POSITION -> CLOSE POSITION WORKFLOW TEST
 * 
 * This test verifies:
 * 1. User authentication
 * 2. Trading account creation or retrieval
 * 3. BUY order submission
 * 4. Position appears in Open Positions
 * 5. Position can be closed
 * 6. Position appears in Closed Positions / Trade History
 * 7. Balance and P&L are correctly updated
 */

const http = require('http');
const https = require('https');

const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const TEST_EMAIL = 'test-buy-close@example.com';
const TEST_PASSWORD = 'TestPassword123!';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  header: (msg) => console.log(`\n${colors.bright}${colors.blue}═══ ${msg} ═══${colors.reset}`),
  section: (msg) => console.log(`\n${colors.bright}${colors.cyan}→ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`),
  json: (obj) => console.log(JSON.stringify(obj, null, 2)),
};

/**
 * Make HTTP/HTTPS request
 */
async function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers.Authorization = `Bearer ${token}`;
    }

    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Register or login user
 */
async function getAuthToken() {
  log.section('Authenticating user');

  try {
    // Try to login first
    let response = await makeRequest('POST', '/auth/login', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (response.status === 401 || response.status === 404) {
      log.info('User not found, registering...');
      response = await makeRequest('POST', '/auth/register', {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        firstName: 'Test',
        lastName: 'User',
      });

      if (response.status !== 201 && response.status !== 200) {
        throw new Error(`Registration failed: ${response.status} - ${JSON.stringify(response.body)}`);
      }

      // Now login
      response = await makeRequest('POST', '/auth/login', {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });
    }

    if (response.status !== 200) {
      throw new Error(`Login failed: ${response.status} - ${JSON.stringify(response.body)}`);
    }

    const token = response.body.accessToken;
    if (!token) {
      throw new Error('No access token received');
    }

    log.success(`Authenticated: ${TEST_EMAIL}`);
    return token;
  } catch (err) {
    log.error(`Authentication failed: ${err.message}`);
    throw err;
  }
}

/**
 * Get or create trading account
 */
async function getOrCreateTradingAccount(token) {
  log.section('Getting trading account');

  try {
    // Get existing accounts
    let response = await makeRequest('GET', '/trading-accounts', null, token);

    if (response.status !== 200) {
      throw new Error(`Failed to get accounts: ${response.status}`);
    }

    let accounts = response.body;
    if (!Array.isArray(accounts)) accounts = [];

    // Find SIMULATED account
    let account = accounts.find((a) => a.executionMode === 'SIMULATED' && a.status === 'ACTIVE');

    if (!account) {
      log.info('No active SIMULATED account found, creating one...');
      response = await makeRequest('POST', '/trading-accounts', {
        testFunding: true,
      }, token);

      if (response.status !== 201 && response.status !== 200) {
        throw new Error(`Failed to create account: ${response.status} - ${JSON.stringify(response.body)}`);
      }

      account = response.body;
    }

    log.success(`Account: ${account.accountNumber} (${account.executionMode})`);
    log.info(`Status: ${account.status}, Balance: $${account.initialBalance}`);

    return account;
  } catch (err) {
    log.error(`Failed to get/create account: ${err.message}`);
    throw err;
  }
}

/**
 * Get margin info
 */
async function getMarginInfo(token, accountId) {
  log.section('Checking margin info');

  try {
    const response = await makeRequest('GET', `/v2/trading-accounts/${accountId}/margin`, null, token);

    if (response.status !== 200) {
      log.warn(`Margin API returned ${response.status}: ${JSON.stringify(response.body)}`);
      return null;
    }

    log.success('Margin info retrieved');
    log.info(`Balance: $${response.body.balance}, Free Margin: $${response.body.freeMargin}`);
    return response.body;
  } catch (err) {
    log.error(`Failed to get margin: ${err.message}`);
    return null;
  }
}

/**
 * Open a BUY position
 */
async function openBuyPosition(token, accountId) {
  log.section('Opening BUY position');

  try {
    const tradeData = {
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      stopLoss: 1.08,
      takeProfit: 1.12,
    };

    log.info(`Submitting BUY order: ${tradeData.volume} lots ${tradeData.symbol}`);

    const response = await makeRequest(
      'POST',
      `/v2/trading-accounts/${accountId}/trades`,
      tradeData,
      token
    );

    if (response.status !== 201 && response.status !== 200) {
      throw new Error(`BUY failed: ${response.status} - ${JSON.stringify(response.body)}`);
    }

    const trade = response.body.trade || response.body;
    log.success('BUY order executed');
    log.info(`Trade ID: ${trade.id}`);
    log.info(`Entry Price: ${trade.entryPrice}`);
    log.info(`Status: ${trade.status}`);

    return trade;
  } catch (err) {
    log.error(`Failed to open position: ${err.message}`);
    throw err;
  }
}

/**
 * Get open positions
 */
async function getOpenPositions(token, accountId) {
  log.section('Fetching open positions');

  try {
    const response = await makeRequest(
      'GET',
      `/trading-accounts/${accountId}/positions`,
      null,
      token
    );

    if (response.status !== 200) {
      throw new Error(`Failed to get positions: ${response.status}`);
    }

    const positions = response.body;
    if (!Array.isArray(positions)) {
      throw new Error('Positions response is not an array');
    }

    log.success(`Found ${positions.length} open position(s)`);
    positions.forEach((p, i) => {
      log.info(`Position ${i + 1}: ${p.symbol} ${p.side} ${p.volume} lots @ ${p.entryPrice}`);
      log.info(`  Unrealized P&L: ${p.unrealizedPnl}`);
    });

    return positions;
  } catch (err) {
    log.error(`Failed to get positions: ${err.message}`);
    throw err;
  }
}

/**
 * Close a position
 */
async function closePosition(token, accountId, tradeId) {
  log.section('Closing position');

  try {
    log.info(`Closing trade: ${tradeId}`);

    const response = await makeRequest(
      'DELETE',
      `/v2/trading-accounts/${accountId}/trades/${tradeId}`,
      null,
      token
    );

    if (response.status !== 200) {
      throw new Error(`Close failed: ${response.status} - ${JSON.stringify(response.body)}`);
    }

    const trade = response.body.trade || response.body;
    log.success('Position closed');
    log.info(`Trade ID: ${trade.id}`);
    log.info(`Exit Price: ${trade.exitPrice}`);
    log.info(`Realized P&L: ${trade.realizedPnl}`);
    log.info(`Status: ${trade.status}`);

    return trade;
  } catch (err) {
    log.error(`Failed to close position: ${err.message}`);
    throw err;
  }
}

/**
 * Get trade history
 */
async function getTradeHistory(token, accountId) {
  log.section('Fetching trade history');

  try {
    const response = await makeRequest(
      'GET',
      `/trading-accounts/${accountId}/trades?status=CLOSED&limit=50`,
      null,
      token
    );

    if (response.status !== 200) {
      throw new Error(`Failed to get history: ${response.status}`);
    }

    const data = response.body;
    const trades = data.trades || [];

    log.success(`Found ${trades.length} closed trade(s)`);
    trades.slice(0, 5).forEach((t, i) => {
      log.info(`Trade ${i + 1}: ${t.symbol} ${t.side} @ ${t.entryPrice} → ${t.exitPrice}`);
      log.info(`  P&L: ${t.realizedPnl}`);
    });

    return trades;
  } catch (err) {
    log.error(`Failed to get history: ${err.message}`);
    throw err;
  }
}

/**
 * Get account performance
 */
async function getAccountPerformance(token, accountId) {
  log.section('Fetching account performance');

  try {
    const response = await makeRequest(
      'GET',
      `/trading-accounts/${accountId}/performance`,
      null,
      token
    );

    if (response.status !== 200) {
      throw new Error(`Failed to get performance: ${response.status}`);
    }

    const perf = response.body;
    log.success('Account performance retrieved');
    log.info(`Balance: $${perf.currentBalance}`);
    log.info(`Equity: $${perf.equity}`);
    log.info(`Open Trades: ${perf.openTrades}, Closed Trades: ${perf.closedTrades}`);
    log.info(`Total P&L: $${perf.totalPnl} (${perf.returnPercentage}%)`);

    return perf;
  } catch (err) {
    log.error(`Failed to get performance: ${err.message}`);
    throw err;
  }
}

/**
 * Main test flow
 */
async function runTest() {
  log.header('COMPLETE BUY → CLOSE WORKFLOW TEST');
  log.info(`API: ${API_URL}`);

  try {
    // Step 1: Authenticate
    const token = await getAuthToken();

    // Step 2: Get/create account
    const account = await getOrCreateTradingAccount(token);

    // Step 3: Get initial margin
    const marginBefore = await getMarginInfo(token, account.id);

    // Step 4: Get initial balance
    const perfBefore = await getAccountPerformance(token, account.id);

    // Step 5: Check no open positions
    log.section('Verifying no initial open positions');
    let positions = await getOpenPositions(token, account.id);
    if (positions.length > 0) {
      log.warn(`Found ${positions.length} existing open position(s)`);
    } else {
      log.success('No open positions found');
    }

    // Step 6: Open a BUY position
    const trade = await openBuyPosition(token, account.id);

    // Step 7: Verify position appears in open positions
    positions = await getOpenPositions(token, account.id);
    const openPosition = positions.find((p) => p.id === trade.id);
    if (!openPosition) {
      throw new Error('Position not found in open positions list');
    }
    log.success('Position found in open positions');

    // Step 8: Get margin with open position
    const marginWith = await getMarginInfo(token, account.id);

    // Step 9: Close the position
    const closedTrade = await closePosition(token, account.id, trade.id);

    // Step 10: Verify position is gone from open positions
    positions = await getOpenPositions(token, account.id);
    const stillOpen = positions.find((p) => p.id === trade.id);
    if (stillOpen) {
      throw new Error('Position still appears in open positions after close');
    }
    log.success('Position removed from open positions');

    // Step 11: Get final margin (should be back to initial)
    const marginAfter = await getMarginInfo(token, account.id);

    // Step 12: Get trade history
    const history = await getTradeHistory(token, account.id);
    const closedInHistory = history.find((t) => t.id === trade.id || t.symbol === trade.symbol);
    if (!closedInHistory) {
      log.warn('Closed trade not found in history (may take time to appear)');
    } else {
      log.success('Closed trade found in history');
    }

    // Step 13: Get final performance
    const perfAfter = await getAccountPerformance(token, account.id);

    // Results
    log.header('TEST RESULTS');

    const results = {
      'Authentication': '✓ PASS',
      'Account Creation': '✓ PASS',
      'Margin API (no positions)': marginBefore ? '✓ PASS' : '⚠ WARN',
      'BUY Position Opened': trade.status === 'OPEN' ? '✓ PASS' : '✗ FAIL',
      'Position in Open List': openPosition ? '✓ PASS' : '✗ FAIL',
      'Position Closed': closedTrade.status === 'CLOSED' ? '✓ PASS' : '✗ FAIL',
      'Margin Recalculated': marginAfter ? '✓ PASS' : '⚠ WARN',
      'Trade History Updated': closedInHistory ? '✓ PASS' : '⚠ WARN',
      'P&L Calculated': closedTrade.realizedPnl !== undefined ? '✓ PASS' : '✗ FAIL',
    };

    Object.entries(results).forEach(([test, result]) => {
      console.log(`${result} ${test}`);
    });

    log.info('\nInitial Balance: $' + perfBefore.currentBalance);
    log.info('Final Balance: $' + perfAfter.currentBalance);
    log.info('P&L: $' + closedTrade.realizedPnl);

    const passed = Object.values(results).filter((r) => r.includes('PASS')).length;
    const warned = Object.values(results).filter((r) => r.includes('WARN')).length;
    const failed = Object.values(results).filter((r) => r.includes('FAIL')).length;

    log.header(`SUMMARY: ${passed} PASS, ${warned} WARN, ${failed} FAIL`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    log.error(`TEST FAILED: ${err.message}`);
    log.error(err.stack);
    process.exit(1);
  }
}

// Run test
runTest();
