# 🧪 Test Files Index
**Purpose**: Quick reference for all available test scripts  
**Date**: November 1, 2026

---

## ✅ Primary Test Scripts (Run These)

### 1. test-simulated-trading.js ⭐ RECOMMENDED
**Purpose**: Comprehensive simulated trading flow tests  
**Status**: ✅ 5/5 PASSING  
**Time**: ~10 seconds  

**What It Tests**:
- ✅ BUY order (0.03 lots) - executes successfully
- ✅ SELL order (0.05 lots) - executes successfully  
- ✅ Invalid volume (too small) - correctly rejected
- ✅ Invalid volume (too large) - correctly rejected
- ✅ Close position - updates balance/margin correctly

**How to Run**:
```bash
cd c:\Users\ADITYA\OneDrive\Desktop\Trading\tradeing
node test-simulated-trading.js
```

**Expected Output**:
```
✅ SUCCESS: BUY order placed
✅ SUCCESS: SELL order placed
✅ SUCCESS: Correctly rejected small volume
✅ SUCCESS: Correctly rejected large volume
✅ SUCCESS: Position closed
OVERALL: 5/5 tests passed
```

---

### 2. test-candle-ordering.js ⭐ RECOMMENDED
**Purpose**: Verify backend candle timestamp ordering  
**Status**: ✅ PASSING  
**Time**: ~5 seconds  

**What It Tests**:
- ✅ Backend returns 100 candles in chronological order
- ✅ No duplicate timestamps
- ✅ Frontend normalization preserves order
- ✅ Validates specific timestamps from original error

**How to Run**:
```bash
node test-candle-ordering.js
```

**Expected Output**:
```
✓ Received 100 candles
✓ All candles are in perfect chronological order
✓ Frontend normalization preserves order
ANALYSIS COMPLETE
```

---

### 3. test-trade-order.js
**Purpose**: Basic BUY order functionality test  
**Status**: ✅ PASSING  
**Time**: ~5 seconds  

**What It Tests**:
- ✅ Can authenticate
- ✅ Can fetch trading account
- ✅ Can place simulated BUY order
- ✅ Order returns valid trade ID

**How to Run**:
```bash
node test-trade-order.js
```

**Expected Output**:
```
✓ Authenticated successfully
✓ Retrieved account TRD-2026-805307
✓ BUY order placed successfully
Trade ID: [uuid]
```

---

## 📊 Additional Diagnostic Tests

### 4. test-market-data.js
**Purpose**: Market data provider diagnostics  
**Status**: ✅ Available  
**Time**: ~10 seconds  

**What It Tests**:
- Market data API connectivity
- Quote retrieval for various symbols
- Price data format validation

**How to Run**:
```bash
node test-market-data.js
```

---

### 5. test-all-timeframes.js
**Purpose**: Chart data across different timeframes  
**Status**: ✅ Available  
**Time**: ~15 seconds  

**What It Tests**:
- Candle data for 1m, 5m, 15m, 1h, 1d timeframes
- Data format consistency across timeframes
- Timestamp ordering for each timeframe

**How to Run**:
```bash
node test-all-timeframes.js
```

---

### 6. test-correct-symbols.js
**Purpose**: Symbol normalization and validation  
**Status**: ✅ Available  
**Time**: ~5 seconds  

**What It Tests**:
- Symbol format validation
- Symbol normalization (EURUSD, EUR/USD, etc.)
- Exchange selection

**How to Run**:
```bash
node test-correct-symbols.js
```

---

### 7. test-normalized-symbols.js
**Purpose**: Symbol standardization testing  
**Status**: ✅ Available  
**Time**: ~5 seconds  

**What It Tests**:
- Symbol format conversions
- Case handling
- Special character handling

**How to Run**:
```bash
node test-normalized-symbols.js
```

---

### 8. test-websocket-crash-fix.js
**Purpose**: WebSocket stability testing  
**Status**: ✅ Available  
**Time**: ~30 seconds  

