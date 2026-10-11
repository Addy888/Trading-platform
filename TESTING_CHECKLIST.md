# Market Data Fix - Testing Checklist

## Pre-Test Setup

### ✅ Server Status
- [ ] API server running on port 3001
  - Command: `cd apps/api && npm run start:dev`
  - Check: http://localhost:3001/api/health should return `{"status":"ok"}`
  
- [ ] Frontend running on port 3000
  - Command: `cd apps/web && npm run dev`
  - Check: http://localhost:3000 should load login page

### ✅ Environment Configuration
- [ ] `.env` file exists in `apps/api/`
- [ ] `TWELVE_DATA_API_KEY` is set to: `02884101fc5646aea4b2af4239448176`
- [ ] `MARKET_DATA_PROVIDER` is set to: `TWELVE_DATA`

---

## Test 1: Application Access

### Login
- [ ] Navigate to http://localhost:3000
- [ ] Enter credentials and login successfully
- [ ] Dashboard loads without errors

### Trading Account Selection
- [ ] Click "Trading" in sidebar
- [ ] See list of trading accounts
- [ ] Click on any account
- [ ] Trading terminal loads successfully

**Expected Result:** Trading terminal displays with 3 panels: Market Watch (left), Chart (center), Order Panel (right)

---

## Test 2: Market Data Source Selection

### LIVE Mode Verification
- [ ] Look at right sidebar "Market Data Source" section
- [ ] "🌐 LIVE" button is highlighted in GREEN
- [ ] "🎮 Simulated" button is gray

### Provider Status Check
- [ ] Provider status shows: "Provider: TWELVE_DATA"
- [ ] Shows number of cached quotes (e.g., "Quotes Cached: 5")
- [ ] Shows number of cached candles (e.g., "Candles Cached: 8")
- [ ] Status shows: "🔄 Active" (green)

**Expected Result:** LIVE mode is active with Twelve Data provider

---

## Test 3: Symbol Selection and Quote Display

### Select EUR/USD
- [ ] Look at Market Watch (left sidebar)
- [ ] Click on "EUR/USD" symbol
- [ ] Symbol is highlighted
- [ ] Bid/Ask prices are displayed
- [ ] Prices look realistic (around 1.12xxx)
- [ ] Spread is small (around 0.0001-0.0002)

### Quote Updates
- [ ] Wait 20-30 seconds
- [ ] Prices should update automatically
- [ ] Notice small changes in bid/ask values

**Expected Result:** Live EUR/USD quotes displayed and updating

---

## Test 4: Timeframe Testing (CRITICAL)

Test each timeframe button individually:

### 1-Minute Timeframe
- [ ] Click "1m" button
- [ ] Button turns BLUE (selected)
- [ ] Chart updates within 2-3 seconds
- [ ] Chart displays candlestick bars
- [ ] Chart header shows: "EUR/USD 1m • X candles"
- [ ] Candles are very narrow (1-minute intervals)

### 5-Minute Timeframe
- [ ] Click "5m" button
- [ ] Button turns BLUE
- [ ] Chart updates
- [ ] Candles are wider than 1m

### 10-Minute Timeframe ⭐ (NEW)
- [ ] Click "10m" button
- [ ] Button turns BLUE
- [ ] Chart updates successfully
- [ ] No errors in console

### 15-Minute Timeframe
- [ ] Click "15m" button
- [ ] Button turns BLUE
- [ ] Chart updates

### 30-Minute Timeframe ⭐ (NEW)
- [ ] Click "30m" button
- [ ] Button turns BLUE
- [ ] Chart updates successfully
- [ ] No errors in console

### 1-Hour Timeframe
- [ ] Click "1H" button
- [ ] Button turns BLUE
- [ ] Chart updates
- [ ] Candles show clear price movement

### 4-Hour Timeframe
- [ ] Click "4H" button
- [ ] Button turns BLUE
- [ ] Chart updates
- [ ] Fewer candles displayed (longer timeframe)

### Daily Timeframe
- [ ] Click "1D" button
- [ ] Button turns BLUE
- [ ] Chart updates
- [ ] Shows many days of data

**Expected Result:** All 8 timeframes work without errors

---

## Test 5: Chart Verification

