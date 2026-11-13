# COMPLETE HISTORICAL + LIVE FOREX CHART IMPLEMENTATION PLAN

**Date**: 2026-11-12  
**Task**: Implement TradingView-like chart with historical pagination and live updates

---

## ROOT CAUSE ANALYSIS

### Why Only 100 Candles Display

**Current Implementation**:
1. Frontend: Hardcoded `outputsize=100` in `marketApi.getCandles()`
2. Dashboard: Calls `loadCandles(symbol, timeframe, 100)` - fixed count
3. No pagination mechanism to load older candles
4. No "Load More" trigger when user scrolls left
5. Chart uses `setData()` for initial load, `update()` for live updates
6. No historical candle persistence/database storage

**Backend**:
- ✅ Already supports up to 5000 candles via `outputsize` parameter
- ✅ Twelve Data provider returns historical data correctly
- ✅ Rate limiting fixed (8-second throttling)
- ✅ Caching working (5-minute TTL)

---

## IMPLEMENTATION PHASES

### PHASE 1: INCREASE INITIAL CANDLE LOAD ✅ QUICK WIN

**Goal**: Load 500-1000 candles initially instead of 100

**Changes**:
1. Update frontend `loadCandles()` to request 500 candles initially
2. Keep 100 for polling updates to avoid rate limits
3. Test all timeframes with increased count

**Files**:
- `apps/web/app/dashboard/trading/[accountId]/page.tsx`

**Estimated Time**: 5 minutes

---

### PHASE 2: IMPLEMENT HISTORICAL PAGINATION

**Goal**: Load older candles when user scrolls left

**Features**:
1. **Detect Scroll**: Monitor `timeScale().subscribeVisibleLogicalRangeChange()`
2. **Trigger Load**: When user approaches left edge (e.g., within 10% of oldest candle)
3. **Cursor-Based Pagination**: Use earliest candle timestamp as cursor
4. **Fetch Previous Batch**: Request 200 older candles before earliest timestamp
5. **Merge History**: Prepend older candles to existing array
6. **Preserve Viewport**: Maintain user's scroll position after prepending
7. **Prevent Duplicates**: Track in-flight requests, deduplicate timestamps
8. **Continue Until Exhausted**: Stop when provider returns < requested count

**Implementation**:
```typescript
// State
const [oldestCandleTime, setOldestCandleTime] = useState<number | null>(null);
const [isLoadingHistory, setIsLoadingHistory] = useState(false);
const [hasMoreHistory, setHasMoreHistory] = useState(true);

// Load older candles
const loadOlderCandles = async () => {
  if (!oldestCandleTime || isLoadingHistory || !hasMoreHistory) return;
  
  setIsLoadingHistory(true);
  try {
    // Request candles before oldest timestamp
    const result = await marketApi.getCandlesBefore(
      accessToken,
      selectedSymbol,
      selectedTimeframe,
      oldestCandleTime,
      200 // batch size
    );
    
    if (result.candles.length === 0) {
      setHasMoreHistory(false);
      return;
    }
    
    // Prepend to existing candles
    setCandles(prev => [...result.candles, ...prev]);
    setOldestCandleTime(result.candles[0].time);
    
    if (result.candles.length < 200) {
      setHasMoreHistory(false);
    }
  } finally {
    setIsLoadingHistory(false);
  }
};

// Chart scroll detection
useEffect(() => {
  if (!chartRef.current) return;
  
  const timeScale = chartRef.current.timeScale();
  const unsubscribe = timeScale.subscribeVisibleLogicalRangeChange(() => {
    const range = timeScale.getVisibleLogicalRange();
    if (!range || !candles.length) return;
    
    // Load more when user is within 10% of left edge
    if (range.from < candles.length * 0.1) {
      loadOlderCandles();
    }
  });
  
  return unsubscribe;
}, [candles, oldestCandleTime, isLoadingHistory, hasMoreHistory]);
```