**What It Tests**:
- WebSocket connection stability
- Candle update handling
- Crash prevention logic

**How to Run**:
```bash
node test-websocket-crash-fix.js
```

---

### 9. test-complete-e2e.js
**Purpose**: End-to-end integration test  
**Status**: ✅ Available  
**Time**: ~20 seconds  

**What It Tests**:
- Complete trading workflow
- Account creation → funding → trading → closing
- Multi-step operations

**How to Run**:
```bash
node test-complete-e2e.js
```

---

### 10. test-auth-debug.js
**Purpose**: Authentication debugging utility  
**Status**: ✅ Available  
**Time**: ~5 seconds  

**What It Tests**:
- Authentication flow
- Token generation
- Permission validation

**How to Run**:
```bash
node test-auth-debug.js
```

---

### 11. test-wallet-funded-journey.js
**Purpose**: Wallet funding workflow test  
**Status**: ✅ Available  
**Time**: ~15 seconds  

**What It Tests**:
- Wallet funding
- Balance updates
- Transaction history

**How to Run**:
```bash
node test-wallet-funded-journey.js
```

---

### 12. test-fixes.js
**Purpose**: Comprehensive fix verification  
**Status**: ✅ Available  
**Time**: ~20 seconds  

**What It Tests**:
- All recent fixes
- Integration between fixes
- Regression prevention

**How to Run**:
```bash
node test-fixes.js
```

---

## 🎯 Recommended Test Sequence

### For Quick Verification (5 minutes)
```bash
# Run these 3 tests in order:
node test-simulated-trading.js    # Trading functionality
node test-candle-ordering.js      # Chart data ordering
node test-trade-order.js          # Basic order placement
```

### For Comprehensive Testing (15 minutes)
```bash
# Run all primary + diagnostic tests:
node test-simulated-trading.js
node test-candle-ordering.js
node test-trade-order.js
node test-market-data.js
node test-all-timeframes.js
node test-websocket-crash-fix.js
```

### For Full Regression Suite (30 minutes)
```bash
# Run all available tests:
node test-simulated-trading.js
node test-candle-ordering.js
node test-trade-order.js
node test-market-data.js
node test-all-timeframes.js
node test-correct-symbols.js
node test-normalized-symbols.js
node test-websocket-crash-fix.js
node test-complete-e2e.js
node test-auth-debug.js
node test-fixes.js
```

---

## 📊 Test Status Summary

| Test | Status | Priority | Time |
|------|--------|----------|------|
| test-simulated-trading.js | ✅ 5/5 PASS | 🔴 HIGH | 10s |
| test-candle-ordering.js | ✅ PASS | 🔴 HIGH | 5s |
| test-trade-order.js | ✅ PASS | 🔴 HIGH | 5s |
| test-market-data.js | ✅ Available | 🟡 MED | 10s |
| test-all-timeframes.js | ✅ Available | 🟡 MED | 15s |
| test-correct-symbols.js | ✅ Available | 🟢 LOW | 5s |
| test-normalized-symbols.js | ✅ Available | 🟢 LOW | 5s |
| test-websocket-crash-fix.js | ✅ Available | 🟡 MED | 30s |
| test-complete-e2e.js | ✅ Available | 🟡 MED | 20s |
| test-auth-debug.js | ✅ Available | 🟢 LOW | 5s |
| test-wallet-funded-journey.js | ✅ Available | 🟢 LOW | 15s |
| test-fixes.js | ✅ Available | 🟡 MED | 20s |

**Total**: 12 test scripts available  
**Verified**: 3 tests (all passing)  
**Total Time**: ~2.5 minutes (quick verification)

---

## 🔧 Test Requirements

### Prerequisites
```bash
# All tests require:
- Node.js installed
- Trading API running (apps/api)
- Database accessible
- Valid credentials in .env
```

### Environment Variables Needed
```bash
# Required in .env file:
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
TWELVE_DATA_API_KEY="..."
```

