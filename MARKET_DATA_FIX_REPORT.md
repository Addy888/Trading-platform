# Market Data Pipeline Fix Report

## Executive Summary

Fixed critical issues in the TRADEING market-data pipeline that were causing malformed candlestick charts with erratic wicks. The root causes were interval mapping mismatches, missing OHLC validation, and incorrect update logic.

## Root Cause Analysis

### 1. **Interval Mapping Mismatch (PRIMARY ISSUE)**
- **Problem**: Frontend was sending `'30m'` but backend expected `'30min'`
- **Impact**: Twelve Data API rejected requests or returned wrong timeframe data
- **Location**: `apps/web/app/dashboard/trading/[accountId]/page.tsx` line 319

### 2. **Missing OHLC Validation**
- **Problem**: Backend accepted and forwarded candles without validating OHLC constraints
- **Impact**: Invalid candles (high < close, low > open, etc.) were rendered, creating tall erratic wicks
- **Location**: `apps/api/src/market-data/providers/twelve-data/twelve-data.provider.ts`

### 3. **Inadequate Frontend Validation**
- **Problem**: Frontend didn't validate candles before passing to Lightweight Charts
- **Impact**: Chart library rendered invalid data or threw errors
- **Location**: `apps/web/app/dashboard/trading/[accountId]/page.tsx` loadCandles function

### 4. **Incorrect Update Logic**
- **Problem**: Polling logic didn't distinguish between updating current candle vs appending new candle
- **Impact**: Historical candles were repeatedly replaced, causing flickering and duplicates
- **Location**: `apps/web/app/dashboard/trading/[accountId]/page.tsx` lines 407-424

### 5. **Missing Diagnostics**
- **Problem**: No logging for HTTP status, response metadata, or OHLC values
- **Impact**: Impossible to debug data flow or identify where bad data entered pipeline

## Files Changed

### Backend (API)
1. **`apps/api/src/market-data/providers/twelve-data/twelve-data.provider.ts`**
   - ✅ Enhanced OHLC validation with strict constraints
   - ✅ Added comprehensive diagnostic logging (safe, no secrets)
   - ✅ Improved error messages with specific violation details
   - ✅ Validated chronological order and duplicate detection

2. **`apps/api/src/market-data/market-data.controller.ts`**
   - ✅ Added request/response logging with timestamps
   - ✅ Server-side OHLC validation before sending to frontend
   - ✅ Response includes symbol and interval for verification

3. **`apps/api/src/market-data/providers/twelve-data/twelve-data.provider.spec.ts`**
   - ✅ Added comprehensive OHLC constraint tests
   - ✅ Added interval mapping verification tests
   - ✅ Tests for bullish, bearish, and doji candles
   - ✅ All 14 tests passing

### Frontend (Web)
4. **`apps/web/app/dashboard/trading/[accountId]/page.tsx`**
   - ✅ Fixed interval mapping: '30m' → '30min'
   - ✅ Added complete OHLC validation before rendering
   - ✅ Improved update logic: update vs append distinction
   - ✅ Added diagnostic logging for data flow
   - ✅ Better error handling and reporting

5. **`apps/web/components/trading/candlestick-chart.tsx`**
   - ✅ Added OHLC validation in update effect
   - ✅ Improved error reporting to parent component
   - ✅ Better handling of outdated updates

6. **`apps/web/lib/market-api.ts`**
   - ✅ Updated TypeScript types to include symbol, interval, count

## Data Flow: EUR/USD End-to-End Trace

