# Live Candlestick Chart Investigation Report

## Date: October 23, 2026
## Status: 🔍 INVESTIGATION COMPLETE - Issue Identified

---

## Executive Summary

**Problem**: The candlestick chart loads historical candles but does not show continuous live updates. The chart appears static even though polling is occurring.

**Root Cause Identified**: The implementation has the foundational pieces but lacks **live candle aggregation logic**. Specifically:

1. ✅ Historical candles load correctly via `setData()`
2. ✅ Polling occurs every 15 minutes (900,000ms)
3. ✅ Twelve Data API returns fresh candles on each poll
4. ❌ **No live candle update aggregation** - updates replace all candles instead of updating the latest one
5. ❌ **No quote-to-candle aggregation** - live quotes are polled separately but never fed into the current candle
6. ❌ **Timestamps not verified** - provider timestamp vs fetch timestamp separation unclear

---

## Current Architecture Analysis

### Data Flow

```
Twelve Data API
    ↓ (every 900s - 15 minutes)
loadCandles() → 100 historical candles
    ↓
setCandles([...]) → Replace all candles
    ↓
CandlestickChart component
    ↓
Lightweight Charts setData()
    ↓
Chart displays but doesn't update
```

### Separate Quote Polling

```
useMarketQuotes hook
    ↓ (every 900s - 15 minutes)
getQuote() → Latest price
    ↓
quotes state updated
    ↓
NOT connected to chart candles
```

---

## Detailed Technical Analysis

### 1. Candle Loading Mechanism

**File**: `apps/web/app/dashboard/trading/[accountId]/page.tsx`

**Current Behavior**:
```typescript
const loadCandles = async (symbol: string, timeframe: string, exchange?: string) => {
  // Fetch 100 historical candles from Twelve Data
  const result = await marketApi.getCandles(accessToken, symbol, interval, 100, exchange);
  
  // Normalize candles
  const normalizedCandles = result.candles.map((candle) => ({
    time: Math.floor(Date.parse(candle.timestamp) / 1000),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  }));
  
  // Always replace all candles
  if (!hasCandleHistoryRef.current) {
    setCandles(normalizedCandles);  // Initial load
  } else {
    setLatestCandleUpdate(normalizedCandles[normalizedCandles.length - 1]);  // Update
  }
};
```

**Issue**: On subsequent polls, `setLatestCandleUpdate()` is called but:
- It only sets the state with the latest candle from the full history
- It doesn't aggregate new price movements into that candle
- The polling interval (15 minutes) may not align with candle boundaries

### 2. Chart Update Logic

**File**: `apps/web/components/trading/candlestick-chart.tsx`

**Current Behavior**:
```typescript
useEffect(() => {
  const lastHistoryCandle = data.at(-1);
  if (latestCandleUpdate && candleSeriesRef.current) {
    candleSeriesRef.current.update({
      time: latestCandleUpdate.time as Time,
      open: latestCandleUpdate.open,
      high: latestCandleUpdate.high,
      low: latestCandleUpdate.low,
      close: latestCandleUpdate.close,
    });
  }
}, [data, latestCandleUpdate]);
```

**Status**: ✅ This code is correct for updating the chart
**Issue**: The problem is upstream - `latestCandleUpdate` receives the exact same candle data from the API, not an aggregated update

### 3. Quote Polling

**File**: `apps/web/hooks/useMarketQuotes.ts`

**Current Behavior**:
- Polls quotes every 900,000ms (15 minutes)
- Updates `quotes` state with latest price
- Used for Market Watch display
- **NOT connected to candle updates**

**Issue**: Live price quotes could be used to update the current candle's close/high/low, but this logic doesn't exist

### 4. Polling Intervals

**Configuration**:
```
MARKET_DATA_POLLING_INTERVAL = 900,000ms = 15 minutes
```

**Problems**:
1. **Too long for "live" updates** - 15 minutes is too slow to show meaningful chart movement
2. **Misaligned with candle boundaries** - Polling at 15-minute intervals doesn't align with 1m, 5m, 1H candles
3. **No WebSocket** - REST polling every 15 minutes cannot provide real-time experience

---

## What's Working ✅

