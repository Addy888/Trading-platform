# ⚡ DO THIS NOW - SIMPLE CHECKLIST

**All backend tests passed. The UI needs visual verification.**

---

## 🚀 OPEN THE BROWSER

1. Open your browser (Chrome/Firefox/Edge)
2. Go to: **http://localhost:3000**
3. Login:
   ```
   Email: test_browser_verification@trading.local
   Password: TestBrowser123!
   ```
4. Click "Trading" → Select any account

---

## ✅ 7 QUICK TESTS (15 minutes total)

### ✅ 1. Does the chart show candles? (1 min)
- Select **EURUSD** + **1m**
- Wait 3 seconds
- **PASS if**: You see ~100 green/red candlesticks
- **FAIL if**: Blank chart or "No Data Available"
- **Screenshot**: `01_eurusd_1m_initial.png`

### ✅ 2. Do candles update live? (2 min)
- Watch the rightmost candle
- Wait 2 full minutes
- **PASS if**: Candle height changes, new candle appears after 1 min
- **FAIL if**: Nothing moves
- **Screenshot**: `02_eurusd_1m_after_2min.png`

### ✅ 3. Does timeframe switching work? (3 min)
- Switch to **5m** → Should see ~100 wider candles
- Switch to **15m** → Should see ~100 even wider candles
- Switch to **1H** → Should see ~100 very wide candles
- **PASS if**: All timeframes load candles
- **FAIL if**: Any timeframe shows no data
- **Screenshot**: `03_eurusd_1h.png`

### ✅ 4. Does symbol switching work? (2 min)
- Switch to **GBPUSD** + **1m** → Should see candles (prices ~1.32)
- Switch to **USDJPY** + **1m** → Should see candles (prices ~140-160)
- **PASS if**: Both symbols load
- **FAIL if**: Shows wrong prices or no data
- **Screenshot**: `04_gbpusd_1m.png`

### ✅ 5. Does BUY/SELL work? (3 min)
- In Order Panel: Volume = 0.01, Side = BUY
- Click **BUY** button
- **PASS if**: Position appears in Positions Table
- Try **SELL** button too
- Click **Close** on a position
- **PASS if**: Position disappears
- **Screenshot**: `05_positions_table.png`

### ✅ 6. Is WebSocket connected? (2 min)
- Press **F12** (Developer Tools)
- Click **Network** tab
- Filter by **WS**
- **PASS if**: See WebSocket connection (status 101)
- Click WebSocket → **Messages** tab
- **PASS if**: See `market:candle` messages
- **Screenshot**: `06_websocket_network.png`

### ✅ 7. Any errors in console? (2 min)
- In Developer Tools, click **Console** tab
- Look for RED errors
- **PASS if**: Only blue/gray logs (no red errors)
- **FAIL if**: Red errors about "ordering" or "duplicate timestamps"
- **Screenshot**: `07_console_logs.png`

---

## 📋 REPORT RESULTS

**Copy this and fill it out:**

```
TEST RESULTS - 2026-11-12

Test 1 - Chart shows candles: [ ] PASS [ ] FAIL
Test 2 - Live updates work: [ ] PASS [ ] FAIL
Test 3 - Timeframe switching: [ ] PASS [ ] FAIL
Test 4 - Symbol switching: [ ] PASS [ ] FAIL
Test 5 - BUY/SELL works: [ ] PASS [ ] FAIL
Test 6 - WebSocket connected: [ ] PASS [ ] FAIL
Test 7 - No console errors: [ ] PASS [ ] FAIL

Overall: [ ] ALL PASSED [ ] SOME FAILED

Issues (if any):
_______________________________________
```

---

## 🎉 IF ALL TESTS PASS

Reply with:
> "Manual browser test COMPLETE. All 7 tests passed. Screenshots saved."

**Then the task is 100% COMPLETE!** ✅

---

## 🚨 IF ANY TEST FAILS

Reply with:
> "Browser test FAILED. Test [X] failed because [reason]."

Include:
- Which test failed
- What you saw (screenshot helpful)
- Any error messages from console

---

## 📊 CURRENT STATUS

✅ Backend: 12/12 tests passed  
✅ Historical data: 700 candles validated  
✅ Code review: All correct  
✅ Servers running: Ports 3000 & 3001  
⏳ Browser test: **Your action required**

---

**Start now: http://localhost:3000** 🚀