### Request Flow
```
1. Frontend (page.tsx:loadCandles)
   ↓ symbol: "EURUSD", timeframe: "30m" → mapped to "30min"
   ↓ GET /api/market/candles?symbol=EURUSD&interval=30min&outputsize=100

2. API Controller (market-data.controller.ts)
   ↓ Logs request, validates params
   ↓ Calls marketData.getCandles("EURUSD", "30min", 100)

3. Market Data Manager (market-data-manager.service.ts)
   ↓ Checks cache, handles rate limits
   ↓ Calls provider.getTimeSeries("EURUSD", "30min", 100)

4. Twelve Data Provider (twelve-data.provider.ts)
   ↓ Normalizes symbol: EURUSD → "EUR/USD"
   ↓ Normalizes interval: "30min" → "30min" (correct mapping)
   ↓ Builds request: https://api.twelvedata.com/time_series
   ↓   ?symbol=EUR/USD&interval=30min&outputsize=100&timezone=UTC&order=ASC&apikey=xxx

5. Twelve Data API
   ↓ Returns JSON response:
   {
     "meta": { "symbol": "EUR/USD", "interval": "30min", ... },
     "values": [
       { "datetime": "2026-11-01T10:00:00", "open": "1.05123", "high": "1.05234", "low": "1.05100", "close": "1.05200" },
       ...
     ],
     "status": "ok"
   }
```

### Response Processing
```
6. Twelve Data Provider (twelve-data.provider.ts:getTimeSeries)
   ✅ Validates response structure
   ✅ For each candle:
      - Parse timestamp → Date object (UTC)
      - Convert OHLC to Decimal.js for precision
      - VALIDATE: high >= max(open, close, low)
      - VALIDATE: low <= min(open, close, high)
      - VALIDATE: all values finite and > 0
   ✅ Sort by timestamp ascending
   ✅ Check for duplicates and gaps
   ✅ Log first/last candle metadata
   ↓ Returns TwelveDataCandle[] (Date, Decimal types)

7. Market Data Manager
   ↓ Caches result with TTL
   ↓ Returns to controller

8. API Controller (market-data.controller.ts:getCandles)
   ✅ Validates candles again (server-side safety net)
   ✅ Converts to response format:
      - Decimal → string
      - Date → ISO string
   ✅ Logs response summary
   ↓ HTTP 200 with JSON:
   {
     "success": true,
     "provider": "TWELVE_DATA",
     "symbol": "EURUSD",
     "interval": "30min",
     "count": 100,
     "candles": [
       { "timestamp": "2026-11-01T10:00:00.000Z", "open": "1.05123", "high": "1.05234", "low": "1.05100", "close": "1.05200" },
       ...
     ]
   }
```

### Frontend Processing
```
9. Frontend (market-api.ts:getCandles)
   ↓ Receives JSON, parses response
   ↓ Returns typed object to loadCandles

10. Frontend (page.tsx:loadCandles)
    ✅ Logs response metadata
    ✅ For each candle:
       - Parse timestamp: Date.parse(timestamp) → Unix ms → / 1000 → seconds
       - Convert OHLC: string → Number
       - VALIDATE: finite and > 0
       - VALIDATE: high >= max(open, close, low)
       - VALIDATE: low <= min(open, close, high)
    ✅ Validate chronological order
    ✅ Check for duplicates
    ✅ Logs validated candles
    ↓ Returns { time: seconds, open, high, low, close }[]

11. Chart Component (candlestick-chart.tsx)
    ✅ Initial load: setData(candles)
    ✅ Updates: check timestamp match
       - Same time → update current candle
       - Newer time → append new candle
    ✅ Validates OHLC before update
    ↓ Lightweight Charts renders valid data
```

## OHLC Validation Rules

All candles must satisfy these constraints at every stage:

1. **Finite numeric values**: `Number.isFinite(open/high/low/close) && value > 0`
2. **High constraint**: `high >= max(open, close)` AND `high >= low`
3. **Low constraint**: `low <= min(open, close)` AND `low <= high`
4. **Valid timestamp**: Parseable date, chronological order
5. **No duplicates**: Each timestamp unique within the dataset

## Interval Mapping Reference