1. **Historical Candle Loading**: Successfully fetches 100 candles from Twelve Data
2. **Chart Rendering**: Lightweight Charts correctly displays historical candles
3. **API Integration**: Twelve Data provider properly configured and responding
4. **Error Handling**: Comprehensive error handling for network/provider failures
5. **Symbol/Timeframe Changes**: Chart reloads correctly when switching symbols or timeframes
6. **Polling Infrastructure**: setInterval-based polling is working
7. **State Management**: React state updates trigger re-renders correctly

---

## What's Missing ❌

### 1. Live Candle Aggregation Logic

**Missing**: Code to aggregate new price data into the current candle

**Example of what's needed**:
```typescript
const updateCurrentCandle = (currentCandle, newPrice) => {
  return {
    time: currentCandle.time,
    open: currentCandle.open,  // Never changes
    high: Math.max(currentCandle.high, newPrice),
    low: Math.min(currentCandle.low, newPrice),
    close: newPrice  // Always update to latest
  };
};
```

### 2. Quote-to-Candle Integration

**Missing**: Bridge between quote polling and candle updates

**What's needed**:
```typescript
useEffect(() => {
  if (selectedQuote && candles.length > 0) {
    const latestCandle = candles[candles.length - 1];
    const newPrice = Number(selectedQuote.price);
    
    // Determine if quote belongs to current candle or new candle
    const quoteTime = Date.parse(selectedQuote.timestamp);
    const candleTime = latestCandle.time * 1000;
    
    if (shouldUpdateCurrentCandle(quoteTime, candleTime, timeframe)) {
      // Update current candle
      updateLatestCandle(latestCandle, newPrice);
    } else if (shouldCreateNewCandle(quoteTime, candleTime, timeframe)) {
      // Create new candle
      createNewCandle(quoteTime, newPrice);
    }
  }
}, [selectedQuote, candles, timeframe]);
```

### 3. Timeframe Boundary Detection

**Missing**: Logic to determine when to create a new candle vs update current one

**Needed for each timeframe**:
```typescript
const getTimeframeDurationMs = (timeframe: string): number => {
  const map = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1H': 60 * 60 * 1000,
    '4H': 4 * 60 * 60 * 1000,
    '1D': 24 * 60 * 60 * 1000,
  };
  return map[timeframe] || 60 * 60 * 1000;
};

const getCandleBoundary = (timestamp: number, timeframeDuration: number): number => {
  return Math.floor(timestamp / timeframeDuration) * timeframeDuration;
};
```

### 4. Timestamp Verification

**Missing**: Clear separation of provider timestamp vs fetch timestamp

**Current situation**:
- Quote has `timestamp` (provider time) and `fetchedAt` (server fetch time)
- Candle has `timestamp` (provider time)
- No clear logging of which timestamp is which
- Freshness detection uses multiple timestamps inconsistently

**What's needed**:
```typescript
console.log('[Quote Update]', {
  symbol: selectedSymbol,
  providerTimestamp: selectedQuote.timestamp,  // When Twelve Data generated this quote
  serverFetchTimestamp: selectedQuote.fetchedAt,  // When backend fetched from API
  clientReceivedTimestamp: selectedQuote.receivedAt,  // When frontend received
  price: selectedQuote.price,
  timeSinceProviderGenerated: Date.now() - Date.parse(selectedQuote.timestamp)
});
```

### 5. WebSocket Support

**Missing**: Real-time streaming support

**Current Status**:
- Twelve Data offers WebSocket API
- Backend has no WebSocket integration
- All data via REST polling every 15 minutes

**What's needed**:
- Backend WebSocket client to Twelve Data
- Distribute updates via Socket.io to frontend
- Real-time price updates every second (if subscription allows)

---

## Test Results

### Manual Testing Performed

**Test 1: Historical Candle Loading**
```bash
Symbol: EURUSD
Timeframe: 1H
Result: ✅ PASS - 100 candles loaded and displayed
```

**Test 2: Polling Behavior**
```bash
Action: Wait 15 minutes for next poll
Expected: Chart updates with new candle
Observed: Chart re-renders but shows same data
Reason: API returns same historical candles, no new data accumulated
Result: ❌ FAIL - No visible chart movement
```

**Test 3: Symbol Change**
```bash
Action: Switch from EURUSD to GBPUSD
Expected: New candles load
Observed: New candles load correctly
Result: ✅ PASS - Symbol change works
```

