# MANUAL BROWSER VERIFICATION - STEP BY STEP

**Status**: Backend tests PASSED ✅  
**Tested**: 2026-11-12T17:25:44Z  
**Result**: EURUSD historical candles working (100 candles for all 7 timeframes)

---

## ✅ AUTOMATED TESTS PASSED

```
Backend Health: PASS ✅
Authentication: PASS ✅
Market Status: PASS ✅
EURUSD Historical Candles: 7/7 timeframes PASS ✅
  - 1min: 100 candles (286ms)
  - 5min: 100 candles (270ms)
  - 15min: 100 candles (252ms)
  - 30min: 100 candles (247ms)
  - 1h: 100 candles (296ms)
  - 4h: 100 candles (289ms)
  - 1day: 100 candles (292ms)
```

---

## 📋 MANUAL BROWSER TEST CHECKLIST

### STEP 1: OPEN BROWSER (1 minute)

1. Open your browser (Chrome, Firefox, or Edge)
2. Navigate to: **http://localhost:3000**
3. You should see the trading platform login page

**Expected**: Login page appears  
**If not**: Check that frontend is running (`npm run dev` in apps/web)

---

### STEP 2: LOGIN (1 minute)

Use the test account created by the automated script:

```
Email: test_browser_verification@trading.local
Password: TestBrowser123!
```

1. Enter email and password
2. Click "Login" or press Enter
3. Wait for redirect to dashboard

**Expected**: Redirected to dashboard/home page  
**If login fails**: Account doesn't exist - re-run `node BROWSER_TEST_COMPLETE.js`

---

### STEP 3: OPEN TRADING DASHBOARD (1 minute)

1. Look for "Trading" or "Trading Dashboard" in navigation
2. Click to open trading terminal
3. If prompted to select an account, choose any available account
4. Wait for trading dashboard to load

**Expected**: See chart area, order panel, positions table  
**If no accounts**: Create a new trading account from account management

---

### STEP 4: SELECT EURUSD + 1m (CRITICAL TEST)

1. In the symbol selector (top of chart), select **EURUSD**
2. In the timeframe selector, select **1m** (1-minute)
3. Wait 2-5 seconds for chart to load

**EXPECTED RESULTS** ✅:
- Chart shows green/red candlesticks
- You can see approximately 100 candles
- Candles are in chronological order (left to right)
- Prices around 1.05-1.11 range (realistic EURUSD)
- Time axis shows dates/times
- Price axis shows price levels
- NO "No Data Available" message
- NO blank/empty chart
- NO console errors (open F12 to check)

**Take Screenshot**: Chart with 1m EURUSD candles visible

---

### STEP 5: VERIFY LIVE UPDATES (2-3 minutes)

**This is the critical test for live data!**

1. Keep watching the chart for **2-3 minutes**
2. Focus on the **rightmost candle** (current candle)
3. Look for changes in the candle height/color

**EXPECTED** ✅:
- Current candle updates every few seconds (OHLC changes)
- After 1 minute passes, a NEW candle appears
- Chart scrolls slightly to show new candle
- Candle timestamps increment correctly

**Take Screenshot**: After waiting 2 minutes, showing updated candles

---

### STEP 6: TEST TIMEFRAME SWITCHING (5 minutes)

Test EACH timeframe and record results:

**Test 5m**:
1. Click timeframe selector → Select **5m**
2. Wait 2-3 seconds
3. ✅ PASS if: ~100 candles appear, wider than 1m candles
4. ❌ FAIL if: No data, error message, or chart doesn't reload

**Test 15m**:
1. Select **15m**
2. Wait 2-3 seconds
3. ✅ PASS if: ~100 candles appear, even wider candles
4. ❌ FAIL if: No data or errors

**Test 1H** (1-hour):
1. Select **1H**
2. Wait 2-3 seconds
3. ✅ PASS if: ~100 candles appear, much wider candles
4. ❌ FAIL if: No data or errors

**Return to 1m**:
1. Select **1m** again
2. Verify candles reload correctly

**Take Screenshot**: Chart with 1H timeframe showing wider candles

---

### STEP 7: TEST SYMBOL SWITCHING (3 minutes)

**Test GBPUSD**:
1. In symbol selector, choose **GBPUSD**
2. Keep timeframe at **1m**
3. Wait 2-3 seconds
4. ✅ PASS if: Chart shows GBPUSD candles (prices ~1.20-1.30 range)
5. ❌ FAIL if: No data or shows EURUSD prices

**Test USDJPY**:
1. Select **USDJPY**
2. Wait 2-3 seconds
3. ✅ PASS if: Chart shows USDJPY candles (prices ~140-160 range)
4. ❌ FAIL if: No data

**Return to EURUSD**:
1. Select **EURUSD** again
2. Verify candles reload

**Take Screenshot**: Chart with GBPUSD or USDJPY

---

### STEP 8: CHECK BROWSER CONSOLE (1 minute)

1. Press **F12** to open Developer Tools
2. Click **Console** tab
3. Look for any RED error messages

**EXPECTED** ✅:
- Blue/gray info logs: `[useMarketWebSocket] Subscribed...`
- Blue/gray info logs: `[loadCandles] Request...`
- Blue/gray info logs: `[CandlestickChart] Applying valid candle...`
- NO red errors about "ordering", "duplicate timestamps", or "invalid data"

**Take Screenshot**: Console showing logs (no red errors)

---

### STEP 9: TEST BUY/SELL (REGRESSION TEST)

**This verifies we didn't break existing functionality**

