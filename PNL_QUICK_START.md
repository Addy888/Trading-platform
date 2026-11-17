# P&L System Quick Start Guide

## 5-Minute Overview

The P&L system automatically calculates, tracks, and reports profit and loss for all trading positions with:
- **Live unrealized P&L** for open positions
- **Realized P&L** when trades close
- **Account financial summary** (balance, equity, margin)
- **Dashboard analytics** (win rate, profit factor, etc.)
- **Detailed trade reports** with historical data

## Getting Started

### 1. Start the API Server
```bash
cd apps/api
npm install
npm run build
npm run start:dev
```

API runs at: `http://localhost:3000/api`

### 2. Create a Trading Account
```bash
POST /auth/register
{
  "email": "trader@example.com",
  "password": "SecurePassword123",
  "firstName": "John",
  "lastName": "Trader"
}

POST /auth/login
{
  "email": "trader@example.com",
  "password": "SecurePassword123"
}

POST /trading-accounts
Headers: Authorization: Bearer {accessToken}
{
  "testFunding": true,
  "initialFundingAmount": 10000
}
```

Response contains `accountId` - save this for all P&L requests.

### 3. Open a Position
```bash
POST /trading-accounts/{accountId}/trades
Headers: Authorization: Bearer {accessToken}
{
  "symbol": "EURUSD",
  "side": "BUY",
  "volume": 1.0,
  "stopLoss": 1.0800,
  "takeProfit": 1.1200
}
```

Response contains `tradeId`.

## API Endpoints

### Get Live Open Positions P&L
```bash
GET /trading-accounts/{accountId}/pnl/open-positions
Authorization: Bearer {token}
```

**Returns:**
- Current bid/ask prices
- Unrealized P&L (gross and net)
- Spread impact
- Position metadata

### Get Closed Trades History
```bash
GET /trading-accounts/{accountId}/pnl/closed-trades
  ?page=1
  &limit=50
  &symbol=EURUSD
  &side=BUY
  &fromDate=2024-01-01
  &toDate=2024-01-31

Authorization: Bearer {token}
```

**Returns:**
- Entry/exit prices
- Realized P&L (gross and net)
- Commission, swap, spread costs
- P&L percentage
- Holding period

### Get Account Financial Summary
```bash
GET /trading-accounts/{accountId}/pnl/summary
Authorization: Bearer {token}
```

**Returns:**
```json
{
  "balance": "10400.00",          // Initial + Realized P&L
  "equity": "10635.00",           // Balance + Unrealized P&L
  "usedMargin": "1000.00",        // Margin required for open positions
  "freeMargin": "9635.00",        // Available to trade
  "unrealizedPnl": "235.00",      // From open positions
  "realizedPnl": "400.00",        // From closed positions
  "todaysPnl": "150.00",          // Today's trades only
  "totalNetPnl": "635.00",        // Total: realized + unrealized
  "marginUtilization": "9.41"     // Percentage
}
```

### Get Dashboard Analytics
```bash
GET /trading-accounts/{accountId}/pnl/analytics
Authorization: Bearer {token}
```

**Returns:**
```json
{
  "dailyPnl": "150.00",
  "weeklyPnl": "850.00",
  "monthlyPnl": "1200.00",
  "totalRealizedPnl": "4250.00",
  "winningTrades": 8,
  "losingTrades": 2,
  "winRate": "80.00",             // Percentage
  "avgProfitPerWinningTrade": "531.25",
  "avgLossPerLosingTrade": "-150.00",
  "largestProfit": "1200.00",
  "largestLoss": "-300.00",
  "profitFactor": "2.83"          // Total wins / Total losses
}
```

### Generate Trade Report
```bash
GET /trading-accounts/{accountId}/pnl/report
  ?fromDate=2024-01-01
  &toDate=2024-01-31

Authorization: Bearer {token}
```

**Returns:**
- All closed trades in period
- Entry/exit details
- P&L breakdown per trade
- Summary totals
- Win/loss counts

## Key Concepts

### Balance
= Initial Balance + Sum(Realized P&L from closed trades)

**Updates:** Only when a trade closes

**Example:**
- Start: $10,000
- Trade 1 closes with +$400 → Balance: $10,400
- Trade 2 closes with -$100 → Balance: $10,300

### Equity
= Balance + Sum(Unrealized P&L from open trades)

**Updates:** Every time market prices change

**Example:**
- Balance: $10,300
- Open trade showing +$335 unrealized → Equity: $10,635

### Unrealized P&L
= (Current Price - Entry Price) × Volume × Contract Size

**For BUY:** If price goes up, P&L is positive ✅
**For SELL:** If price goes down, P&L is positive ✅

**Example (BUY EURUSD):**
- Entry: 1.08500
- Current: 1.08750
- Volume: 1.0 lot (100,000 units)
- P&L = (1.08750 - 1.08500) × 100,000 = $250

### Realized P&L
= P&L when you close a position

**Captures:** Entry price, exit price, volume at close

**Formula:** Same as unrealized, but using actual exit price

**Example (Close BUY at 1.08900):**
- Entry: 1.08500
- Exit: 1.08900
- Volume: 1.0 lot
- P&L = (1.08900 - 1.08500) × 100,000 = $400

### Spread Impact
= Bid-Ask spread × Volume × Contract Size

**Why it matters:** Every trade costs you the spread