### Chart Display
- [ ] Candlestick bars are visible
- [ ] Green candles for up movements
- [ ] Red candles for down movements
- [ ] Chart has grid lines
- [ ] Time axis at bottom
- [ ] Price axis on right

### Chart Header
- [ ] Top-left shows: "EUR/USD"
- [ ] Shows selected timeframe (e.g., "1H")
- [ ] Shows candle count (e.g., "• 100 candles")

### Interactive Features
- [ ] Hover over candles shows crosshair
- [ ] Can scroll/pan the chart
- [ ] Can zoom in/out (if supported)

**Expected Result:** Professional-looking chart with real data

---

## Test 6: Mode Switching

### Switch to Simulated Mode
- [ ] Click "🎮 Simulated" button
- [ ] Button turns BLUE
- [ ] "🌐 LIVE" button turns gray
- [ ] Chart still displays data
- [ ] Bottom text says: "Using simulated market data"

### Switch Back to LIVE Mode
- [ ] Click "🌐 LIVE" button
- [ ] Button turns GREEN
- [ ] Chart updates with real data
- [ ] Provider status appears again

**Expected Result:** Seamless switching between modes

---

## Test 7: Other Symbols (if available)

Try other forex pairs from market watch:

### GBP/USD
- [ ] Click "GBP/USD" in market watch
- [ ] Chart updates to show GBP/USD
- [ ] Prices look realistic (around 1.28xxx)
- [ ] Multiple timeframes work

### USD/JPY
- [ ] Click "USD/JPY" in market watch
- [ ] Chart updates to show USD/JPY
- [ ] Prices look realistic (around 150.xxx)
- [ ] Multiple timeframes work

**Expected Result:** Multiple forex pairs supported

---

## Test 8: Error Handling

### Quota Exhaustion (If it occurs)
If you see a red banner:
- [ ] Banner says "Market Data Quota Exhausted"
- [ ] Error message is clear and helpful
- [ ] Recommends switching to Simulated mode
- [ ] Chart shows "No Chart Data Available"

**Expected Behavior:** Clear error message, not silent failure

### Network Error Simulation
- [ ] Open browser DevTools (F12)
- [ ] Go to Network tab
- [ ] Throttle to "Offline" mode
- [ ] Try changing timeframe
- [ ] Should see error message
- [ ] Switch back to "Online"

**Expected Result:** Error is caught and displayed

---

## Test 9: Performance Check

### Response Times
- [ ] Timeframe changes happen within 1-3 seconds
- [ ] No long delays or timeouts
- [ ] Quote updates are smooth

### Console Errors
- [ ] Open browser DevTools (F12)
- [ ] Go to Console tab
- [ ] Should see NO red errors
- [ ] May see blue logs (informational)

**Expected Result:** Fast, responsive UI with no errors

---

## Test 10: Account Trading (Simulated)

### Verify Trading Still Works
- [ ] Ensure trading account status is "ACTIVE"
- [ ] Order panel on right is enabled
- [ ] Can select BUY or SELL
- [ ] Can enter volume
- [ ] Submit order (in SIMULATED execution mode)
- [ ] Order appears in positions table

**Expected Result:** Trading functionality unaffected by LIVE market data

---

## Browser Compatibility Test

Test in different browsers:

### Chrome
- [ ] All features work
- [ ] Chart displays correctly
- [ ] No console errors

### Firefox
- [ ] All features work
- [ ] Chart displays correctly
- [ ] No console errors

### Edge
- [ ] All features work
- [ ] Chart displays correctly
- [ ] No console errors

**Expected Result:** Works in all modern browsers

---

## API Endpoint Test (Advanced)

### Direct API Testing

Open a terminal and run:

```bash
# Test health
curl http://localhost:3001/api/health

# Test Twelve Data provider (requires token)
# Get token first by logging in via UI, then check browser DevTools > Application > Local Storage
curl "http://localhost:3001/api/market/twelvedata/status" -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Result:** API responds with valid JSON

---

## Regression Test

### Existing Features Still Work
- [ ] Dashboard loads
- [ ] Analytics page works
- [ ] Admin panel accessible (if admin)
- [ ] User settings can be changed
- [ ] Notifications work
- [ ] WebSocket connection stable

**Expected Result:** No existing features broken

---

## Edge Cases

### Very Small Timeframes
- [ ] Switch rapidly between 1m and 5m
- [ ] No errors or crashes
- [ ] Cache works correctly

### Very Large Timeframes
- [ ] Switch from 1m to 1D directly
- [ ] Chart adjusts correctly
- [ ] Shows appropriate date range

### Long Running Session
- [ ] Leave page open for 10 minutes
- [ ] Quotes continue updating
- [ ] No memory leaks
- [ ] Provider status stays active

**Expected Result:** Stable under various conditions

---

## Documentation Check

### Files to Review
- [ ] Read `MARKET_DATA_FIX_SUMMARY.md`
- [ ] Read `VERIFICATION_RESULTS.md`
- [ ] Read `ARCHITECTURE_DIAGRAM.txt`

### Understanding
- [ ] Understand the data flow
- [ ] Know what to do if quota exhausted
- [ ] Know supported timeframes
- [ ] Know how to switch modes

**Expected Result:** Full understanding of the implementation

---

## Sign-Off Checklist

Before considering testing complete:

### Functionality
- [ ] ✅ All 8 timeframes work (1m, 5m, 10m, 15m, 30m, 1H, 4H, 1D)
- [ ] ✅ Real EUR/USD data displays
- [ ] ✅ Chart renders correctly
- [ ] ✅ Provider status is visible
- [ ] ✅ Mode switching works
- [ ] ✅ Error handling is clear

### Performance
- [ ] ✅ Response times < 3 seconds
- [ ] ✅ No memory leaks
- [ ] ✅ Cache is working

### Stability
- [ ] ✅ No crashes
- [ ] ✅ No console errors
- [ ] ✅ WebSocket stable

### Documentation
- [ ] ✅ Summary documents reviewed
- [ ] ✅ Architecture understood
- [ ] ✅ Testing completed

---

## Issues Log

If you encounter any issues during testing, document them here:

### Issue 1
- **Description:** 
- **Steps to Reproduce:** 
- **Expected Behavior:** 
- **Actual Behavior:** 
- **Screenshot/Error:** 
- **Workaround:** 

### Issue 2
- **Description:** 
- **Steps to Reproduce:** 
- **Expected Behavior:** 
- **Actual Behavior:** 
- **Screenshot/Error:** 
- **Workaround:** 

---

## Success Criteria

Mark as ✅ when verified:

- [ ] ✅ Real market data displays (not fake/simulated)
- [ ] ✅ All 8 timeframes supported and working
- [ ] ✅ Chart renders genuine EUR/USD candles
- [ ] ✅ Provider name "TWELVE_DATA" visible
- [ ] ✅ Data timestamps shown
- [ ] ✅ Error messages are clear
- [ ] ✅ Quota protection works
- [ ] ✅ Mode switching is seamless
- [ ] ✅ Performance is good
- [ ] ✅ No existing features broken

---

## Final Verification

When all tests pass:

```
✅ MARKET DATA FIX VERIFIED AND WORKING

Tester: ___________________
Date: _____________________
Time: _____________________

Signature: ________________
```

---

## Quick Troubleshooting

### Chart Shows "No Chart Data Available"
**Solutions:**
1. Check if LIVE mode is selected
2. Check provider status (should be "Active")
3. Check browser console for errors
4. Try switching to Simulated mode
5. Check if API server is running

### Quotes Not Updating
**Solutions:**
1. Check "Market: CONNECTED" indicator in top bar
2. Refresh the page
3. Check WebSocket connection status
4. Check provider status

### Timeframe Button Does Nothing
**Solutions:**
1. Check browser console for errors
2. Check if quota is exhausted
3. Try a different timeframe
4. Switch to Simulated mode

### Red Warning Banner Appears
**Solutions:**
1. Read the error message
2. If quota exhausted: Switch to Simulated mode
3. If network error: Check internet connection
4. If API error: Check API server logs

---

## Support Contact

If you encounter issues that cannot be resolved:

1. Check browser console (F12) for detailed error messages
2. Check API server logs in terminal
3. Review the documentation files
4. Check the network tab for failed requests
5. Try in a different browser

---

## Testing Complete! 🎉

Once all checkboxes are marked, the market data fix is verified and production-ready for paper trading with real market data.