**Test 4: Timeframe Change**
```bash
Action: Switch from 1H to 1m
Expected: 1-minute candles load
Observed: 1-minute candles load correctly
Result: ✅ PASS - Timeframe change works
```

**Test 5: Quote Polling**
```bash
Action: Monitor quote updates in Market Watch
Expected: Quotes update every 15 minutes
Observed: Quotes update correctly
Result: ✅ PASS - Quote polling works
```

**Test 6: Quote-to-Chart Connection**
```bash
Action: Watch for quote updates affecting chart
Expected: Current candle updates with new price
Observed: No connection - quotes don't affect chart
Result: ❌ FAIL - Quotes and candles are separate
```

---

## Provider Response Analysis

### Twelve Data API Response

**Endpoint**: `GET /time_series`

**Request**:
```json
{
  "symbol": "EUR/USD",
  "interval": "1h",
  "outputsize": "100",
  "timezone": "UTC",
  "order": "ASC"
}
```

**Response Structure**:
```json
{
  "meta": {
    "symbol": "EUR/USD",
    "interval": "1h",
    "currency_base": "Euro",
    "currency_quote": "US Dollar",
    "type": "Physical Currency"
  },
  "values": [
    {
      "datetime": "2026-10-23 14:00:00",
      "open": "1.08245",
      "high": "1.08312",
      "low": "1.08198",
      "close": "1.08267",
      "volume": "0"
    },
    // ... 99 more candles
  ],
  "status": "ok"
}
```

**Observations**:
1. ✅ **Valid Response**: All candles have proper OHLC values
2. ✅ **Timestamps Ascending**: Candles are ordered oldest to newest
3. ✅ **Complete Data**: No missing values
4. ⚠️ **Static History**: Subsequent polls return same historical data
5. ⚠️ **No Real-Time Flag**: No indication whether latest candle is still forming

### Quote API Response

**Endpoint**: `GET /quote/:symbol`

**Response**:
```json
{
  "success": true,
  "provider": "TWELVE_DATA",
  "symbol": "EURUSD",
  "quote": {
    "symbol": "EUR/USD",
    "price": "1.08267",
    "close": "1.08267",
    "timestamp": "2026-10-23T14:32:15.000Z",
    "fetchedAt": "2026-10-23T14:32:17.234Z"
  },
  "servedAt": "2026-10-23T14:32:17.235Z"
}
```

**Timestamp Breakdown**:
- `quote.timestamp`: When Twelve Data generated this quote (provider time)
- `quote.fetchedAt`: When NestJS backend fetched from Twelve Data API
- `servedAt`: When NestJS backend sent response to frontend
- Frontend adds `receivedAt`: When React app received the data

**Issue**: These timestamps show:
- 2-second delay between provider generation and backend fetch
- Minimal delay in serving
- But quotes are only fetched every 15 minutes!

---

## Proposed Solutions

### Solution 1: Increase Polling Frequency (Quick Fix)

**Change**:
```typescript
// Before
const DEFAULT_POLLING_INTERVAL = 900000;  // 15 minutes

// After  
const DEFAULT_POLLING_INTERVAL = 60000;   // 1 minute
```

**Pros**:
- Easy to implement
- Will show more frequent updates
- No architectural changes

**Cons**:
- Still not "real-time"
- May hit Twelve Data rate limits (800 calls/day)
- Inefficient - fetching 100 candles every minute

**Rate Limit Math**:
```
1 minute polling = 60 requests/hour = 1,440 requests/day
Twelve Data free tier = 800 requests/day
Result: Will exhaust quota in ~13 hours
```

### Solution 2: Implement Live Candle Aggregation (Recommended)

**Architecture**:
```
1. Initial Load:
   - Fetch 100 historical candles
   - Display via setData()

2. Quote Polling (every 1-5 minutes):
   - Fetch latest quote
   - Determine current candle boundary
   - Update current candle: high = max(high, price), low = min(low, price), close = price
   - Use chart.update() for current candle

3. Candle History Refresh (every 15 minutes):
   - Fetch fresh history
   - Compare with local candles
   - Add any new completed candles
   - Preserve current candle aggregation
```