**Example:**
- Bid/Ask: 1.08500 / 1.08502 (2-pip spread)
- Volume: 1.0 lot
- Cost = 0.00002 × 100,000 = $2

This is deducted from your P&L.

## Common Workflows

### Workflow 1: Monitor Open Position
```
1. Open position with POST /trades
2. Monitor with GET /pnl/open-positions (every minute)
3. Watch unrealizedPnl change with market prices
4. Check margin utilization in GET /pnl/summary
5. Close when target reached with POST /trades/{id}/close
```

### Workflow 2: Review Daily Performance
```
1. Get summary: GET /pnl/summary
   → Check today's P&L and balance update
2. Get analytics: GET /pnl/analytics
   → Check daily P&L and win rate
3. Get closed trades: GET /pnl/closed-trades
   → Review today's closed trades
```

### Workflow 3: Generate Monthly Report
```
1. Get report: GET /pnl/report?fromDate=2024-01-01&toDate=2024-01-31
2. Review:
   - Total realized P&L
   - Win rate / Profit factor
   - Largest profitable trade
   - Largest losing trade
   - Number of winning vs losing trades
```

### Workflow 4: Verify Account Consistency
```
1. Get summary: GET /pnl/summary
   → Verify: Balance = Initial + Realized P&L
   → Verify: Equity = Balance + Unrealized P&L
   → Verify: Free Margin = Equity - Used Margin
2. Get closed trades: GET /pnl/closed-trades
   → Sum all net P&L should equal Total Realized P&L
3. Get open positions: GET /pnl/open-positions
   → Sum all net unrealized should equal Total Unrealized P&L
```

## Testing the System

### Quick Manual Test
```bash
# 1. Create account (save accountId)
curl -X POST http://localhost:3000/api/trading-accounts \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"testFunding": true, "initialFundingAmount": 10000}'

# 2. Open BUY position (save tradeId)
curl -X POST http://localhost:3000/api/trading-accounts/{accountId}/trades \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD",
    "side": "BUY",
    "volume": 1.0,
    "stopLoss": 1.0800,
    "takeProfit": 1.1200
  }'

# 3. Get open positions
curl http://localhost:3000/api/trading-accounts/{accountId}/pnl/open-positions \
  -H "Authorization: Bearer {token}"

# 4. Get summary
curl http://localhost:3000/api/trading-accounts/{accountId}/pnl/summary \
  -H "Authorization: Bearer {token}"

# 5. Close position
curl -X POST http://localhost:3000/api/trading-accounts/{accountId}/trades/{tradeId}/close \
  -H "Authorization: Bearer {token}"

# 6. Get closed trades
curl http://localhost:3000/api/trading-accounts/{accountId}/pnl/closed-trades \
  -H "Authorization: Bearer {token}"

# 7. Get report
curl "http://localhost:3000/api/trading-accounts/{accountId}/pnl/report" \
  -H "Authorization: Bearer {token}"
```

### Automated Test
```bash
npm run test:pnl
```

## Troubleshooting

### "Market data unavailable"
- **Cause:** Twelve Data connection issue
- **Solution:** Wait for market to reopen or check internet connection

### "Executable price unavailable"
- **Cause:** Bid/ask spread not available
- **Solution:** Market may be closed or very volatile

### Balance doesn't match
- **Cause:** Unrealized P&L not subtracted from calculation
- **Solution:** Balance includes ONLY realized P&L. Use Equity for total value.

### P&L not updating
- **Cause:** Browser cached old data
- **Solution:** Do fresh GET request with no cache headers

### Position shows in open but not in closed
- **Cause:** Trade hasn't been closed yet
- **Solution:** Use POST /trades/{id}/close to close it first

## Tips & Best Practices

✅ **DO:**
- Check P&L regularly during trading hours
- Review analytics daily to track performance
- Use reports for compliance/audit
- Monitor margin utilization
- Close positions to realize P&L

❌ **DON'T:**
- Trust the browser cache - always refresh
- Ignore spread costs - they add up
- Forget about commission and swap
- Hold losing positions hoping for recovery
- Assume balance = equity (balance is lower)

## Example: Real P&L Calculation

**Setup:**
- Account: $10,000 initial
- Trade: BUY 1.0 lot EURUSD @ 1.08500

**After 1 hour:**
- Price moves to: 1.08750
- Unrealized P&L = (1.08750 - 1.08500) × 100,000 = $250
- Balance still: $10,000 (not realized yet)
- Equity now: $10,250 (balance + unrealized)

**After 4 hours (Close):**
- Close price: 1.08900
- Realized P&L = (1.08900 - 1.08500) × 100,000 = $400
- Spread cost: -$2
- Commission: $0 (in this setup)
- Swap: $0 (in this setup)
- **Net P&L = $398**
- New Balance: $10,398 (initial + net P&L)
- New Equity: $10,398 (no open positions)

## Next Steps

1. **Read Full Documentation:** `PNL_SYSTEM_DOCUMENTATION.md`
2. **Run Test Suite:** `npm run test:pnl`
3. **Try Manual Test:** Use curl commands above
4. **Build Dashboard:** Use API data in frontend
5. **Configure Commission:** Set instrument-specific rates
6. **Add WebSocket:** Real-time P&L streaming

## Support

- **API Issues:** Check error response message
- **Calculation Issues:** Verify market data is available
- **Database Issues:** Check Prisma logs
- **Performance:** Add indexes on (accountId, closedAt)

---

**Last Updated:** 2024-01-20
**Version:** 1.0.0