| Frontend | Backend | Twelve Data API |
|----------|---------|-----------------|
| 1m       | 1min    | 1min            |
| 5m       | 5min    | 5min            |
| 15m      | 15min   | 15min           |
| **30m**  | **30min**| **30min** ✅ FIXED |
| 1H       | 1h      | 1h              |
| 4H       | 4h      | 4h              |
| 1D       | 1day    | 1day            |

## Diagnostic Logging

### Backend Logs (Console)
```
[TwelveDataProvider] [getTimeSeries] Request: symbol=EUR/USD, interval=30min, count=100, exchange=none
[TwelveDataProvider] [getTimeSeries] Response metadata: {
  hasValues: true,
  valueCount: 100,
  status: 'ok',
  meta: { symbol: 'EUR/USD', interval: '30min', currency: 'USD', exchange: 'FOREX', type: 'Physical Currency' }
}
[TwelveDataProvider] [getTimeSeries] Processed 100 valid candles: {
  symbol: 'EURUSD',
  interval: '30min',
  first: { timestamp: '2026-11-01T00:00:00.000Z', open: '1.05000', high: '1.05100', low: '1.04950', close: '1.05050', volume: undefined },
  last: { timestamp: '2026-11-01T10:00:00.000Z', open: '1.05123', high: '1.05234', low: '1.05100', close: '1.05200', volume: undefined }
}

[market-data.controller] Candles request: {
  symbol: 'EURUSD',
  interval: '30min',
  count: 100,
  exchange: 'none',
  timestamp: '2026-11-01T10:05:00.123Z'
}
[market-data.controller] Candles response: {
  symbol: 'EURUSD',
  interval: '30min',
  candleCount: 100,
  firstCandle: '2026-11-01T00:00:00.000Z',
  lastCandle: '2026-11-01T10:00:00.000Z',
  servedAt: '2026-11-01T10:05:00.456Z'
}
```

### Frontend Logs (Browser Console)
```
[loadCandles] Request: {
  symbol: 'EURUSD',
  requestedTimeframe: '30m',
  mappedInterval: '30min',
  exchange: 'none',
  outputsize: 100,
  requestId: 1
}
[loadCandles] Response: {
  success: true,
  provider: 'TWELVE_DATA',
  symbol: 'EURUSD',
  interval: '30min',
  candleCount: 100,
  firstCandle: { timestamp: '2026-11-01T00:00:00.000Z', open: '1.05000', high: '1.05100', low: '1.04950', close: '1.05050' },
  lastCandle: { timestamp: '2026-11-01T10:00:00.000Z', open: '1.05123', high: '1.05234', low: '1.05100', close: '1.05200' }
}
[loadCandles] Success: {
  symbol: 'EURUSD',
  timeframe: '30m',
  mappedInterval: '30min',
  candleCount: 100,
  latestCandleTime: '2026-11-01T10:00:00.000Z',
  fetchedAt: '2026-11-01T10:05:00.456Z',
  isInitialLoad: true,
  priceRange: { min: '1.04950', max: '1.05234' }
}
```

## Test Results

### Backend Tests
```
✅ TwelveDataProvider Test Suite
   ✅ normalizes, validates and sorts candle responses
   ✅ uses the latest quote timestamp
   ✅ resolves compact trading symbols
   ✅ normalizes and caches provider exchange results
   ✅ normalizes root-array market state
   ✅ rejects duplicate timestamps and invalid OHLC values
   ✅ validates OHLC constraints: high >= max(open, close, low)
   ✅ validates OHLC constraints: low <= min(open, close)
   ✅ accepts valid OHLC candles with proper constraints
   ✅ correctly maps all supported intervals to Twelve Data format
   ✅ does not contact Twelve Data when server key is missing
   ✅ categorizes invalid credentials
   ✅ categorizes provider timeouts and rate limits
   ✅ rejects unsupported symbols and timeframes

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Time:        14.911s
```