**Files**:
- `apps/web/app/dashboard/trading/[accountId]/page.tsx` (pagination logic)
- `apps/web/components/trading/candlestick-chart.tsx` (scroll detection)
- `apps/web/lib/market-api.ts` (new endpoint `getCandlesBefore`)
- `apps/api/src/market-data/market-data.controller.ts` (new route `/candles/before`)

**Estimated Time**: 45 minutes

---

### PHASE 3: DATABASE PERSISTENCE (OPTIONAL - SKIP FOR NOW)

**Goal**: Store historical candles in database for faster loads

**Decision**: **SKIP THIS PHASE**
- Reason: Twelve Data free tier allows enough requests with caching
- Cache layer (5-minute TTL) already reduces API calls significantly
- Database adds complexity without major benefit for this use case
- Can add later if needed

---

### PHASE 4: ENHANCE LIVE UPDATES

**Goal**: Ensure live updates don't interfere with historical candles

**Current Implementation**:
- ✅ Uses `setData()` for initial history
- ✅ Uses `update()` for live candle
- ✅ Validates timestamps before updating
- ✅ WebSocket integration working

**Enhancements Needed**:
1. **Preserve History After Live Update**: Ensure `setData()` is only called on initial load or symbol change
2. **Handle New Minute**: Append new candle when minute changes
3. **Deduplicate Timestamps**: Ensure no duplicate timestamps in candle array
4. **WebSocket Reconnect**: Don't clear history on reconnect

**Implementation**:
```typescript
// Enhanced live update logic
useEffect(() => {
  if (!wsLatestCandle || !candles.length) return;
  
  const lastHistoryCandle = candles[candles.length - 1];
  
  // Case 1: Update current candle (same timestamp)
  if (wsLatestCandle.time === lastHistoryCandle.time) {
    setLatestCandleUpdate(wsLatestCandle);
  }
  // Case 2: New candle (newer timestamp)
  else if (wsLatestCandle.time > lastHistoryCandle.time) {
    setCandles(prev => [...prev, wsLatestCandle]);
    setLatestCandleUpdate(null);
  }
  // Case 3: Older candle (ignore - stale data)
  else {
    console.warn('Ignoring stale candle update');
  }
}, [wsLatestCandle]);
```

**Files**:
- `apps/web/app/dashboard/trading/[accountId]/page.tsx`

**Estimated Time**: 15 minutes

---

### PHASE 5: CHART INTERACTION CONTROLS

**Goal**: Add UI controls for better chart navigation

**Features**:
1. **"Go To Latest" Button**: Jump to most recent candle
2. **"Auto-Follow" Toggle**: Automatically follow latest candle when enabled
3. **"Load More History" Button** (manual trigger as fallback)

**Implementation**:
```typescript
const goToLatest = () => {
  if (!chartRef.current) return;
  chartRef.current.timeScale().scrollToRealTime();
};

const handleAutoFollow = (enabled: boolean) => {
  setAutoFollow(enabled);
  if (enabled) {
    goToLatest();
  }
};
```

**UI**:
```tsx
<div className="absolute top-14 right-2 z-10 flex flex-col gap-2">
  <button
    onClick={goToLatest}
    className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-500"
  >
    Go To Latest
  </button>
  
  {isLoadingHistory && (
    <span className="text-xs text-gray-400">Loading history...</span>
  )}
  
  {!hasMoreHistory && (
    <span className="text-xs text-gray-500">All history loaded</span>
  )}
</div>
```

**Files**:
- `apps/web/components/trading/candlestick-chart.tsx`

**Estimated Time**: 15 minutes

---

### PHASE 6: ALL TIMEFRAMES VERIFICATION

**Goal**: Test all timeframes independently

**Test Cases**:
- 1m: Load 500 candles, verify timestamps span ~8 hours
- 5m: Load 500 candles, verify timestamps span ~2 days
- 15m: Load 500 candles, verify timestamps span ~5 days
- 30m: Load 500 candles, verify timestamps span ~10 days
- 1H: Load 500 candles, verify timestamps span ~20 days
- 4H: Load 500 candles, verify timestamps span ~83 days
- 1D: Load 500 candles, verify timestamps span ~500 days

