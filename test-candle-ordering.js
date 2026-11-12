/**
 * Test script to reproduce and fix the candle ordering issue
 * 
 * Error: "Assertion failed: data must be asc ordered by time, index=100, time=1793170800, prev time=1793527200"
 */

const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001/api';
const TEST_EMAIL = 'admin@tradeing.local';
const TEST_PASSWORD = 'Admin@12345';

// Decode the failing timestamps
const timestamp1 = 1793170800; // Unix seconds
const timestamp2 = 1793527200; // Unix seconds

console.log('='.repeat(80));
console.log('CANDLE ORDERING ISSUE ANALYSIS');
console.log('='.repeat(80));
console.log('');

console.log('Failing timestamps from error:');
console.log(`  timestamp1: ${timestamp1} (${new Date(timestamp1 * 1000).toISOString()})`);
console.log(`  timestamp2: ${timestamp2} (${new Date(timestamp2 * 1000).toISOString()})`);
console.log(`  Difference: ${timestamp2 - timestamp1} seconds (${(timestamp2 - timestamp1) / 3600} hours)`);
console.log('');

console.log('Issue: timestamp1 appears AFTER timestamp2 at index 100');
console.log('This means candles are NOT in ascending order');
console.log('');

async function testCandleOrdering() {
  try {
    // Step 1: Login
    console.log('Step 1: Authenticating...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    const accessToken = loginData.accessToken;
    console.log(`✓ Authenticated`);
    console.log('');

    // Step 2: Fetch EURUSD candles
    console.log('Step 2: Fetching EURUSD 1h candles (100 bars)...');
    const candlesResponse = await fetch(
      `${API_BASE}/market/candles?symbol=EURUSD&interval=1h&outputsize=100`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!candlesResponse.ok) {
      const error = await candlesResponse.text();
      throw new Error(`Candles request failed: ${candlesResponse.status} - ${error}`);
    }

    const candlesData = await candlesResponse.json();
    console.log(`✓ Received ${candlesData.candles.length} candles`);
    console.log('');

    // Step 3: Analyze timestamps
    console.log('Step 3: Analyzing candle timestamps...');
    console.log('');

    const candles = candlesData.candles;
    
    // Show first few candles
    console.log('First 5 candles:');
    for (let i = 0; i < Math.min(5, candles.length); i++) {
      const timestamp = Date.parse(candles[i].timestamp);
      console.log(`  [${i}] ${candles[i].timestamp} (${Math.floor(timestamp / 1000)} seconds)`);
    }
    console.log('');

    // Show last few candles
    console.log('Last 5 candles:');
    for (let i = Math.max(0, candles.length - 5); i < candles.length; i++) {
      const timestamp = Date.parse(candles[i].timestamp);
      console.log(`  [${i}] ${candles[i].timestamp} (${Math.floor(timestamp / 1000)} seconds)`);
    }
    console.log('');

    // Check ordering
    console.log('Step 4: Checking chronological order...');
    const orderViolations = [];
    const duplicates = [];
    const invalidTimestamps = [];

    for (let i = 0; i < candles.length; i++) {
      const currentTimestamp = Date.parse(candles[i].timestamp);
      const currentSeconds = Math.floor(currentTimestamp / 1000);

      if (!Number.isFinite(currentTimestamp) || currentTimestamp <= 0) {
        invalidTimestamps.push({ index: i, timestamp: candles[i].timestamp });
      }

      if (i > 0) {
        const prevTimestamp = Date.parse(candles[i - 1].timestamp);
        const prevSeconds = Math.floor(prevTimestamp / 1000);

        if (currentSeconds === prevSeconds) {
          duplicates.push({ 
            index: i, 
            prevIndex: i - 1,
            timestamp: candles[i].timestamp,
            unixSeconds: currentSeconds
          });
        } else if (currentSeconds < prevSeconds) {
          orderViolations.push({
            index: i,
            prevIndex: i - 1,
            currentTimestamp: candles[i].timestamp,
            prevTimestamp: candles[i - 1].timestamp,
            currentSeconds,
            prevSeconds,
            diff: prevSeconds - currentSeconds
          });
        }
      }
    }

    console.log('');
    if (invalidTimestamps.length > 0) {
      console.log(`❌ Found ${invalidTimestamps.length} invalid timestamps:`);
      invalidTimestamps.slice(0, 5).forEach(v => {
        console.log(`  [${v.index}] ${v.timestamp}`);
      });
    }

    if (duplicates.length > 0) {
      console.log(`❌ Found ${duplicates.length} duplicate timestamps:`);
      duplicates.slice(0, 5).forEach(d => {
        console.log(`  [${d.prevIndex}] and [${d.index}] both have ${d.timestamp} (${d.unixSeconds})`);
      });
    }

    if (orderViolations.length > 0) {
      console.log(`❌ Found ${orderViolations.length} order violations:`);
      orderViolations.slice(0, 5).forEach(v => {
        console.log(`  [${v.prevIndex}] ${v.prevTimestamp} (${v.prevSeconds})`);
        console.log(`  [${v.index}] ${v.currentTimestamp} (${v.currentSeconds})`);
        console.log(`    → Went backwards ${v.diff} seconds!`);
        console.log('');
      });
    }

    if (invalidTimestamps.length === 0 && duplicates.length === 0 && orderViolations.length === 0) {
      console.log('✓ All candles are in perfect chronological order with no duplicates!');
    }

    console.log('');
    console.log('Step 5: Frontend transformation simulation...');
    
    // Simulate what the frontend does
    const normalizedCandles = candles.map((candle, idx) => {
      const timestamp = Date.parse(candle.timestamp);
      const time = Math.floor(timestamp / 1000);
      return { 
        index: idx,
        time, 
        timestamp: candle.timestamp,
        open: Number(candle.open), 
        high: Number(candle.high), 
        low: Number(candle.low), 
        close: Number(candle.close) 
      };
    });

    // Check if frontend normalization changes ordering
    console.log('Checking if frontend normalization preserves order...');
    let frontendOrderIssues = 0;
    for (let i = 1; i < normalizedCandles.length; i++) {
      if (normalizedCandles[i].time <= normalizedCandles[i - 1].time) {
        frontendOrderIssues++;
        if (frontendOrderIssues <= 3) {
          console.log(`  Issue at index ${i}: ${normalizedCandles[i - 1].time} → ${normalizedCandles[i].time}`);
        }
      }
    }

    if (frontendOrderIssues === 0) {
      console.log('✓ Frontend normalization preserves order');
    } else {
      console.log(`❌ Frontend normalization creates ${frontendOrderIssues} order issues`);
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('ANALYSIS COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('ERROR');
    console.error('='.repeat(80));
    console.error(error.message);
    console.error(error.stack);
  }
}

testCandleOrdering();