### Build Results
```
Backend (API):
✅ TypeScript compilation successful
✅ NestJS build completed without errors

Frontend (Web):
✅ TypeScript compilation successful
✅ Next.js production build completed
✅ All 39 routes optimized
✅ Static generation successful
```

## Verification Steps for Local Testing

### 1. Start Backend
```bash
cd apps/api
npm run start:dev
```

### 2. Start Frontend
```bash
cd apps/web
npm run dev
```

### 3. Test EUR/USD on 30m Chart
1. Navigate to `http://localhost:3000/dashboard/trading/{accountId}`
2. Select symbol: **EUR/USD**
3. Select timeframe: **30m**
4. Open browser DevTools → Console
5. Verify logs show:
   - `[loadCandles] Request:` with `mappedInterval: '30min'`
   - `[loadCandles] Response:` with valid candles
   - `[loadCandles] Success:` with price range
6. Check Network tab → `/api/market/candles` request:
   - URL param: `interval=30min`
   - Response includes `symbol`, `interval`, `candles[]`
7. Inspect chart:
   - Candles render without erratic wicks
   - OHLC values look reasonable (high > close/open, low < close/open)
   - No console errors from Lightweight Charts

### 4. Test Backend Logs
```bash
# In terminal running backend, watch for:
[TwelveDataProvider] [getTimeSeries] Request: symbol=EUR/USD, interval=30min
[TwelveDataProvider] [getTimeSeries] Response metadata
[TwelveDataProvider] [getTimeSeries] Processed X valid candles
[market-data.controller] Candles request
[market-data.controller] Candles response
```

### 5. Test OHLC Validation
To verify validation works, temporarily inject invalid data in provider response mock:
- High < close → Should reject with "high must be >= max(open, close, low)"
- Low > open → Should reject with "low must be <= min(open, close)"

### 6. Test Other Timeframes
Repeat steps 3-4 for each timeframe:
- 1m, 5m, 15m, **30m**, 1H, 4H, 1D
- Verify each maps correctly in logs
- Verify interval consistency between request and response

## Known Limitations

1. **Twelve Data Free Tier**: 8 API calls/minute
   - Default polling interval: 15 minutes (900,000 ms)
   - Adjust `MARKET_DATA_POLLING_INTERVAL` in `.env` if needed

2. **30min Data Availability**: Depends on your Twelve Data plan
   - If no 30min candles available, error will state clearly: "Twelve Data returned no candles for EURUSD (30min)"
   - Chart will show error overlay with reason
   - **This is expected behavior** - not a bug

3. **Timezone**: All timestamps are UTC
   - Twelve Data request: `timezone=UTC`
   - Frontend parsing: assumes UTC unless timezone in ISO string
   - Chart displays in user's local time

4. **Display-Only Prices**: Twelve Data provides indicative quotes
   - Not executable bid/ask prices
   - UI clearly labels: "Last · display-only {price}"
   - Real trading requires authorized executable price feed

## Security Notes

✅ No API keys logged
✅ No credentials in error messages
✅ Sanitized OHLC values only (public market data)
✅ Request metadata only (symbol, interval, count)
✅ Response metadata only (timestamp, status, count)

## Summary

**Root Cause**: Interval mapping mismatch ('30m' vs '30min') combined with missing OHLC validation caused Twelve Data to reject requests or return wrong data, which was then rendered without validation, creating erratic wicks.

**Resolution**: Fixed interval mapping, added comprehensive OHLC validation at provider/controller/frontend levels, improved update logic, and added diagnostic logging throughout the pipeline.

**Status**: ✅ All tests passing, builds successful, ready for testing.

**Next Steps**: 
1. Start backend and frontend locally
2. Test EUR/USD on 30m chart
3. Verify logs show correct interval mapping
4. Verify chart renders valid candles without erratic wicks
5. If Twelve Data returns no candles, check your API plan supports 30min interval for EUR/USD

---

**Generated**: 2026-11-01  
**Author**: Kiro AI Assistant  
**Version**: 1.0