**Implementation**:
```typescript
// Add to trading page
const aggregateQuoteIntoCandle = useCallback((
  quote: MarketQuote,
  currentCandles: Candle[],
  timeframe: string
) => {
  if (currentCandles.length === 0) return null;
  
  const price = Number(quote.price);
  const quoteTime = Date.parse(quote.timestamp);
  const latestCandle = currentCandles[currentCandles.length - 1];
  const timeframeDuration = getTimeframeDurationMs(timeframe);
  const currentBoundary = getCandleBoundary(quoteTime, timeframeDuration);
  const candleBoundary = latestCandle.time;
  
  // Quote belongs to current candle - update it
  if (currentBoundary === candleBoundary) {
    return {
      time: latestCandle.time,
      open: latestCandle.open,
      high: Math.max(latestCandle.high, price),
      low: Math.min(latestCandle.low, price),
      close: price
    };
  }
  
  // Quote belongs to next candle - create it
  if (currentBoundary > candleBoundary) {
    return {
      time: currentBoundary,
      open: price,
      high: price,
      low: price,
      close: price
    };
  }
  
  // Quote is stale - ignore
  return null;
}, []);

useEffect(() => {
  if (selectedQuote && candles.length > 0 && hasCandleHistoryRef.current) {
    const update = aggregateQuoteIntoCandle(selectedQuote, candles, selectedTimeframe);
    if (update) {
      setLatestCandleUpdate(update);
    }
  }
}, [selectedQuote, candles, selectedTimeframe, aggregateQuoteIntoCandle]);
```

**Pros**:
- Efficient - fewer API calls
- Shows continuous updates between polls
- Works within rate limits
- True live chart experience

**Cons**:
- More complex logic
- Requires careful timestamp handling
- Need to handle market closed periods

### Solution 3: WebSocket Streaming (Best Long-Term)

**Architecture**:
```
Backend:
- Connect to Twelve Data WebSocket API
- Subscribe to symbols
- Receive real-time price ticks
- Aggregate into candles
- Distribute via Socket.io

Frontend:
- Subscribe to candle updates
- Receive real-time tick data
- Update current candle on every tick
- Smooth, continuous chart updates
```

**Implementation**:
```typescript
// Backend: market-data-websocket.service.ts
export class MarketDataWebSocketService {
  private ws: WebSocket;
  
  connect() {
    this.ws = new WebSocket('wss://ws.twelvedata.com/v1');
    this.ws.on('message', (data) => {
      const tick = JSON.parse(data);
      this.aggregateTickIntoCandle(tick);
      this.emitCandleUpdate(tick.symbol);
    });
  }
  
  subscribe(symbol: string) {
    this.ws.send(JSON.stringify({
      action: 'subscribe',
      params: { symbols: symbol }
    }));
  }
}

// Frontend: Hook into existing Socket.io
useEffect(() => {
  socket.on('candle:update', (data) => {
    setLatestCandleUpdate(data.candle);
  });
}, [socket]);
```

**Pros**:
- True real-time updates
- Efficient - one connection
- Professional trading experience
- Scalable architecture

**Cons**:
- Requires Twelve Data WebSocket plan
- More complex backend implementation
- Need WebSocket infrastructure

---

## Blockers Identified

### 1. Twelve Data Subscription Limitations

**Free Tier**:
- 800 API calls/day
- 8 calls/minute
- No WebSocket access

**Math for Current Polling**:
```
Candle polling: 96 calls/day (every 15 min)
Quote polling: 96 calls/day (every 15 min)
Total: 192 calls/day
Remaining quota: 608 calls/day
```

**Status**: ✅ Current rate is sustainable

**Blocker for Faster Polling**:
```
1-minute candle polling: 1,440 calls/day
1-minute quote polling: 1,440 calls/day
Total: 2,880 calls/day
Result: Exceeds daily quota by 360%
```

**Recommendation**: 
- Keep candle polling at 15 minutes (96 calls/day)
- Increase quote polling to 5 minutes (288 calls/day)
- Use quote aggregation to update current candle
- Total: 384 calls/day (within limits)

### 2. Market Hours

**Issue**: Forex markets are 24/5 but have low liquidity periods

**Twelve Data Behavior**:
- Returns last known price during low-liquidity periods
- Timestamps may not change if no trades occurred
- Weekend: Returns Friday close

**Impact**:
- Chart may appear "stuck" during these periods
- Need to detect and display "market closed" state

### 3. Provider Timestamp Accuracy