1. In the Order Panel (right side), enter:
   - Symbol: EURUSD (should be auto-selected)
   - Volume/Lot Size: 0.01 or 0.1
   - Side: **BUY**

2. Click **BUY** button

**EXPECTED** ✅:
- Success message appears
- New position appears in **Positions Table** below chart
- Position shows:
  - Symbol: EURUSD
  - Type: BUY
  - Volume: 0.01 or 0.1
  - Entry price
  - Current P/L

3. Test **SELL**:
   - Change side to **SELL**
   - Click **SELL** button
   - Verify new SELL position appears

4. Test **Close Position**:
   - In Positions Table, find one position
   - Click **Close** button
   - Confirm closure
   - Verify position disappears from table
   - Verify trade appears in **Trades** tab

**Take Screenshot**: Positions table with open positions

---

### STEP 10: BROWSER NETWORK TAB (1 minute)

1. In DevTools (F12), click **Network** tab
2. Filter by **WS** (WebSocket)
3. Look for WebSocket connection

**EXPECTED** ✅:
- WebSocket to `ws://localhost:3001/trading`
- Status: **101 Switching Protocols** (connected)
- Click on WebSocket → **Messages** tab
- See `market:candle` messages arriving

**Take Screenshot**: Network tab showing WebSocket connection

---

## 📊 TEST RESULTS FORM

Fill this out after completing all steps:

```
Date: _______________
Tester: _______________
Browser: _______________ (Chrome/Firefox/Edge)

STEP 4 - Initial Chart Load:
[ ] PASS - Chart shows 100 EURUSD 1m candles
[ ] FAIL - Reason: _______________

STEP 5 - Live Updates:
[ ] PASS - Candles update in real-time
[ ] FAIL - Reason: _______________

STEP 6 - Timeframe Switching:
[ ] PASS - All timeframes load (1m, 5m, 15m, 1H)
[ ] FAIL - Failed timeframes: _______________

STEP 7 - Symbol Switching:
[ ] PASS - GBPUSD and USDJPY load
[ ] FAIL - Failed symbols: _______________

STEP 8 - Console Errors:
[ ] PASS - No red errors
[ ] FAIL - Errors found: _______________

STEP 9 - BUY/SELL:
[ ] PASS - Can open and close positions
[ ] FAIL - Issue: _______________

STEP 10 - WebSocket:
[ ] PASS - WebSocket connected, messages flowing
[ ] FAIL - Issue: _______________

OVERALL RESULT:
[ ] ✅ ALL TESTS PASSED - Ready for production
[ ] ❌ SOME TESTS FAILED - Needs fixes
```

---

## 🚨 COMMON ISSUES

### Issue: "No Data Available"
**Cause**: Historical candles didn't load  
**Check**:
1. Browser console for errors
2. Network tab for failed API calls
3. Backend logs for errors

### Issue: Chart is blank/white
**Cause**: Chart component error  
**Check**:
1. Browser console for React errors
2. Verify Lightweight Charts library loaded

### Issue: "Ordering assertion" error
**Cause**: Duplicate timestamps or wrong order  
**Check**:
1. Browser console for exact error
2. Backend logs for candle validation failures

### Issue: Candles don't update
**Cause**: WebSocket disconnected  
**Check**:
1. Network tab → WS filter → verify connection
2. Backend logs for WebSocket errors

---

## 📸 REQUIRED SCREENSHOTS

Save these screenshots with clear filenames:

1. `01_login_page.png` - Login screen
2. `02_dashboard.png` - Trading dashboard overview
3. `03_eurusd_1m_initial.png` - Initial EURUSD 1m chart with ~100 candles
4. `04_eurusd_1m_after_2min.png` - Same chart after waiting 2 minutes (shows updates)
5. `05_eurusd_1h.png` - EURUSD 1H timeframe
6. `06_gbpusd_1m.png` - GBPUSD 1m chart
7. `07_console_logs.png` - Browser console with logs (no errors)
8. `08_positions_table.png` - Open positions after BUY/SELL test
9. `09_websocket_network.png` - Network tab showing WebSocket connection

---

## ✅ ACCEPTANCE CRITERIA

**Task is COMPLETE when:**

1. ✅ Historical candles visible (100 candles for EURUSD 1m)
2. ✅ Candles in chronological order (left to right, oldest to newest)
3. ✅ No Lightweight Charts errors in console
4. ✅ Live candle updates work (rightmost candle changes)
5. ✅ Timeframe switching works (1m, 5m, 15m, 1H all load)
6. ✅ Symbol switching works (EURUSD, GBPUSD, USDJPY)
7. ✅ BUY/SELL still works (can open and close positions)
8. ✅ WebSocket connected (can see in Network tab)
9. ✅ No fake/fabricated data (all prices from Twelve Data)
10. ✅ Screenshots provided as evidence

---

## 📝 HOW TO SUBMIT RESULTS

1. Complete all 10 test steps
2. Fill out the test results form above
3. Save all 9 screenshots
4. Create a summary document with:
   - Filled test results form
   - Screenshots
   - Any errors encountered
   - Overall pass/fail verdict

---

**Next Steps After PASS:**
- Mark task as complete
- Deploy to staging environment
- Set up monitoring
- Document any limitations (e.g., rate limits)

**Next Steps After FAIL:**
- Document exact failure
- Check backend logs
- Check browser console
- Report issue for fixing

---

**Test Prepared**: 2026-11-12  
**Backend Status**: ✅ READY  
**Estimated Time**: 15-20 minutes  
**Difficulty**: Easy (just follow steps)

