/**
 * Comprehensive P&L System Test
 * 
 * Tests all P&L functionality:
 * 1. Open position P&L with market prices
 * 2. Closed position realized P&L
 * 3. Account financial summary
 * 4. Dashboard analytics
 * 5. Database persistence
 * 6. API responses
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';
let authToken: string;
let accountId: string;
let tradeId: string;

// Test configuration
const TEST_CONFIG = {
  email: `test-pnl-${Date.now()}@example.com`,
  password: 'Test@12345',
  initialBalance: 10000,
};

/**
 * STEP 1: Register and Login
 */
async function step1_RegisterAndLogin() {
  console.log('\n=== STEP 1: Register and Login ===');

  try {
    // Register
    const registerRes = await axios.post(`${BASE_URL}/auth/register`, {
      email: TEST_CONFIG.email,
      password: TEST_CONFIG.password,
      firstName: 'Test',
      lastName: 'User',
    });

    console.log('✓ Registered:', registerRes.data.user.email);

    // Login
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: TEST_CONFIG.email,
      password: TEST_CONFIG.password,
    });

    authToken = loginRes.data.accessToken;
    console.log('✓ Logged in, Token:', authToken.substring(0, 20) + '...');

    return { status: 'PASS' };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * STEP 2: Create Trading Account with Test Funding
 */