### Running API for Tests
```bash
# Terminal 1: Start API
cd apps/api
npm run start:dev

# Terminal 2: Run tests
cd ../..
node test-simulated-trading.js
```

---

## 🐛 Troubleshooting Tests

### "Cannot connect to database"
**Solution**: Check DATABASE_URL in .env, ensure database is running

### "Authentication failed"
**Solution**: Check JWT_SECRET in .env, verify credentials

### "Market data unavailable"
**Solution**: Check TWELVE_DATA_API_KEY in .env, verify API rate limits

### "Transaction timeout"
**Solution**: This indicates the fix may not be applied - check trading-engine-v2.service.ts

### Test hangs or doesn't complete
**Solution**: Press Ctrl+C, check API server logs for errors

---

## 📝 Creating New Tests

### Test Template
```javascript
// test-my-feature.js
import axios from 'axios';

const API_URL = 'http://localhost:3001';
const TEST_EMAIL = 'admin@tradeing.local';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Admin123!';

async function runTest() {
  console.log('🧪 Testing My Feature...\n');
  
  try {
    // Step 1: Authenticate
    const authRes = await axios.post(`${API_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    const token = authRes.data.accessToken;
    console.log('✓ Authenticated\n');
    
    // Step 2: Your test logic here
    // ...
    
    console.log('✓ Test passed!\n');
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  }
}

runTest();
```

### Best Practices
1. ✅ Always authenticate first
2. ✅ Use clear console logging
3. ✅ Handle errors gracefully
4. ✅ Clean up test data after completion
5. ✅ Exit with proper status code

---

## 🎯 Test Coverage

### What's Tested ✅
- ✅ Simulated order placement (BUY/SELL)
- ✅ Volume validation (min/max)
- ✅ Position closing
- ✅ Balance/margin updates
- ✅ Candle timestamp ordering
- ✅ Basic authentication

### What's NOT Tested ⚠️
- ⚠️ UI interactions (needs manual testing)
- ⚠️ WebSocket real-time updates (needs manual testing)
- ⚠️ Chart rendering (needs manual testing)
- ⚠️ Error recovery UI (needs manual testing)
- ⚠️ Symbol/timeframe switching (needs manual testing)

**For UI tests**: See `MANUAL_UI_VERIFICATION_CHECKLIST.md`

---

## 📞 Quick Reference

### Run All Critical Tests
```bash
node test-simulated-trading.js && node test-candle-ordering.js && node test-trade-order.js
```

### Run Tests with Output Logging
```bash
node test-simulated-trading.js > test-results.log 2>&1
```

### Run Tests in CI/CD
```bash
# Add to package.json:
"scripts": {
  "test:backend": "node test-simulated-trading.js && node test-candle-ordering.js",
  "test:all": "npm run test:backend && npm run test:manual"
}
```

---

## 🎉 Success Criteria

**Tests Pass If**:
- ✅ All console output shows "✓" or "✅"
- ✅ No error messages or exceptions
- ✅ Exit code is 0
- ✅ All expected data is returned
- ✅ No timeout errors

**Tests Fail If**:
- ❌ "Transaction timeout" errors
- ❌ "Authentication failed" errors
- ❌ "INVALID_VOLUME" for valid volumes
- ❌ Candles not in chronological order
- ❌ Exit code is 1

---

**Last Updated**: November 1, 2026  
**Test Status**: 3/3 critical tests passing ✅  
**Ready for**: Manual UI verification

---

## 🚀 Quick Start

```bash
# The 3 tests you NEED to run:
cd c:\Users\ADITYA\OneDrive\Desktop\Trading\tradeing
node test-simulated-trading.js    # Should show 5/5 PASS
node test-candle-ordering.js      # Should show perfect order
node test-trade-order.js          # Should show BUY success

# Expected: All ✅ GREEN
# Time: ~20 seconds total
```

**That's it!** If all 3 pass, backend is solid. Move to UI testing.
