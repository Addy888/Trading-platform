# BROWSER VERIFICATION CHECKLIST
## Live Chart Manual Testing - Step by Step

**Purpose**: Verify the complete end-to-end live chart functionality in the actual browser.

**Prerequisites**:
- [ ] Backend server running (`npm run start:dev` in `apps/api`)
- [ ] Frontend server running (`npm run dev` in `apps/web`)
- [ ] Valid Twelve Data API key configured in `apps/api/.env`
- [ ] MySQL database running and seeded

---

## TEST 1: Initial Chart Rendering (5 minutes)

### Steps:
1. Open browser and navigate to: `http://localhost:3000`
2. Log in with your credentials
3. Navigate to Trading Dashboard for any trading account
4. Select **EURUSD** symbol
5. Select **1m** (1-minute) timeframe

### Expected Results:
- [ ] Chart container appears without errors
- [ ] Historical candles load and display
- [ ] Chart shows green/red candlesticks
- [ ] Time axis shows correct timestamps
- [ ] Price axis shows realistic EURUSD prices (~1.05-1.15 range)

### Browser Console Check:
```javascript
// Open Developer Tools (F12) and check console
// Expected logs:
[useMarketWebSocket] Subscribing to: ['EURUSD'] for timeframe: 1m
[useMarketWebSocket] ✅ Subscription successful
```

### If Chart Doesn't Render:
- [ ] Check browser console for errors
- [ ] Check Network tab for failed API calls
- [ ] Verify backend logs show subscription
- [ ] Take screenshot and note error message

---

## TEST 2: Live Candle Updates (5 minutes continuous observation)

### Steps:
1. With EURUSD 1m chart visible, observe for **at least 5 full minutes**
2. Watch for new candles appearing every minute
3. Watch the **current candle** (rightmost) update in real-time

### Expected Results:
- [ ] New candle appears every 60 seconds (on the minute boundary)
- [ ] Current candle updates multiple times per minute (OHLC changes)
- [ ] No duplicate candles at same timestamp
- [ ] Candles appear in chronological order
- [ ] No gaps in the candle sequence
- [ ] Chart auto-scrolls to show latest candle

### Browser Console Check:
```javascript
// Expected logs every few seconds:
[useMarketWebSocket] 📊 Candle update received: {
  symbol: 'EURUSD',
  timeframe: '1m',
  time: '2026-11-12T17:05:00.000Z',
  close: 1.10573
}
[CandlestickChart] ✅ Candle state updated
```

### If Updates Stop:
- [ ] Check connection status indicator on chart
- [ ] Check browser console for WebSocket errors
- [ ] Check backend logs for disconnections
- [ ] Note timestamp when updates stopped

---

## TEST 3: Symbol Switching (2 minutes per symbol)

### Steps:
1. Click on **GBPUSD** in the symbol selector
2. Observe chart reloads with GBPUSD data
3. Wait 2 minutes to verify live updates
4. Click on **USDJPY**
5. Observe chart reloads with USDJPY data
6. Wait 2 minutes to verify live updates
7. Return to **EURUSD**

### Expected Results for Each Symbol:
- [ ] Chart clears and reloads
- [ ] Historical candles load correctly
- [ ] Live updates resume within 5 seconds
- [ ] Previous symbol's data is cleared
- [ ] No mixed data between symbols
- [ ] Connection status shows "CONNECTED"

### Browser Console Check:
```javascript
// On symbol change:
[useMarketWebSocket] Unsubscribing from: ['EURUSD']
[useMarketWebSocket] Subscribing to: ['GBPUSD'] for timeframe: 1m
```

### Backend Console Check:
```
✅ Subscribed to GBPUSD
Sent unsubscribe request for EURUSD
```

---

## TEST 4: Timeframe Switching (1 minute per timeframe)

### Steps:
1. With EURUSD selected, switch to **5m** (5-minute) timeframe
2. Observe chart updates
3. Switch to **15m** (15-minute) timeframe
4. Switch to **30m**
5. Switch to **1h** (1-hour)
6. Return to **1m**