**Verification**:
- Correct interval spacing between candles
- UTC timestamps
- Unix seconds format for Lightweight Charts
- No gaps or duplicates

**Files**: Test in browser

**Estimated Time**: 20 minutes

---

### PHASE 7: DATA QUALITY VALIDATION

**Already Implemented** ✅:
- Ascending timestamps validation
- No duplicate timestamps
- OHLC constraint validation (high >= max(open, close), low <= min(open, close))
- No invalid/future timestamps
- Correct Unix seconds conversion

**Additional Checks**:
- Timeframe boundary validation (e.g., 1H candles start at :00 minutes)
- No fabricated data (all from Twelve Data)

**Files**: Already implemented in controller and dashboard

---

### PHASE 8: PERFORMANCE OPTIMIZATION

**Current State**:
- ✅ Cursor-based pagination (using timestamp)
- ✅ 5-minute cache (reduces API calls)
- ✅ 8-second throttling (prevents rate limits)
- ✅ In-flight request deduplication
- ✅ Batch size limits (200 candles per pagination request)

**Additional Optimizations**:
1. **React.memo** for chart component
2. **useMemo** for candle data transformations
3. **useCallback** for event handlers
4. **Debounce** scroll events (load history max once per 2 seconds)

**Files**:
- `apps/web/app/dashboard/trading/[accountId]/page.tsx`
- `apps/web/components/trading/candlestick-chart.tsx`

**Estimated Time**: 10 minutes

---

### PHASE 9: BROWSER VERIFICATION

**Critical Tests**:
1. Open EURUSD 1m → Verify 500+ candles load
2. Scroll far left → Verify older candles load automatically
3. Continue scrolling left → Verify pagination continues
4. Click "Go To Latest" → Verify jumps to most recent
5. Wait 2+ minutes → Verify live updates work
6. Confirm historical candles remain intact during live updates
7. Switch to GBPUSD → Verify chart reloads
8. Switch to USDJPY → Verify chart reloads
9. Test 5m, 15m, 1H, 4H timeframes
10. Refresh page → Verify history loads again
11. Check console for errors
12. Check Network tab for API calls
13. Verify WebSocket messages

**Evidence Required**:
- Screenshots of chart with 500+ candles
- Screenshot of "All history loaded" message after pagination
- Screenshot of live updates
- Console logs showing no errors
- Network tab showing API calls

**Estimated Time**: 25 minutes

---

## IMPLEMENTATION ORDER

1. **Phase 1** (5 min): Increase initial load to 500 candles ← START HERE
2. **Phase 4** (15 min): Enhance live update logic
3. **Phase 2** (45 min): Implement pagination
4. **Phase 5** (15 min): Add UI controls
5. **Phase 8** (10 min): Performance optimizations
6. **Phase 6** (20 min): Test all timeframes
7. **Phase 9** (25 min): Browser verification

**Total Estimated Time**: 2 hours 15 minutes

---

## ACCEPTANCE CRITERIA

✅ Chart loads 500-1000 historical candles initially  
✅ User can scroll left to load older candles  
✅ Pagination continues until provider history exhausted  
✅ "Go To Latest" button works  
✅ Live updates continue without clearing history  
✅ Historical candles remain intact during live updates  
✅ All timeframes work (1m, 5m, 15m, 30m, 1H, 4H, 1D)  
✅ No chronological-order errors  
✅ No fake/fabricated candles  
✅ Browser verification complete with screenshots  

---

## FILES TO MODIFY

1. `apps/web/app/dashboard/trading/[accountId]/page.tsx` (main logic)
2. `apps/web/components/trading/candlestick-chart.tsx` (scroll detection, UI)
3. `apps/web/lib/market-api.ts` (pagination endpoint - optional if using existing)
4. `apps/api/src/market-data/market-data.controller.ts` (pagination route - optional)

---

**Ready to implement!** Starting with Phase 1...