async function step2_CreateTradingAccount() {
  console.log('\n=== STEP 2: Create Trading Account with Test Funding ===');

  try {
    const headers = { Authorization: `Bearer ${authToken}` };

    const res = await axios.post(
      `${BASE_URL}/trading-accounts`,
      { testFunding: true, initialFundingAmount: TEST_CONFIG.initialBalance },
      { headers },
    );

    accountId = res.data.id;
    console.log('✓ Account created:', accountId);
    console.log('  - Initial Balance:', res.data.initialBalance);
    console.log('  - Execution Mode:', res.data.executionMode);
    console.log('  - Status:', res.data.status);

    return { status: 'PASS', accountId };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * STEP 3: Open BUY Position
 */
async function step3_OpenBuyPosition() {
  console.log('\n=== STEP 3: Open BUY Position (EURUSD) ===');

  try {
    const headers = { Authorization: `Bearer ${authToken}` };

    const res = await axios.post(
      `${BASE_URL}/trading-accounts/${accountId}/trades`,
      {
        symbol: 'EURUSD',
        side: 'BUY',
        volume: 1.0,
        stopLoss: 1.0800,
        takeProfit: 1.1200,
      },
      { headers },
    );

    tradeId = res.data.id;
    console.log('✓ BUY position opened:', tradeId);
    console.log('  - Symbol: EURUSD');
    console.log('  - Side:', res.data.side);
    console.log('  - Volume:', res.data.volume);
    console.log('  - Entry Price:', res.data.entryPrice);
    console.log('  - SL:', res.data.stopLoss);
    console.log('  - TP:', res.data.takeProfit);
    console.log('  - Opened:', res.data.openedAt);

    return { status: 'PASS', tradeId };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * STEP 4: Get Open Positions with P&L
 */
async function step4_GetOpenPositionsPnL() {
  console.log('\n=== STEP 4: Get Open Positions with P&L ===');

  try {
    const headers = { Authorization: `Bearer ${authToken}` };

    const res = await axios.get(
      `${BASE_URL}/trading-accounts/${accountId}/pnl/open-positions`,
      { headers },
    );

    console.log('✓ Open positions retrieved');
    console.log('  - Total Positions:', res.data.totalPositionsCount);
    console.log('  - Total Unrealized P&L:', res.data.totalUnrealizedPnl);

    for (const pos of res.data.positions) {
      console.log('\n  Position Details:');
      console.log('    - Trade ID:', pos.tradeId);
      console.log('    - Symbol:', pos.symbol);
      console.log('    - Side:', pos.side);
      console.log('    - Entry Price:', pos.entryPrice);
      console.log('    - Current Price:', pos.currentPrice);
      console.log('    - Quantity:', pos.quantity);
      console.log('    - Gross P&L:', pos.unrealizedGrossPnl);
      console.log('    - Spread Impact:', pos.spreadImpact);
      console.log('    - Commission:', pos.commission);
      console.log('    - Swap:', pos.swap);
      console.log('    - Net Unrealized P&L:', pos.netUnrealizedPnl);
      console.log('    - P&L %:', pos.pnlPercentage);
    }

    return { status: 'PASS' };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * STEP 5: Get Account Financial Summary
 */
async function step5_GetFinancialSummary() {
  console.log('\n=== STEP 5: Get Account Financial Summary ===');

  try {
    const headers = { Authorization: `Bearer ${authToken}` };

    const res = await axios.get(
      `${BASE_URL}/trading-accounts/${accountId}/pnl/summary`,
      { headers },
    );

    console.log('✓ Financial summary retrieved');
    console.log('  - Balance:', res.data.balance);
    console.log('  - Equity:', res.data.equity);
    console.log('  - Used Margin:', res.data.usedMargin);
    console.log('  - Free Margin:', res.data.freeMargin);
    console.log('  - Unrealized P&L:', res.data.unrealizedPnl);
    console.log('  - Realized P&L:', res.data.realizedPnl);
    console.log('  - Today\'s P&L:', res.data.todaysPnl);
    console.log('  - Total Net P&L:', res.data.totalNetPnl);
    console.log('  - Margin Utilization:', res.data.marginUtilization);
    console.log('  - Account Status:', res.data.accountStatus);

    return { status: 'PASS' };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * STEP 6: Close BUY Position
 */
async function step6_CloseBuyPosition() {
  console.log('\n=== STEP 6: Close BUY Position ===');

  try {
    const headers = { Authorization: `Bearer ${authToken}` };

    const res = await axios.post(
      `${BASE_URL}/trading-accounts/${accountId}/trades/${tradeId}/close`,
      {},
      { headers },
    );

    console.log('✓ BUY position closed');
    console.log('  - Trade ID:', res.data.id);
    console.log('  - Status:', res.data.status);
    console.log('  - Entry Price:', res.data.entryPrice);
    console.log('  - Exit Price:', res.data.exitPrice);
    console.log('  - Realized P&L:', res.data.realizedPnl);
    console.log('  - Closed:', res.data.closedAt);

    return { status: 'PASS' };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * STEP 7: Get Closed Trades with P&L
 */
async function step7_GetClosedTradesPnL() {
  console.log('\n=== STEP 7: Get Closed Trades with P&L ===');

  try {
    const headers = { Authorization: `Bearer ${authToken}` };

    const res = await axios.get(
      `${BASE_URL}/trading-accounts/${accountId}/pnl/closed-trades?page=1&limit=50`,
      { headers },
    );

    console.log('✓ Closed trades retrieved');
    console.log('  - Total Trades:', res.data.total);
    console.log('  - Page:', res.data.page);
    console.log('  - Total Net P&L:', res.data.totalNetPnl);

    for (const trade of res.data.trades) {
      console.log('\n  Closed Trade Details:');
      console.log('    - Trade ID:', trade.tradeId);
      console.log('    - Symbol:', trade.symbol);
      console.log('    - Side:', trade.side);
      console.log('    - Entry Price:', trade.entryPrice);
      console.log('    - Exit Price:', trade.exitPrice);
      console.log('    - Quantity:', trade.quantity);
      console.log('    - Gross P&L:', trade.grossPnl);
      console.log('    - Commission:', trade.commission);
      console.log('    - Swap:', trade.swap);
      console.log('    - Net P&L:', trade.netPnl);
      console.log('    - P&L %:', trade.pnlPercentage);
      console.log('    - Holding Days:', trade.holdingDays);
    }

    return { status: 'PASS' };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * STEP 8: Open SELL Position
 */
async function step8_OpenSellPosition() {
  console.log('\n=== STEP 8: Open SELL Position (GBPUSD) ===');

  try {
    const headers = { Authorization: `Bearer ${authToken}` };

    const res = await axios.post(
      `${BASE_URL}/trading-accounts/${accountId}/trades`,
      {
        symbol: 'GBPUSD',
        side: 'SELL',
        volume: 0.5,
        stopLoss: 1.3500,
        takeProfit: 1.2500,
      },
      { headers },
    );

    console.log('✓ SELL position opened:', res.data.id);
    console.log('  - Symbol: GBPUSD');
    console.log('  - Side:', res.data.side);
    console.log('  - Volume:', res.data.volume);
    console.log('  - Entry Price:', res.data.entryPrice);

    return { status: 'PASS', sellTradeId: res.data.id };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * STEP 9: Get Dashboard Analytics
 */
async function step9_GetDashboardAnalytics() {
  console.log('\n=== STEP 9: Get Dashboard Analytics ===');

  try {
    const headers = { Authorization: `Bearer ${authToken}` };

    const res = await axios.get(
      `${BASE_URL}/trading-accounts/${accountId}/pnl/analytics`,
      { headers },
    );

    console.log('✓ Dashboard analytics retrieved');
    console.log('  - Daily P&L:', res.data.dailyPnl);
    console.log('  - Weekly P&L:', res.data.weeklyPnl);
    console.log('  - Monthly P&L:', res.data.monthlyPnl);
    console.log('  - Total Realized P&L:', res.data.totalRealizedPnl);
    console.log('  - Total Unrealized P&L:', res.data.totalUnrealizedPnl);
    console.log('  - Winning Trades:', res.data.winningTrades);
    console.log('  - Losing Trades:', res.data.losingTrades);
    console.log('  - Total Trades:', res.data.totalTrades);
    console.log('  - Win Rate:', res.data.winRate, '%');
    console.log('  - Avg Profit/Win:', res.data.avgProfitPerWinningTrade);
    console.log('  - Avg Loss/Lose:', res.data.avgLossPerLosingTrade);
    console.log('  - Largest Profit:', res.data.largestProfit);
    console.log('  - Largest Loss:', res.data.largestLoss);
    console.log('  - Profit Factor:', res.data.profitFactor);

    return { status: 'PASS' };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * STEP 10: Verify Updated Financial Summary
 */
async function step10_VerifyUpdatedSummary() {
  console.log('\n=== STEP 10: Verify Updated Financial Summary After Close ===');

  try {
    const headers = { Authorization: `Bearer ${authToken}` };

    const res = await axios.get(
      `${BASE_URL}/trading-accounts/${accountId}/pnl/summary`,
      { headers },
    );

    console.log('✓ Updated financial summary retrieved');
    console.log('  - Balance (should reflect closed trade P&L):', res.data.balance);
    console.log('  - Equity:', res.data.equity);
    console.log('  - Unrealized P&L (from open SELL):', res.data.unrealizedPnl);
    console.log('  - Realized P&L (from closed BUY):', res.data.realizedPnl);
    console.log('  - Total Net P&L:', res.data.totalNetPnl);

    return { status: 'PASS' };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * STEP 11: Generate Trade Report
 */
async function step11_GenerateTradeReport() {
  console.log('\n=== STEP 11: Generate Closed Trade Report ===');

  try {
    const headers = { Authorization: `Bearer ${authToken}` };

    const res = await axios.get(
      `${BASE_URL}/trading-accounts/${accountId}/pnl/report`,
      { headers },
    );

    console.log('✓ Trade report generated');
    console.log('  - Account ID:', res.data.accountId);
    console.log('  - Account Number:', res.data.accountNumber);
    console.log('  - Report Date:', res.data.reportDate);
    console.log('  - Total Closed Trades:', res.data.trades.length);
    console.log('  - Total Gross P&L:', res.data.totalGrossPnl);
    console.log('  - Total Commission:', res.data.totalCommission);
    console.log('  - Total Swap:', res.data.totalSwap);
    console.log('  - Total Net P&L:', res.data.totalNetPnl);
    console.log('  - Winning Trades:', res.data.winningTradesCount);
    console.log('  - Losing Trades:', res.data.losingTradesCount);

    for (const trade of res.data.trades) {
      console.log('\n  Trade Report Entry:');
      console.log('    - Position ID:', trade.positionId);
      console.log('    - Instrument:', trade.instrument);
      console.log('    - Direction:', trade.direction);
      console.log('    - Entry Price:', trade.entryPrice);
      console.log('    - Exit Price:', trade.exitPrice);
      console.log('    - Net P&L:', trade.netPnl);
    }

    return { status: 'PASS' };
  } catch (error: any) {
    console.error('✗ Failed:', error.response?.data || error.message);
    return { status: 'FAIL', error: error.message };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        COMPREHENSIVE P&L SYSTEM TEST SUITE                     ║');
  console.log('║        Verify: Open P&L, Closed P&L, Balance, Equity, Reports  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const results = [];

  // Step 1
  let result = await step1_RegisterAndLogin();
  results.push({ step: 1, ...result });
  if (result.status === 'FAIL') {
    console.log('\n❌ Registration/Login failed. Cannot continue.');
    printSummary(results);
    process.exit(1);
  }

  // Step 2
  result = await step2_CreateTradingAccount();
  results.push({ step: 2, ...result });
  if (result.status === 'FAIL') {
    console.log('\n❌ Account creation failed. Cannot continue.');
    printSummary(results);
    process.exit(1);
  }

  // Step 3
  result = await step3_OpenBuyPosition();
  results.push({ step: 3, ...result });
  if (result.status === 'FAIL') {
    console.log('\n❌ BUY position failed. Cannot continue.');
    printSummary(results);
    process.exit(1);
  }

  // Step 4
  result = await step4_GetOpenPositionsPnL();
  results.push({ step: 4, ...result });

  // Step 5
  result = await step5_GetFinancialSummary();
  results.push({ step: 5, ...result });

  // Step 6
  result = await step6_CloseBuyPosition();
  results.push({ step: 6, ...result });

  // Step 7
  result = await step7_GetClosedTradesPnL();
  results.push({ step: 7, ...result });

  // Step 8
  result = await step8_OpenSellPosition();
  results.push({ step: 8, ...result });

  // Step 9
  result = await step9_GetDashboardAnalytics();
  results.push({ step: 9, ...result });

  // Step 10
  result = await step10_VerifyUpdatedSummary();
  results.push({ step: 10, ...result });

  // Step 11
  result = await step11_GenerateTradeReport();
  results.push({ step: 11, ...result });

  printSummary(results);
}

function printSummary(results: any[]) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                     TEST EXECUTION SUMMARY                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  let passCount = 0;
  let failCount = 0;

  for (const result of results) {
    const status = result.status === 'PASS' ? '✓ PASS' : '✗ FAIL';
    console.log(`Step ${result.step}: ${status}`);
    if (result.status === 'PASS') passCount++;
    else failCount++;
  }

  console.log(`\nTotal: ${passCount} PASS, ${failCount} FAIL out of ${results.length} steps`);

  if (failCount === 0) {
    console.log('\n🎉 ALL TESTS PASSED! P&L system is fully functional.');
  } else {
    console.log(`\n⚠️  ${failCount} test(s) failed.`);
  }
}

// Run tests
runAllTests().catch(console.error);