### Expected Results for Each Timeframe:
- [ ] Chart reloads with appropriate candle period
- [ ] Historical data matches timeframe (wider candles for longer periods)
- [ ] Live updates match timeframe interval
- [ ] No leftover data from previous timeframe
- [ ] Time axis labels adjust to timeframe

### Expected Update Frequency:
- 1m: Updates every few seconds
- 5m: Updates every 5 minutes
- 15m: Updates every 15 minutes
- 1h: Updates every hour

### Browser Console Check:
```javascript
// On timeframe change:
[useMarketWebSocket] Subscribing to: ['EURUSD'] for timeframe: 5m
[CandlestickChart] Applying valid candle update: { timeframe: '5m' }
```

---

## TEST 5: Connection Status Indicators (throughout all tests)

### Check Chart Header for:
- [ ] Symbol name displayed (e.g., "EURUSD")
- [ ] Timeframe displayed (e.g., "1m")
- [ ] Latest price displayed
- [ ] Connection status indicator:
  - 🟢 Green = "CONNECTED" (good)
  - 🟡 Yellow = "STALE" (warning)
  - 🔴 Red = "DISCONNECTED" (error)
- [ ] Last update timestamp

### Expected Status During Normal Operation:
```
EURUSD · 1m · Last · 1.10573
Twelve Data · quote available · polling
```

### If Status Shows Error:
- [ ] Note exact error message
- [ ] Check browser Network tab for WebSocket status
- [ ] Check if backend is still running
- [ ] Take screenshot

---

## TEST 6: WebSocket Reconnection (optional but recommended)

### Steps:
1. With chart working normally, **stop the backend server**
2. Observe connection status changes
3. Wait 10 seconds
4. **Restart the backend server**
5. Observe reconnection

### Expected Results:
- [ ] Status changes to "DISCONNECTED" within 10 seconds of backend stop
- [ ] Error message appears on chart
- [ ] After restart, status changes to "CONNECTING"
- [ ] Within 10 seconds, status changes to "CONNECTED"
- [ ] Live updates resume automatically
- [ ] No page refresh required

### Browser Console Check:
```javascript
// On disconnect:
❌ WebSocket disconnected: io server disconnect

// On reconnect:
✅ WebSocket connected: [socket-id]
[useMarketWebSocket] ✅ Subscription successful
```

---

## TEST 7: Browser DevTools Inspection

### Network Tab Check:
1. Open DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Verify WebSocket connection:
   - [ ] URL: `ws://localhost:3001/trading`
   - [ ] Status: `101 Switching Protocols`
   - [ ] Frames tab shows messages

4. Click on WebSocket connection
5. Go to "Frames" or "Messages" tab
6. Verify bidirectional communication:
   - [ ] Outgoing: `market:subscribe` with symbol
   - [ ] Incoming: `market:candle` with OHLC data
   - [ ] Incoming: `market:price` updates (optional)

### Console Tab Check:
1. Filter by "useMarketWebSocket" or "CandlestickChart"
2. Verify no errors (red messages)
3. Verify regular update logs (debug messages)

### Performance Tab Check (optional):
1. Record 60 seconds of chart operation
2. Check for:
   - [ ] No memory leaks (memory should be stable)
   - [ ] Frame rate ~60fps (smooth animation)
   - [ ] No excessive CPU usage

---

## TEST 8: Data Accuracy Verification

### Steps:
1. With EURUSD 1m chart visible, note the current candle values
2. Open a new browser tab
3. Go to: `https://twelvedata.com/forex/eurusd`
4. Compare current price

### Expected Results:
- [ ] Your chart price is within ±10 pips of Twelve Data website
- [ ] Candle timestamps match (both show current minute)
- [ ] OHLC values are realistic (High ≥ Open/Close, Low ≤ Open/Close)

### If Prices Don't Match:
- This is NORMAL - Twelve Data free tier may have delays
- Check your chart's "Last Update" timestamp
- If > 2 minutes old, there may be an issue

---

## TEST 9: Extended Stability Test (15 minutes)

### Steps:
1. Leave the chart open and visible for **15 continuous minutes**
2. Do NOT interact with the page
3. Observe background updates

### Expected Results:
- [ ] Chart continues updating every minute
- [ ] No freezing or stuttering
- [ ] No WebSocket disconnections
- [ ] No memory leaks (use Task Manager to check)
- [ ] No console errors accumulate
- [ ] Browser tab remains responsive

