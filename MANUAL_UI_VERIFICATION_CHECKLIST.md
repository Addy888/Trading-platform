# Manual UI Verification Checklist
**Date**: November 1, 2026  
**Purpose**: Verify fixes after context transfer  

---

## 🎯 Pre-Testing Setup

### 1. Start Services
```bash
# Terminal 1: Start API
cd apps/api
npm run start:dev

# Terminal 2: Start Web
cd apps/web
npm run dev
```

### 2. Login Credentials
- URL: http://localhost:3000
- Email: `admin@tradeing.local`
- Password: (check `.env` or admin panel)

### 3. Navigate to Trading Dashboard
- Dashboard → Trading → Select Account: `TRD-2026-805307` (SIMULATED)

---

## ✅ Test 1: Chart Loads Without Crash

**Goal**: Verify chart doesn't crash with "data must be asc ordered" error

### Steps
1. ☐ Load trading dashboard
2. ☐ Select symbol: **EURUSD**
3. ☐ Select timeframe: **1H**
4. ☐ Wait for chart to load

### Expected Results
- ☐ Chart loads successfully (no blank screen)
- ☐ Candles are visible
- ☐ No error messages in browser console about "asc ordered"
- ☐ No Lightweight Charts assertion failures

### If It Fails
- Open browser DevTools console (F12)
- Copy error message
- Note: symbol, timeframe, and timestamp mentioned in error
- Screenshot the error

---

## ✅ Test 2: Symbol/Timeframe Switching

**Goal**: Verify switching symbols/timeframes doesn't cause crashes

### Steps
1. ☐ Load chart with **EURUSD** on **1H**
2. ☐ Switch to **GBPUSD** (keep 1H)
3. ☐ Wait for chart to reload
4. ☐ Switch back to **EURUSD**
5. ☐ Change timeframe to **5m**
6. ☐ Change timeframe to **1D**

### Expected Results
- ☐ Each switch loads new data successfully
- ☐ No chart crashes or blank screens
- ☐ No console errors
- ☐ Loading indicator shows during transitions

### If It Fails
- Note which specific transition caused the failure
- Check if it's reproducible
- Look for WebSocket messages in console

---

## ✅ Test 3: WebSocket Candle Updates

**Goal**: Verify live candle updates work without crashing

### Steps
1. ☐ Load chart with **EURUSD** on **1m** (1-minute for faster updates)
2. ☐ Open browser DevTools console
3. ☐ Watch for WebSocket candle messages: `[Trading Page] Using WebSocket candle update`
4. ☐ Wait for 2-3 candle updates (2-3 minutes)
5. ☐ Check console for warning: `[Trading Page] Ignoring outdated WebSocket candle`

### Expected Results
- ☐ WebSocket candles appear in console
- ☐ Chart updates in real-time
- ☐ No crashes when WebSocket candles arrive
- ☐ If outdated candles arrive, they are **ignored** (logged as warning, not crash)

### If It Fails
- Note timestamp of candle that caused crash
- Check: was it older than last historical candle?
- Screenshot console messages

---

## ✅ Test 4: Position P&L Display

**Goal**: Verify open positions show current price and P&L (with asterisk for simulated)

### Steps
1. ☐ Verify you have an open position (from test script or create manually)
2. ☐ Navigate to **Positions** table on trading dashboard
3. ☐ Look at position row

### Expected Results
- ☐ **Current Price** shows a numeric value (not "Unavailable")
- ☐ **Simulated P&L** shows a numeric value (not "Unavailable")
- ☐ **Asterisk (*)** appears next to the price
- ☐ Hovering over asterisk shows tooltip: "Indicative price from Twelve Data last quote (not executable)"

### Example Display
```
Symbol  | Current Price | Simulated P&L
EURUSD  | 1.1179*       | +$2.50*
```
*Tooltip: Indicative price from Twelve Data last quote (not executable)

### If It Fails
- Note if price shows "Unavailable" (old bug persists)
- Check if asterisk is missing (UI fix didn't apply)
- Check account execution mode (should be SIMULATED)

---

## ✅ Test 5: Chart Error Recovery

**Goal**: Verify retry button works when chart fails

### Steps
1. ☐ Simulate a chart error:
   - Option A: Disconnect internet briefly
   - Option B: Select an invalid symbol (if available)
2. ☐ Observe error message appears
3. ☐ Click **Retry** button
4. ☐ Wait for chart to reload

### Expected Results
- ☐ Error message is user-friendly (not raw API error)
- ☐ Retry button is visible and clickable
- ☐ Clicking retry attempts to reload chart
- ☐ Loading indicator shows during retry
- ☐ Chart loads successfully after retry (if network restored)

### If It Fails
- Note if retry button is missing
- Check if retry does nothing
- Screenshot error message

---

## ✅ Test 6: Create Simulated Trade (End-to-End)

**Goal**: Verify full trading flow works without timeout

### Steps
1. ☐ Select symbol: **EURUSD**
2. ☐ Select order type: **Market**
3. ☐ Enter volume: **0.03** lots
4. ☐ Select direction: **BUY**
5. ☐ Click **Place Order**
6. ☐ Wait for order confirmation

### Expected Results
- ☐ Order executes within **2 seconds** (no 15-second timeout)
- ☐ Success message appears
- ☐ New position appears in Positions table
- ☐ Balance and margin update
- ☐ No "Transaction timeout" error

### If It Fails
- Note exact error message
- Check if it's still timing out after 15 seconds
- Check server logs for Prisma errors

---

## 📊 Test Results Summary

### Quick Status
- [ ] Test 1: Chart Loads - ☐ PASS ☐ FAIL
- [ ] Test 2: Symbol/Timeframe Switching - ☐ PASS ☐ FAIL
- [ ] Test 3: WebSocket Updates - ☐ PASS ☐ FAIL
- [ ] Test 4: Position P&L Display - ☐ PASS ☐ FAIL
- [ ] Test 5: Chart Error Recovery - ☐ PASS ☐ FAIL
- [ ] Test 6: Create Simulated Trade - ☐ PASS ☐ FAIL

### Overall Result
☐ **ALL TESTS PASSED** - Fixes verified, no issues  
☐ **SOME TESTS FAILED** - See failure details above

---

## 🐛 If Tests Fail

### Chart Still Crashes
1. Check browser console for exact error
2. Note timestamps mentioned in error
3. Run diagnostic: `node test-candle-ordering.js`
4. Check if backend returns candles in wrong order

### Position P&L Still Unavailable
1. Check `.env` for Twelve Data API key
2. Verify account execution mode: should be `SIMULATED`
3. Check market data provider status in admin panel
4. Run API logs to see price fetch attempts

### Trades Still Timeout
1. Check database connection pool size
2. Review Prisma transaction timeout setting
3. Check if risk evaluation service is slow
4. Run test: `node test-simulated-trading.js`

---

## 📝 Notes Section

Use this space to record any observations, errors, or unexpected behavior:

```
[Date/Time] - Observation:


```

---

## ✅ Sign-Off

**Tested By**: _________________________  
**Date**: _________________________  
**Result**: ☐ Verified ☐ Issues Found  

**Next Actions**:
- [ ] Create bug tickets for failures
- [ ] Update regression tests
- [ ] Deploy to staging

---

**Generated**: November 1, 2026  
**Context**: Post-context transfer verification