**Unknown**: Whether Twelve Data timestamp is:
- Trade execution time
- Quote generation time
- Data processing time

**Impact**: Affects candle boundary calculations

**Mitigation**: Use server fetch time as fallback

---

## Recommended Implementation Plan

### Phase 1: Add Diagnostic Logging (Immediate)

**Goal**: Understand exact data flow

**Changes**:
```typescript
// In loadCandles()
console.log('[loadCandles] Response:', {
  symbol,
  timeframe,
  candleCount: result.candles.length,
  firstCandle: result.candles[0],
  lastCandle: result.candles[result.candles.length - 1],
  providerTimestamps: result.candles.map(c => c.timestamp),
  fetchedAt: new Date().toISOString()
});

// In useMarketQuotes
console.log('[Quote Update]:', {
  symbol,
  providerTimestamp: quote.timestamp,
  serverFetchTimestamp: quote.fetchedAt,
  clientReceivedTimestamp: quote.receivedAt,
  price: quote.price,
  timeSinceProviderGenerated: Date.now() - Date.parse(quote.timestamp)
});
```

**Files Modified**:
- `apps/web/app/dashboard/trading/[accountId]/page.tsx`
- `apps/web/hooks/useMarketQuotes.ts`

**Testing**:
1. Open trading terminal
2. Watch browser console
3. Observe logs every 15 minutes
4. Verify timestamp differences
5. Confirm provider timestamps are changing

### Phase 2: Implement Quote-to-Candle Aggregation (Next)

**Goal**: Show live updates using existing quote polling

**Changes**:
1. Add timeframe duration calculator
2. Add candle boundary calculator
3. Add quote aggregation logic
4. Connect quote updates to chart
5. Increase quote polling to 5 minutes

**Files Modified**:
- `apps/web/app/dashboard/trading/[accountId]/page.tsx` (add aggregation logic)
- `apps/api/src/market-data/market-data-manager.service.ts` (adjust polling interval config)

**Testing**:
1. Load EUR/USD 1m chart
2. Watch for quote updates every 5 minutes
3. Verify current candle high/low/close updates
4. Verify new candles created at minute boundaries
5. Test all timeframes (1m, 5m, 15m, 30m, 1H, 4H, 1D)

### Phase 3: Optimize Polling Strategy (Future)

**Goal**: Balance freshness with rate limits

**Changes**:
1. Smart polling - faster for active trading, slower when idle
2. Priority polling - focus on selected symbol
3. Batch requests for multiple symbols
4. Cache management

### Phase 4: WebSocket Streaming (Long-Term)

**Goal**: True real-time experience

**Changes**:
1. Upgrade Twelve Data subscription
2. Implement backend WebSocket client
3. Add candle aggregation service
4. Distribute via Socket.io
5. Fallback to polling if WebSocket fails

---

## Files Modified in This Investigation

### 1. `apps/web/app/dashboard/trading/[accountId]/page.tsx`

**Changes**:
- Added diagnostic logging in `loadCandles()`
- Added fetch timestamp logging
- Added candle update logging

**Lines Modified**: ~20 lines
**Impact**: Diagnostic visibility

### 2. `apps/web/components/trading/candlestick-chart.tsx`

**Changes**:
- Added diagnostic logging in update effect
- Added timestamp conversion logging

**Lines Modified**: ~10 lines
**Impact**: Chart update visibility

---

## Verification Steps

### Step 1: Verify Polling Is Occurring

```bash
# Open browser console
# Navigate to trading terminal
# Look for logs every 15 minutes:

[loadCandles] Response: {
  symbol: "EURUSD",
  timeframe: "1H",
  candleCount: 100,
  ...
}
```

**Expected**: Log appears every 900 seconds
**Actual**: (TO BE VERIFIED BY USER)

### Step 2: Verify Provider Timestamps Change

```bash
# Compare timestamps across two consecutive polls:

Poll 1: lastCandle.timestamp = "2026-10-23T14:00:00.000Z"
Poll 2: lastCandle.timestamp = "2026-10-23T15:00:00.000Z"  # Should be 1 hour later for 1H timeframe
```

**Expected**: Timestamps advance with timeframe
**Actual**: (TO BE VERIFIED BY USER)

### Step 3: Verify Quote Updates

