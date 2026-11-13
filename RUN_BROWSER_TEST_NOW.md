# 🚀 RUN BROWSER TEST NOW - Quick Start

**Time Required**: 10 minutes  
**What You'll Verify**: Live EURUSD 1-minute candle chart actually works in your browser

---

## STEP 1: Start the Servers (2 minutes)

### Terminal 1 - Backend:
```bash
cd apps/api
npm run start:dev
```

**Wait for**: 
```
✅ Connected to Twelve Data WebSocket
[Nest] ... - Application is running on: http://localhost:3001
```

### Terminal 2 - Frontend:
```bash
cd apps/web
npm run dev
```

**Wait for**:
```
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

---

## STEP 2: Open the Chart (30 seconds)

1. Open browser: `http://localhost:3000`
2. Log in (or register if first time)
3. Click **Trading Dashboard** or navigate to `/dashboard/trading/[accountId]`
4. Select **EURUSD** symbol
5. Select **1m** timeframe

**You should see**: Chart with green/red candlesticks

---

## STEP 3: Verify Live Updates (5 minutes)

### Watch the Chart:
- [ ] Chart renders without errors ✅
- [ ] You can see multiple candlesticks ✅
- [ ] A new candle appears every 60 seconds ✅
- [ ] The rightmost candle updates multiple times per minute ✅

### Check Browser Console (F12 → Console):
```javascript
// Expected logs (should appear every few seconds):
[useMarketWebSocket] 📊 Candle update received
[CandlestickChart] ✅ Candle state updated
```

### Check Connection Status (Top-left of chart):
```
EURUSD · 1m
Twelve Data · CONNECTED
Last Update: [recent timestamp]
```

---

## STEP 4: Quick Tests (3 minutes)

### Test 1: Symbol Switch
1. Click **GBPUSD** 
2. Chart should reload with GBPUSD data ✅
3. Wait 1 minute for live update ✅

### Test 2: Timeframe Switch
1. Click **5m** 
2. Chart should show 5-minute candles ✅
3. Return to **1m** ✅

### Test 3: Check Backend Logs
Look at Terminal 1 (backend):
```
Expected:
✅ Subscribed to EURUSD
📊 EUR/USD: $1.10573 (provider: 2026-11-12T17:05:00.000Z)
1m EURUSD 2026-11-12T17:05:00.000Z C=1.10573

Not Expected:
❌ Any errors
❌ WebSocket disconnections
```

---

## WHAT SUCCESS LOOKS LIKE

### ✅ PASS Criteria:
- Chart renders with candlesticks
- New candle every minute
- Current candle updates in real-time
- Browser console shows regular updates
- Backend logs show price ticks
- Connection status = "CONNECTED"

### ❌ FAIL Indicators:
- Chart shows "No Data Available"
- No updates after 2 minutes
- Console shows errors (red text)
- Connection status = "DISCONNECTED"
- Backend not receiving data

---

## TROUBLESHOOTING

### Problem: Chart shows "No Data Available"
**Quick Fix**:
1. Check backend terminal - is it running?
2. Check for errors in backend logs
3. Verify `.env` file has `TWELVE_DATA_API_KEY=02884101fc5646aea4b2af4239448176`
4. Restart backend server

### Problem: Chart freezes after 1 minute
**Quick Fix**:
1. Open browser console (F12)
2. Look for WebSocket errors
3. Check backend logs for disconnections
4. Refresh the browser page

### Problem: Wrong prices or times
**Quick Fix**:
1. Verify system clock is correct
2. Check that times are showing in UTC (Z suffix)
3. Compare with https://twelvedata.com/forex/eurusd

---

## QUICK VALIDATION SCRIPT

**Paste this in browser console after 5 minutes**:

```javascript
// Run after 5 minutes of chart being open
console.clear();
console.log('=== CHART VALIDATION ===');

// Check if chart element exists
const chartContainer = document.querySelector('[class*="candlestick"]');
console.log('Chart element found:', !!chartContainer);

// Check WebSocket status
console.log('Socket exists:', typeof io !== 'undefined');

// Manual check
console.log('\n✅ If you see candlesticks on screen, THE CHART IS WORKING!');
console.log('✅ If candles update every minute, LIVE DATA IS WORKING!');
console.log('✅ If you see this text, JAVASCRIPT IS WORKING!');
```

**Expected Output**:
```
=== CHART VALIDATION ===
Chart element found: true
Socket exists: true
✅ If you see candlesticks on screen, THE CHART IS WORKING!
✅ If candles update every minute, LIVE DATA IS WORKING!
✅ If you see this text, JAVASCRIPT IS WORKING!
```

---

## 5-MINUTE TEST RESULTS

After watching for 5 minutes, answer:

1. **Did the chart render?** [ ] Yes [ ] No
2. **Did you see at least 5 candles?** [ ] Yes [ ] No
3. **Did a new candle appear every minute?** [ ] Yes [ ] No
4. **Did the current candle update multiple times?** [ ] Yes [ ] No
5. **Were there any errors in console?** [ ] Yes [ ] No
6. **Was connection status "CONNECTED"?** [ ] Yes [ ] No

**If all YES except #5**: ✅ **CHART IS WORKING PERFECTLY!**

---

## SCREENSHOT CHECKLIST

Take these screenshots for documentation:

1. **Working Chart** - Full browser window with chart visible
2. **Browser Console** - Showing update logs (F12 → Console)
3. **Network Tab** - WebSocket connection (F12 → Network → WS)
4. **Backend Logs** - Terminal showing price updates

Save to: `docs/screenshots/` or share with team

---

## WHAT TO DO AFTER SUCCESS

1. ✅ Mark `BROWSER_VERIFICATION_CHECKLIST.md` as complete
2. ✅ Update `AUDIT_COMPLETE_SUMMARY.md` with "Browser testing: PASS"
3. ✅ Proceed with production deployment
4. ✅ Set up monitoring/alerting
5. ✅ Document any issues found

---

## WHAT TO DO IF FAILED

1. ❌ Note exact error messages
2. ❌ Check both backend and frontend logs
3. ❌ Try basic troubleshooting above
4. ❌ If still failing, run: `npm run test-twelve-data-websocket.js` for diagnosis
5. ❌ Review `PRODUCTION_AUDIT_REPORT.md` Section 11 (Troubleshooting)

---

## EXPECTED TIMELINE

```
00:00 - Start servers
02:00 - Backend connected to Twelve Data
03:00 - Frontend loaded, chart visible
05:00 - 3 candles received
08:00 - Symbol switch test complete
10:00 - All tests complete ✅
```

**Total**: 10 minutes from start to verified success

---

## SUPPORT COMMANDS

### Check if servers are running:
```powershell
# Check backend
netstat -ano | findstr :3001

# Check frontend  
netstat -ano | findstr :3000
```

### Restart everything:
```bash
# Kill all node processes (Windows)
taskkill /F /IM node.exe

# Restart backend
cd apps/api && npm run start:dev

# Restart frontend (new terminal)
cd apps/web && npm run dev
```

### Check Twelve Data directly:
```bash
# Test API key
node PRODUCTION_AUDIT.js
```

---

## FINAL CHECK

Before closing, verify:

- [ ] Chart worked for at least 5 minutes continuously
- [ ] No errors in browser console
- [ ] No errors in backend logs
- [ ] Screenshots taken
- [ ] Results documented

**If all checked**: 🎉 **CONGRATULATIONS! Your live chart is working!**

---

**Quick Start Guide Version**: 1.0  
**Last Updated**: 2026-11-12  
**Next Step**: Complete full `BROWSER_VERIFICATION_CHECKLIST.md` for production readiness
