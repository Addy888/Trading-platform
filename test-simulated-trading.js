/**
 * Comprehensive test for simulated BUY/SELL trading
 * 
 * Tests:
 * 1. Successful BUY order
 * 2. Successful SELL order
 * 3. Insufficient margin scenario
 * 4. Invalid volume (too small)
 * 5. Invalid volume (too large)
 * 6. Close position
 */

const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001/api';
const TEST_EMAIL = 'admin@tradeing.local';
const TEST_PASSWORD = 'Admin@12345';

let accessToken, userId, accountId;
let createdTradeIds = [];

async function authenticate() {
  console.log('\n📝 Step 1: Authenticating...');
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!response.ok) throw new Error(`Login failed: ${response.status}`);

  const data = await response.json();
  accessToken = data.accessToken;
  userId = data.user.id;
  console.log(`✓ Authenticated as: ${data.user.email}`);
}

async function getAccount() {
  console.log('\n📝 Step 2: Getting trading account...');
  const response = await fetch(`${API_BASE}/trading-accounts`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error(`Failed to fetch accounts: ${response.status}`);

  const accounts = await response.json();
  if (!accounts || accounts.length === 0) throw new Error('No accounts found');

  accountId = accounts[0].id;
  console.log(`✓ Account: ${accounts[0].accountNumber} (${accounts[0].executionMode})`);
  console.log(`  Balance: $${accounts[0].currentBalance}, Equity: $${accounts[0].equity}`);
}

async function testBuyOrder() {
  console.log('\n📝 Test 1: BUY Order (0.03 lots)');
  const response = await fetch(
    `${API_BASE}/v2/trading-accounts/${accountId}/trades`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        symbol: 'EURUSD',
        side: 'BUY',
        volume: 0.03,
      }),
    }
  );

  const data = await response.json();
  
  if (!response.ok) {
    console.log(`❌ FAILED: ${data.message || data.error}`);
    return false;
  }

  console.log(`✓ SUCCESS: BUY order placed`);
  console.log(`  Trade ID: ${data.trade.id}`);
  console.log(`  Entry Price: ${data.trade.entryPrice}`);
  console.log(`  Execution Mode: ${data.trade.executionMode}`);
  createdTradeIds.push(data.trade.id);
  return true;
}

async function testSellOrder() {
  console.log('\n📝 Test 2: SELL Order (0.05 lots)');
  const response = await fetch(
    `${API_BASE}/v2/trading-accounts/${accountId}/trades`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        symbol: 'EURUSD',
        side: 'SELL',
        volume: 0.05,
      }),
    }
  );

  const data = await response.json();
  
  if (!response.ok) {
    console.log(`❌ FAILED: ${data.message || data.error}`);
    return false;
  }

  console.log(`✓ SUCCESS: SELL order placed`);
  console.log(`  Trade ID: ${data.trade.id}`);
  console.log(`  Entry Price: ${data.trade.entryPrice}`);
  console.log(`  Execution Mode: ${data.trade.executionMode}`);
  createdTradeIds.push(data.trade.id);
  return true;
}

async function testInvalidVolumeTooSmall() {
  console.log('\n📝 Test 3: Invalid Volume (too small - 0.001 lots)');
  const response = await fetch(
    `${API_BASE}/v2/trading-accounts/${accountId}/trades`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        symbol: 'EURUSD',
        side: 'BUY',
        volume: 0.001,
      }),
    }
  );

  const data = await response.json();
  
  if (response.ok) {
    console.log(`❌ FAILED: Should have rejected small volume`);
    if (data.trade) createdTradeIds.push(data.trade.id);
    return false;
  }

  if (data.error === 'INVALID_VOLUME' || data.message?.includes('volume')) {
    console.log(`✓ SUCCESS: Correctly rejected small volume`);
    console.log(`  Error: ${data.message}`);
    return true;
  }

  console.log(`⚠️  UNEXPECTED: ${data.message || data.error}`);
  return false;
}

async function testInvalidVolumeTooLarge() {
  console.log('\n📝 Test 4: Invalid Volume (too large - 1000 lots)');
  const response = await fetch(
    `${API_BASE}/v2/trading-accounts/${accountId}/trades`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        symbol: 'EURUSD',
        side: 'BUY',
        volume: 1000,
      }),
    }
  );

  const data = await response.json();
  
  if (response.ok) {
    console.log(`❌ FAILED: Should have rejected large volume`);
    if (data.trade) createdTradeIds.push(data.trade.id);
    return false;
  }

  if (data.error === 'INVALID_VOLUME' || data.error === 'INSUFFICIENT_MARGIN' || 
      data.message?.includes('volume') || data.message?.includes('margin')) {
    console.log(`✓ SUCCESS: Correctly rejected (${data.error})`);
    console.log(`  Message: ${data.message}`);
    return true;
  }

  console.log(`⚠️  UNEXPECTED: ${data.message || data.error}`);
  return false;
}

async function testClosePosition() {
  if (createdTradeIds.length === 0) {
    console.log('\n📝 Test 5: SKIPPED (no positions to close)');
    return true;
  }

  const tradeId = createdTradeIds[0];
  console.log(`\n📝 Test 5: Close Position (${tradeId})`);
  
  const response = await fetch(
    `${API_BASE}/v2/trading-accounts/${accountId}/trades/${tradeId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  
  if (!response.ok) {
    console.log(`❌ FAILED: ${data.message || data.error}`);
    return false;
  }

  console.log(`✓ SUCCESS: Position closed`);
  console.log(`  Exit Price: ${data.trade.exitPrice}`);
  console.log(`  Realized P&L: ${data.trade.realizedPnl}`);
  return true;
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE SIMULATED TRADING TESTS');
  console.log('='.repeat(80));

  try {
    await authenticate();
    await getAccount();

    const results = {
      buyOrder: await testBuyOrder(),
      sellOrder: await testSellOrder(),
      invalidSmall: await testInvalidVolumeTooSmall(),
      invalidLarge: await testInvalidVolumeTooLarge(),
      closePosition: await testClosePosition(),
    };

    console.log('\n' + '='.repeat(80));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(80));
    console.log(`BUY Order:              ${results.buyOrder ? '✓ PASS' : '❌ FAIL'}`);
    console.log(`SELL Order:             ${results.sellOrder ? '✓ PASS' : '❌ FAIL'}`);
    console.log(`Invalid Volume (small): ${results.invalidSmall ? '✓ PASS' : '❌ FAIL'}`);
    console.log(`Invalid Volume (large): ${results.invalidLarge ? '✓ PASS' : '❌ FAIL'}`);
    console.log(`Close Position:         ${results.closePosition ? '✓ PASS' : '❌ FAIL'}`);

    const passed = Object.values(results).filter(r => r).length;
    const total = Object.values(results).length;

    console.log('\n' + '='.repeat(80));
    console.log(`OVERALL: ${passed}/${total} tests passed`);
    console.log('='.repeat(80));

    process.exit(passed === total ? 0 : 1);

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('FATAL ERROR');
    console.error('='.repeat(80));
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