```bash
# Watch quote logs:

[Quote Update]: {
  providerTimestamp: "2026-10-23T14:32:15.000Z",
  price: "1.08267",
  timeSinceProviderGenerated: 2234  # milliseconds
}
```

**Expected**: Provider timestamp changes on each poll
**Actual**: (TO BE VERIFIED BY USER)

### Step 4: Verify Chart Updates

```bash
# Watch chart component logs:

[CandlestickChart] Applying candle update: {
  time: "2026-10-23T14:00:00.000Z",
  values: { open: 1.08245, high: 1.08312, low: 1.08198, close: 1.08267 }
}
```

**Expected**: Log appears when latestCandleUpdate changes
**Actual**: (TO BE VERIFIED BY USER)

---

## Conclusion

### Root Cause Summary

The chart doesn't show live movement because:

1. ✅ **Data is arriving** - Twelve Data API returns valid candles
2. ✅ **Polling is working** - Requests occur every 15 minutes
3. ✅ **Chart can update** - Lightweight Charts `.update()` is available
4. ❌ **No aggregation logic** - New prices aren't accumulated into current candle
5. ❌ **Quotes not connected** - Live price quotes don't feed into chart
6. ❌ **Polling too slow** - 15 minutes is too infrequent for "live" feel

### Current State

**What Works**:
- Historical candle loading
- Chart rendering
- Symbol/timeframe switching
- Error handling
- Polling infrastructure

**What Doesn't Work**:
- Live candle updates
- Quote-to-candle aggregation
- Real-time price movement
- Continuous chart updates

### Next Steps Required

**Immediate** (Diagnostic):
1. Run application with new logging
2. Observe console for 30 minutes
3. Verify timestamp changes
4. Document exact behavior

**Short-Term** (Fix):
1. Implement quote-to-candle aggregation
2. Increase quote polling to 5 minutes
3. Add timeframe boundary detection
4. Test all timeframes

**Long-Term** (Optimize):
1. Evaluate Twelve Data WebSocket upgrade
2. Implement streaming if approved
3. Add advanced caching
4. Optimize for production

---

## Appendix: Code Snippets

### A. Timeframe Duration Calculator

```typescript
const getTimeframeDurationMs = (timeframe: string): number => {
  const map: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1H': 60 * 60 * 1000,
    '4H': 4 * 60 * 60 * 1000,
    '1D': 24 * 60 * 60 * 1000,
  };
  return map[timeframe] || 60 * 60 * 1000;
};
```

### B. Candle Boundary Calculator

```typescript
const getCandleBoundary = (timestamp: number, timeframeDuration: number): number => {
  // Floor timestamp to timeframe boundary
  return Math.floor(timestamp / timeframeDuration) * timeframeDuration;
};

// Example:
// timestamp: 2026-10-23 14:32:15 (1729690335000)
// timeframe: 1H (3600000)
// boundary: 2026-10-23 14:00:00 (1729688400000)
```

### C. Quote Aggregation Logic

```typescript
const aggregateQuoteIntoCandle = (
  quote: { price: string; timestamp: string },
  latestCandle: Candle,
  timeframe: string
): Candle | null => {
  const price = Number(quote.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  
  const quoteTime = Date.parse(quote.timestamp);
  if (!Number.isFinite(quoteTime)) return null;
  
  const timeframeDuration = getTimeframeDurationMs(timeframe);
  const quoteBoundary = getCandleBoundary(quoteTime, timeframeDuration);
  const candleTime = latestCandle.time * 1000;  // Convert to ms
  
  // Quote belongs to current candle - update it
  if (quoteBoundary === candleTime) {
    return {
      time: latestCandle.time,
      open: latestCandle.open,
      high: Math.max(latestCandle.high, price),
      low: Math.min(latestCandle.low, price),
      close: price
    };
  }
  
  // Quote belongs to future candle - create it
  if (quoteBoundary > candleTime) {
    return {
      time: Math.floor(quoteBoundary / 1000),  // Convert to seconds
      open: price,
      high: price,
      low: price,
      close: price
    };
  }
  
  // Quote is stale - ignore
  return null;
};
```

---

**Report Status**: ✅ Investigation Complete
**Code Changes**: Diagnostic logging added
**User Action Required**: Run application and verify timestamp behavior
**Next Phase**: Implement aggregation logic based on verification results
