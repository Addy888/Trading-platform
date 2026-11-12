/**
 * Test script to reproduce BUY/SELL order failure
 * 
 * This script will:
 * 1. Authenticate and get a token
 * 2. Find a test trading account
 * 3. Attempt a simulated BUY order with EURUSD, volume 0.03
 * 4. Capture the complete error response
 */

const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001/api';

// Test credentials (from TEST_ACCOUNTS.md)
const TEST_EMAIL = 'admin@tradeing.local';
const TEST_PASSWORD = 'Admin@12345';

async function testTrade() {
  try {
    console.log('='.repeat(80));
    console.log('TESTING SIMULATED TRADE ORDER');
    console.log('='.repeat(80));
    console.log('');

    // Step 1: Login
    console.log('Step 1: Authenticating...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!loginResponse.ok) {
      const error = await loginResponse.text();
      throw new Error(`Login failed: ${loginResponse.status} - ${error}`);
    }

    const loginData = await loginResponse.json();
    const accessToken = loginData.accessToken;
    const userId = loginData.user.id;
    console.log(`✓ Authenticated as: ${loginData.user.email} (ID: ${userId})`);
    console.log('');

    // Step 2: Get trading accounts
    console.log('Step 2: Fetching trading accounts...');
    const accountsResponse = await fetch(`${API_BASE}/trading-accounts`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!accountsResponse.ok) {
      const error = await accountsResponse.text();
      throw new Error(`Failed to fetch accounts: ${accountsResponse.status} - ${error}`);
    }

    const accountsData = await accountsResponse.json();
    if (!accountsData || accountsData.length === 0) {
      throw new Error('No trading accounts found');
    }

    const account = accountsData[0];
    console.log(`✓ Found account: ${account.accountNumber}`);
    console.log(`  - Status: ${account.status}`);
    console.log(`  - Balance: $${account.currentBalance}`);
    console.log(`  - Equity: $${account.equity}`);
    console.log(`  - Execution Mode: ${account.executionMode || 'NOT SET'}`);
    console.log('');

    // Step 3: Prepare trade request
    console.log('Step 3: Preparing BUY order...');
    const tradeRequest = {
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.03,
      // Not including stopLoss or takeProfit initially
    };
    console.log('Trade request:', JSON.stringify(tradeRequest, null, 2));
    console.log('');

    // Step 4: Submit BUY order
    console.log('Step 4: Submitting BUY order to V2 endpoint...');
    const tradeResponse = await fetch(
      `${API_BASE}/v2/trading-accounts/${account.id}/trades`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(tradeRequest),
      }
    );

    console.log(`Response status: ${tradeResponse.status}`);
    console.log(`Response status text: ${tradeResponse.statusText}`);
    console.log('');

    // Get response body
    const responseText = await tradeResponse.text();
    console.log('Response body (raw):');
    console.log(responseText);
    console.log('');

    // Try to parse as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log('Response body (parsed):');
      console.log(JSON.stringify(responseData, null, 2));
    } catch (parseError) {
      console.error('Failed to parse response as JSON');
    }

    if (!tradeResponse.ok) {
      console.log('');
      console.log('='.repeat(80));
      console.log('ERROR CAPTURED');
      console.log('='.repeat(80));
      console.log(`Status: ${tradeResponse.status}`);
      console.log(`Status Text: ${tradeResponse.statusText}`);
      console.log('Response:', responseData || responseText);
      console.log('');
      
      // Test SELL order as well
      console.log('Attempting SELL order to compare...');
      const sellRequest = { ...tradeRequest, side: 'SELL' };
      const sellResponse = await fetch(
        `${API_BASE}/v2/trading-accounts/${account.id}/trades`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(sellRequest),
        }
      );
      
      const sellText = await sellResponse.text();
      console.log(`SELL Response status: ${sellResponse.status}`);
      console.log(`SELL Response body: ${sellText}`);
      
    } else {
      console.log('');
      console.log('='.repeat(80));
      console.log('SUCCESS');
      console.log('='.repeat(80));
      console.log('Trade opened successfully');
      console.log('Trade data:', responseData);
    }

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('EXCEPTION OCCURRED');
    console.error('='.repeat(80));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Check if node-fetch is available
try {
  require('node-fetch');
  testTrade();
} catch (requireError) {
  console.error('node-fetch is not installed. Please install it first:');
  console.error('npm install node-fetch@2');
  process.exit(1);
}
