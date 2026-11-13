/**
 * IMMEDIATE TEST: Verify Twelve Data WebSocket Access
 * 
 * This script will:
 * 1. Test if your API key has WebSocket access
 * 2. Try to subscribe to EURUSD
 * 3. Report actual results
 */

const WebSocket = require('ws');
require('dotenv').config({ path: './apps/api/.env' });

const API_KEY = process.env.TWELVE_DATA_API_KEY;
const WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';

console.log('\n🔍 TWELVE DATA WEBSOCKET ACCESS TEST\n');
console.log('='.repeat(60));

if (!API_KEY || API_KEY.trim() === '') {
  console.error('❌ ERROR: TWELVE_DATA_API_KEY not found in apps/api/.env');
  process.exit(1);
}

console.log(`✅ API Key found: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 4)}`);
console.log(`📡 WebSocket URL: ${WS_URL}`);
console.log('');

// Test connection
const url = `${WS_URL}?apikey=${API_KEY}`;
const ws = new WebSocket(url);

let connected = false;
let subscriptionSent = false;
let receivedMessages = [];

// Timeout after 15 seconds
const timeout = setTimeout(() => {
  console.log('\n⏱️  TIMEOUT (15 seconds)');
  console.log('');
  
  if (!connected) {
    console.log('❌ RESULT: Could not connect to Twelve Data WebSocket');
    console.log('   Possible reasons:');
    console.log('   - Network issue');
    console.log('   - Invalid API key');
    console.log('   - Twelve Data service down');
  } else if (!subscriptionSent) {
    console.log('❌ RESULT: Connected but subscription failed');
  } else if (receivedMessages.length === 0) {
    console.log('⚠️  RESULT: Connected and subscribed, but no data received yet');
    console.log('   This could mean:');
    console.log('   - Market is closed');
    console.log('   - No recent ticks for EURUSD');
    console.log('   - Need to wait longer');
  }
  
  ws.close();
  process.exit(0);
}, 15000);

ws.on('open', () => {
  connected = true;
  console.log('✅ WebSocket connection OPENED');
  console.log('');
  
  // Try to subscribe to EURUSD
  const subscribeMessage = {
    action: 'subscribe',
    params: {
      symbols: 'EUR/USD'
    }
  };
  
  console.log('📤 Sending subscription request for EUR/USD...');
  console.log(JSON.stringify(subscribeMessage, null, 2));
  console.log('');
  
  ws.send(JSON.stringify(subscribeMessage));
  subscriptionSent = true;
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    receivedMessages.push(message);
    
    console.log('📨 Received message:');
    console.log(JSON.stringify(message, null, 2));
    console.log('');
    
    // Check for subscription status
    if (message.event === 'subscribe-status') {
      if (message.status === 'ok') {
        console.log('✅ SUBSCRIPTION SUCCESSFUL!');
        console.log('   Symbol:', message.symbol || 'EUR/USD');
        console.log('   WebSocket access: CONFIRMED');
        console.log('');
        console.log('⏳ Waiting for price updates...');
        console.log('   (if market is open, you should see ticks soon)');
        console.log('');
      } else {
        console.log('❌ SUBSCRIPTION FAILED');
        console.log('   Status:', message.status);
        console.log('   Message:', message.message || 'Unknown error');
        
        // Check for plan restriction
        const failureText = message.message || '';
        if (/plan|upgrade|not allowed|websocket|permission|exclusive/i.test(failureText)) {
          console.log('');
          console.log('🚫 ACCESS RESTRICTED');
          console.log('   Your Twelve Data plan does not include WebSocket access.');
          console.log('   WebSocket requires at least the Basic plan ($49/month).');
          console.log('');
          console.log('   Current options:');
          console.log('   1. Upgrade to Basic/Pro plan at https://twelvedata.com/pricing');
          console.log('   2. Continue with REST polling (current implementation)');
          console.log('   3. Use alternative provider with free WebSocket (e.g., Polygon.io, Alpha Vantage)');
        }
        
        clearTimeout(timeout);
        ws.close();
        process.exit(0);
      }
    }
    
    // Check for price update
    if (message.event === 'price' || (message.symbol && message.price !== undefined)) {
      console.log('🎯 LIVE PRICE UPDATE RECEIVED!');
      console.log('   Symbol:', message.symbol);
      console.log('   Price:', message.price);
      console.log('   Timestamp:', new Date(message.timestamp * 1000).toISOString());
      console.log('');
      console.log('✅ SUCCESS: Real-time WebSocket data is working!');
      console.log('');
      
      // Success! Close after first tick
      clearTimeout(timeout);
      setTimeout(() => {
        console.log('Test complete. Closing connection...');
        ws.close();
        process.exit(0);
      }, 2000);
    }
    
    // Check for heartbeat
    if (message.event === 'heartbeat') {
      console.log('💓 Heartbeat received - connection is alive');
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error parsing message:', error.message);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  clearTimeout(timeout);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log(`\n🔌 WebSocket closed: code=${code}, reason=${reason.toString() || 'none'}`);
  clearTimeout(timeout);
  
  if (!connected) {
    console.log('');
    console.log('❌ Connection failed before opening');
    console.log('   Check your API key and network connection');
  }
  
  process.exit(0);
});

console.log('🔄 Attempting to connect...\n');
