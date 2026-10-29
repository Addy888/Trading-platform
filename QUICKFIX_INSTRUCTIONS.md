# QUICK FIX: Market Data "Quota Exhausted" Error

## Problem
Trading page shows "Quota exhausted" error even though the API is working.

## Root Cause
Stale browser localStorage cache from a previous session.

## Solution (Choose ONE)

### Option 1: Use the Reset Button (Easiest)
1. Navigate to the trading page
2. Look for the red "Quota Exhausted" warning
3. Click the **"Reset & Retry"** button
4. Page will reload and charts should work

### Option 2: Clear Browser Cache Manually
1. Press `F12` to open DevTools
2. Go to **Application** tab
3. Expand **Local Storage** in left sidebar
4. Click on your site (`http://localhost:3000` or your domain)
5. Find key: `market_data_quota_state`
6. Right-click → **Delete**
7. Refresh the page (`F5`)

### Option 3: Use Browser Console
1. Press `F12` to open DevTools
2. Go to **Console** tab
3. Paste this command and press Enter:
```javascript
localStorage.removeItem('market_data_quota_state');
location.reload();
```

## Verification

After clearing the cache, you should see:
- ✅ Trading page loads normally (no Access Denied)
- ✅ Chart displays 30 real EUR/USD candles
- ✅ You can change timeframes (1m, 5m, 15m, 1h, 1d)
- ✅ You can change symbols
- ✅ No "quota exhausted" errors in console

## If It Still Doesn't Work

1. **Check Backend is Running**:
```bash
cd apps/api
npm run start:dev
```

2. **Check Frontend is Running**:
```bash
cd apps/web
npm run dev
```

3. **Verify API Key is Working**:
```bash
curl "https://api.twelvedata.com/quote?symbol=EUR/USD&apikey=02884101fc5646aea4b2af4239448176"
```

Should return real EUR/USD rates (not an error).

4. **Check Backend Logs**:
Look for these messages:
- ✅ "Twelve Data provider initialized"
- ✅ "Market Data Manager initialized"
- ✅ "Primary Provider: TWELVE_DATA"

5. **Manual Backend Reset** (if needed):
```bash
# In a separate terminal
curl -X POST http://localhost:3001/api/market/twelvedata/reset \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Technical Details

- **Twelve Data API**: Verified working, 800 calls/day available
- **Provider**: Using TWELVE_DATA as primary
- **Cache TTL**: Quotes 30s, Candles 5min
- **Auto-Recovery**: Now implemented, checks backend status automatically

## Need More Help?

See detailed reports in `docs/` folder:
- `LIVE_MARKET_DATA_AND_ACCESS_RECOVERY_REPORT.md` - Complete analysis
- `TRADINGVIEW_REAL_DATA_FIX_REPORT.md` - Initial investigation

---

**Last Updated**: October 15, 2026  
**Status**: ✅ Fixed - Just clear browser cache