### Monitor These Values:
- Start memory: _____ MB
- End memory: _____ MB (should be similar)
- Candles received: _____ (should be ~15)
- Disconnections: _____ (should be 0)

---

## TEST 10: Multi-Tab Test (optional)

### Steps:
1. With chart working in Tab 1, open a new tab
2. Navigate to the same trading dashboard
3. Open the same symbol and timeframe

### Expected Results:
- [ ] Both tabs receive updates independently
- [ ] No conflicts or errors
- [ ] Each tab has its own WebSocket connection
- [ ] Backend logs show 2 separate subscriptions

---

## COMPLETION CHECKLIST

After completing all tests, verify:

- [ ] ✅ Initial chart rendering works (Test 1)
- [ ] ✅ Live updates work for 5+ minutes (Test 2)
- [ ] ✅ Symbol switching works (Test 3)
- [ ] ✅ Timeframe switching works (Test 4)
- [ ] ✅ Connection status is accurate (Test 5)
- [ ] ✅ WebSocket reconnection works (Test 6)
- [ ] ✅ DevTools shows clean operation (Test 7)
- [ ] ✅ Data accuracy is reasonable (Test 8)
- [ ] ✅ Chart is stable for 15+ minutes (Test 9)
- [ ] ✅ Multi-tab operation works (Test 10)

### Overall Result:
- [ ] **PASS** - All tests passed, ready for production
- [ ] **PARTIAL** - Some tests passed, needs fixes (list below)
- [ ] **FAIL** - Major issues, not ready (list below)

### Issues Found (if any):
1. _____________________________________
2. _____________________________________
3. _____________________________________

### Screenshots Attached:
- [ ] Chart working normally
- [ ] Browser console logs
- [ ] Network WebSocket frames
- [ ] Any errors encountered

---

## BACKEND LOG VERIFICATION

While running browser tests, monitor backend logs for:

### Expected Logs (Normal Operation):
```
✅ Connected to Twelve Data WebSocket
✅ Subscribed to EURUSD
📊 EUR/USD: $1.10573 (provider: 2026-11-12T17:05:00.000Z, received: 2026-11-12T17:05:03.627Z)
1m EURUSD 2026-11-12T17:05:00.000Z C=1.10573
```

### Warning Logs (Acceptable):
```
⚠️ No heartbeat received for 60s, reconnecting...
📊 EUR/USD: $1.10573 (provider event 65s old - possible stale data)
```

### Error Logs (Investigate):
```
❌ Subscription failed for EURUSD: [error message]
🔴 WebSocket connection error: [error message]
❌ WebSocket closed: code=1006
```

---

## TROUBLESHOOTING GUIDE

### Issue: Chart shows "No Data Available"
**Possible Causes**:
1. Backend not running → Check `npm run start:dev` in apps/api
2. WebSocket not connected → Check browser console for connection errors
3. Invalid API key → Check `.env` file for TWELVE_DATA_API_KEY
4. Rate limit exceeded → Wait 1 minute and refresh

**Fix**: Check backend logs for the root cause

---

### Issue: Chart updates stop after a few minutes
**Possible Causes**:
1. WebSocket disconnected → Check reconnection logic
2. Twelve Data free tier limit → Check provider API usage
3. Network timeout → Check firewall/proxy settings

**Fix**: Implement manual reconnect button, monitor backend logs

---

### Issue: Candles have wrong timestamps
**Possible Causes**:
1. Timezone mismatch → All should be UTC
2. Incorrect time bucketing → Check `applyTick()` logic
3. System clock incorrect → Verify server time

**Fix**: Verify all timestamps are in UTC (ending with Z)

---

### Issue: High/Low violations in candles
**Possible Causes**:
1. Bug in aggregation logic → Check `candle-sanitize.ts`
2. Corrupt provider data → Check Twelve Data API directly
3. Race condition in updates → Check update ordering

**Fix**: Enable debug logging, verify OHLC math

---

**Test Date**: _______________  
**Tester Name**: _______________  
**Browser**: _______________  
**OS**: _______________  
**Result**: _______________  

**Signature**: _______________
