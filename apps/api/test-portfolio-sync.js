/**
 * DAY 4 - Portfolio Sync Test Script
 * 
 * Usage:
 * 1. Set your JWT token below
 * 2. Run: node test-portfolio-sync.js
 * 
 * This script will:
 * - Check connection status
 * - Trigger portfolio sync
 * - Fetch and display portfolio data
 */

const BASE_URL = 'http://localhost:4000/api/broker';

// ⚠️ REPLACE WITH YOUR JWT TOKEN
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE';

const headers = {
  'Authorization': `Bearer ${JWT_TOKEN}`,
  'Content-Type': 'application/json',
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getConnectionStatus() {
  console.log('\n📡 Checking connection status...');
  const response = await fetch(`${BASE_URL}/connection/status`, { headers });
  const data = await response.json();
  
  if (!response.ok) {
    console.error('❌ Failed:', data);
    return null;
  }
  
  console.log('✅ Status:', data.status);
  console.log('   Last connected:', data.lastConnectedAt || 'Never');
  return data;
}

async function getSyncStatus() {
  console.log('\n📊 Checking sync status...');
  const response = await fetch(`${BASE_URL}/portfolio/sync-status`, { headers });
  const data = await response.json();
  
  if (!response.ok) {
    console.error('❌ Failed:', data);
    return null;
  }
  
  console.log('✅ Connected:', data.connected);
  console.log('   In progress:', data.inProgress);
  
  if (data.lastSync) {
    console.log('   Last sync:', data.lastSync.status);
    console.log('   Positions:', data.lastSync.positionsCount);
    console.log('   Holdings:', data.lastSync.holdingsCount);
    console.log('   Completed at:', data.lastSync.completedAt);
  } else {
    console.log('   Last sync: Never');
  }
  
  return data;
}

async function triggerSync() {
  console.log('\n🔄 Triggering portfolio sync...');
  const response = await fetch(`${BASE_URL}/portfolio/sync`, {
    method: 'POST',
    headers,
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    if (response.status === 409) {
      console.log('⏳ Sync already in progress, waiting...');
      return null;
    }
    console.error('❌ Failed:', data);
    return null;
  }
  
  console.log('✅ Sync completed!');
  console.log('   Sync ID:', data.syncId);
  console.log('   Positions:', data.positionsCount);
  console.log('   Holdings:', data.holdingsCount);
  console.log('   Duration:', data.duration, 'ms');
  
  return data;
}

async function getPortfolio() {
  console.log('\n💼 Fetching portfolio...');
  const response = await fetch(`${BASE_URL}/portfolio`, { headers });
  const data = await response.json();
  
  if (!response.ok) {
    console.error('❌ Failed:', data);
    return null;
  }
  
  console.log('✅ Portfolio fetched!');
  console.log('\n📈 POSITIONS:', data.positions.length);
  
  data.positions.forEach((pos, i) => {
    console.log(`   ${i + 1}. ${pos.tradingSymbol} (${pos.exchange})`);
    console.log(`      Qty: ${pos.netQuantity} | Type: ${pos.productType}`);
    console.log(`      Entry: ₹${pos.netAveragePrice} | LTP: ₹${pos.lastTradedPrice}`);
    console.log(`      P&L: ₹${pos.totalPnl} (${pos.pnlPercentage}%)`);
    console.log(`      Status: ${pos.positionType}`);
  });
  
  console.log('\n💰 HOLDINGS:', data.holdings.length);
  
  data.holdings.forEach((hold, i) => {
    console.log(`   ${i + 1}. ${hold.tradingSymbol} (${hold.exchange})`);
    console.log(`      Qty: ${hold.quantity} | ISIN: ${hold.isin || 'N/A'}`);
    console.log(`      Avg: ₹${hold.averagePrice} | LTP: ₹${hold.lastTradedPrice}`);
    console.log(`      P&L: ₹${hold.profitAndLoss} (${hold.pnlPercentage}%)`);
    console.log(`      Value: ₹${hold.currentValue}`);
  });
  
  if (data.funds) {
    console.log('\n💵 FUNDS:');
    console.log('   Net Available:', '₹' + data.funds.netAvailableFunds);
    console.log('   Cash:', '₹' + data.funds.availableCash);
    console.log('   Margin:', '₹' + data.funds.availableMargin);
    console.log('   Utilized:', '₹' + data.funds.utilizedMargin);
    console.log('   M2M Unrealized:', '₹' + data.funds.m2mUnrealized);
    console.log('   M2M Realized:', '₹' + data.funds.m2mRealized);
  }
  
  console.log('\n⏰ Last synced:', data.lastSyncedAt);
  
  return data;
}

async function getFunds() {
  console.log('\n💵 Fetching funds only...');
  const response = await fetch(`${BASE_URL}/funds`, { headers });
  const data = await response.json();
  
  if (!response.ok) {
    console.error('❌ Failed:', data);
    return null;
  }
  
  if (data === null) {
    console.log('⚠️  No funds data available (sync required)');
    return null;
  }
  
  console.log('✅ Funds fetched!');
  console.log('   Net:', '₹' + data.netAvailableFunds);
  console.log('   Cash:', '₹' + data.availableCash);
  console.log('   Margin:', '₹' + data.availableMargin);
  
  return data;
}

async function main() {
  console.log('='.repeat(60));
  console.log('DAY 4 - PORTFOLIO SYNC TEST');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Check connection
    const connStatus = await getConnectionStatus();
    if (!connStatus || connStatus.status !== 'CONNECTED') {
      console.error('\n❌ Broker not connected. Please connect first.');
      return;
    }
    
    // Step 2: Check sync status
    const syncStatus = await getSyncStatus();
    
    // Step 3: Trigger sync if needed
    if (!syncStatus.inProgress) {
      const syncResult = await triggerSync();
      if (syncResult) {
        await sleep(1000); // Wait a bit for data to settle
      }
    } else {
      console.log('\n⏳ Waiting for sync to complete...');
      await sleep(3000);
    }
    
    // Step 4: Fetch portfolio
    await getPortfolio();
    
    // Step 5: Fetch funds separately
    await getFunds();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  }
}

// Run the test
if (JWT_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
  console.error('\n❌ Please set your JWT_TOKEN in the script first!');
  console.log('\nTo get a JWT token:');
  console.log('1. POST /api/auth/login with your credentials');
  console.log('2. Copy the accessToken from the response');
  console.log('3. Replace JWT_TOKEN in this script');
  process.exit(1);
}

main().catch(console.error);
