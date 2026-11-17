# MANUAL END-TO-END TEST GUIDE

## BUY → OPEN POSITION → CLOSE POSITION WORKFLOW

This guide provides step-by-step instructions for testing the complete trading workflow using the application.

---

## PREREQUISITES

### Backend Setup
1. Ensure `.env` file is configured in `apps/api/`:
   - Database connection (MySQL)
   - JWT secrets
   - Twelve Data API key (for simulated pricing)
   - Test funding enabled for dev users

2. Database migrations should be up to date:
   ```bash
   cd apps/api
   npx prisma migrate deploy
   ```

3. Build the API:
   ```bash
   cd apps/api
   npm run build
   ```

4. Start the API:
   ```bash
   cd apps/api
   npm run dev
   # or npm start
   ```

   Expected output: `Nest application successfully started on port 3001`

### Frontend Setup
1. Install dependencies:
   ```bash
   cd apps/web
   npm install
   ```

2. Create/update `.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001/api
   NEXT_PUBLIC_API_WS_URL=ws://localhost:3001
   ```

3. Start the frontend:
   ```bash
   cd apps/web
   npm run dev
   ```

   Expected output: `Ready in X.XXs`
   Access: http://localhost:3000

---

## AUTOMATED TEST EXECUTION

For quick end-to-end verification without UI interaction:

```bash
cd /path/to/Trading/tradeing
node COMPLETE_BUY_CLOSE_TEST.js
```

This script will:
1. Create a test user account
2. Create a trading account with simulated funds
3. Execute a BUY order
4. Verify the position appears
5. Close the position
6. Verify the closed position in history
7. Report comprehensive results

**Expected Output**:
```
═══ COMPLETE BUY → CLOSE WORKFLOW TEST ═══
→ Authenticating user
✓ Authenticated: test-buy-close@example.com
→ Getting trading account
✓ Account: 1000001 (SIMULATED)
→ Checking margin info
✓ Margin info retrieved
→ Opening BUY position
✓ BUY order executed
→ Fetching open positions
✓ Found 1 open position(s)
→ Closing position
✓ Position closed
→ Fetching trade history
✓ Found 1 closed trade(s)
═══ SUMMARY: 9 PASS, 0 WARN, 0 FAIL ═══
```

---

## MANUAL UI TEST WALKTHROUGH

### Test A: Register and Create Account

1. Open http://localhost:3000
2. Click "Sign Up" or navigate to registration
3. Enter test credentials:
   - Email: test-trading-001@example.com
   - Password: TestPassword123!
   - First Name: Test
   - Last Name: Trader
4. Click "Create Account"
5. Verify you are logged in and redirected to dashboard

**Expected Result**: Dashboard loads with no errors

### Test B: Create Trading Account

1. From dashboard, look for "Create Trading Account" or similar button
2. Click to create a new simulated trading account
3. Select option for "Simulated Test Funds" if available
4. Submit form

**Expected Result**:
- New trading account created
- Account number displays (e.g., 1000001)
- Initial balance shows (e.g., $10,000)
- Status shows "ACTIVE"
- Execution mode shows "SIMULATED"

### Test C: Navigate to Trading Terminal

1. From dashboard, find your trading account
2. Click on it to enter the trading terminal
3. Wait for chart and market data to load

**Expected Result**:
- Trading terminal loads
- Chart displays candlestick data
- Order panel visible on side
- Account info shows balance and equity
- No error messages

### Test D: Check Margin Information

1. In trading terminal, look for "Margin Info" or "Account Info" section
2. Verify it displays:
   - Balance
   - Equity
   - Used Margin (should be 0 if no open positions)
   - Free Margin
   - Margin Level

**Expected Result**:
- Margin info loads without errors
- All values display correctly
- Used margin = $0 (no open positions yet)
- Free margin = Equity (no leverage used)

### Test E: Open Positions Tab (Should be Empty)

1. Look for "Open Positions" tab in trading terminal
2. Click to view open positions

**Expected Result**:
- Empty message displays
- Table headers visible but no data rows
- No error messages

### Test F: Submit BUY Order

1. In Order Panel, select "BUY" side
2. Enter order details:
   - Symbol: EURUSD (or similar)
   - Volume: 0.1 (lots)
   - Stop Loss: 1.08
   - Take Profit: 1.12
3. Click "Submit" or "BUY" button
4. Wait for response

**Expected Result**:
- Success notification appears
- Order panel may show "Processing..."
- No error messages
- Response shows:
  - Trade ID
  - Entry price
  - Status: OPEN

### Test G: Verify Position Appears in Open Positions

1. Navigate to or refresh "Open Positions" tab
2. Look for your EURUSD position

**Expected Result**:
- Position appears in table
- Shows:
  - Symbol: EURUSD
  - Side: BUY
  - Volume: 0.1
  - Entry Price: ~1.10 (last market price)
  - Current Price: ~1.10 (mid price from Twelve Data)
  - Unrealized P&L: Close to $0 (since price just updated)
  - SL: 1.08
  - TP: 1.12
  - Open Time: Recent timestamp
  - "Close" button visible

### Test H: Check Updated Margin After Opening Position

1. Check Margin Info section again
2. Verify it now shows:
   - Used Margin: > $0 (position now uses margin)
   - Free Margin: Reduced from before
   - Margin Level: Calculated (Equity / Used Margin × 100)

**Expected Result**:
- Used margin increases
- Free margin decreases proportionally
- Margin level displays correctly

### Test I: Close the Position

1. In Open Positions table, find the EURUSD position
2. Click the "Close" button
3. Wait for response

**Expected Result**:
- Button shows "Closing..." state
- Position disappears from Open Positions table
- Success notification appears
- Response shows:
  - Exit price
  - Realized P&L (profit or loss)
  - Status: CLOSED

### Test J: Verify Position in Closed Positions or Trade History

1. Look for "Closed Positions" tab or "Trade History" tab
2. Search for the EURUSD trade just closed

**Expected Result**:
- Closed trade appears in list
- Shows:
  - Entry Price: ~1.10 (or actual entry)
  - Exit Price: ~1.10 (or actual exit)
  - Realized P&L: Calculated difference
  - Opening Time: From step F
  - Closing Time: Recent
  - Status: CLOSED

### Test K: Verify Margin After Close

1. Check Margin Info section
2. Verify it shows:
   - Used Margin: Back to $0 (no open positions)
   - Free Margin: Back to full equity
   - Margin Level: Resets

**Expected Result**:
- Used margin returns to $0
- Free margin returns to full equity

### Test L: Check Account Balance Updated

1. Check the account balance display in terminal
2. Compare with initial balance from Test B

**Expected Result**:
- Balance has changed by the realized P&L amount
- If P&L was positive, balance increased
- If P&L was negative, balance decreased

---

## VERIFY CLOSE-ONLY BEHAVIOR (PREVENT DOUBLE-CLOSE)

### Test M: Attempt to Close Already-Closed Position

1. From Trade History, try to find the closed EURUSD trade
2. If there's a "Close" button (some UIs allow this), click it
3. Expect an error

**Expected Result**:
- Error message: "Position is not open" or similar
- Position remains in history as CLOSED
- No duplicate close is created

---

## VERIFY MULTIPLE POSITIONS

### Test N: Open Multiple Positions

1. Open another BUY position:
   - Symbol: GBPUSD
   - Volume: 0.05
2. Open a SELL position:
   - Symbol: USDJPY
   - Volume: 0.2
3. Check Open Positions table

**Expected Result**:
- Table shows 3 positions (EURUSD from previous test + 2 new)
- Each position has correct side, volume, price
- Unrealized P&L calculated for each
- Total used margin is sum of all positions

### Test O: Close One Position While Others Remain Open

1. In Open Positions, close the GBPUSD position
2. Verify USDJPY and other positions remain

**Expected Result**:
- GBPUSD removed from open list
- Appears in closed/history
- USDJPY still shows in open positions
- Used margin adjusted but not to zero

---

## SELL-TO-OPEN (Short Position) TEST

### Test P: Open SELL Position

1. In Order Panel, select "SELL" side
2. Enter:
   - Symbol: AUDUSD
   - Volume: 0.1
   - No SL/TP
3. Submit

**Expected Result**:
- SELL position created with OPEN status
- Appears in Open Positions
- Side shows "SELL"
- Current Price updates

### Test Q: Close SELL Position

1. Click Close on SELL position
2. Wait for response

**Expected Result**:
- Position closes
- Exit price used is ASK (for SELL close)
- P&L calculated correctly
- Appears in history as CLOSED

---

## ERROR HANDLING TESTS

### Test R: Test with Invalid Inputs

1. Try volume = 0 or negative
2. Try volume = 1000000 (exceeds limit)
3. Try symbol = "INVALID"
4. Try stop loss above current price for BUY

**Expected Result**:
- Appropriate error messages
- Order not submitted
- User can correct and retry

### Test S: Test with Insufficient Balance

1. Create a new account with minimal initial balance
2. Try to open position with very large volume
3. Expect margin validation error

**Expected Result**:
- Error: "Insufficient margin"
- Position not created
- Balance unchanged

### Test T: Test Risk Rule Violations

1. Open multiple positions
2. Generate losses to trigger daily loss limit or max drawdown

**Expected Result**:
- Account status changes to BREACHED
- New trades are rejected
- Error message explains which rule was breached

---

## DATABASE VERIFICATION

After completing tests, verify data directly in database:

```sql
-- View all trades for an account
SELECT * FROM trades 
WHERE trading_account_id = 'ACCOUNT_ID' 
ORDER BY opened_at DESC;

-- Check trade statuses
SELECT symbol, side, status, entry_price, exit_price, realized_pnl, opened_at, closed_at
FROM trades
WHERE trading_account_id = 'ACCOUNT_ID'
ORDER BY opened_at DESC;

-- Verify closed trades have exit prices
SELECT id, symbol, status, exit_price, realized_pnl
FROM trades
WHERE trading_account_id = 'ACCOUNT_ID' AND status = 'CLOSED';

-- Check account balance updates
SELECT id, current_balance, equity, status
FROM trading_accounts
WHERE id = 'ACCOUNT_ID';
```

**Expected Result**:
- All OPEN trades have `closed_at = NULL` and `exit_price = NULL`
- All CLOSED trades have timestamps and prices
- `realized_pnl` calculated correctly
- Account balance matches last trade's impact

---

## PERFORMANCE CHECKS

### Margin API Response Time
```bash
curl -X GET "http://localhost:3001/api/v2/trading-accounts/ACCOUNT_ID/margin" \
  -H "Authorization: Bearer TOKEN"
```

**Expected Result**:
- HTTP 200
- Response time: < 100ms
- JSON with margin values

### Open Positions Response Time
```bash
curl -X GET "http://localhost:3001/api/trading-accounts/ACCOUNT_ID/positions" \
  -H "Authorization: Bearer TOKEN"
```

**Expected Result**:
- HTTP 200
- Response time: < 100ms
- Array of open positions

### Trade History Pagination
```bash
curl -X GET "http://localhost:3001/api/trading-accounts/ACCOUNT_ID/trades?page=1&limit=10" \
  -H "Authorization: Bearer TOKEN"
```

**Expected Result**:
- HTTP 200
- Returns trades array
- Pagination metadata

---

## WEBSOCKET VERIFICATION (Optional)

If WebSocket support is enabled:

1. Open browser DevTools → Network → WS tab
2. Look for socket.io connection
3. Should see messages like:
   - `trade.opened` when position created
   - `trade.closed` when position closed
   - `account.updated` when balance changes

**Expected Result**:
- Real-time updates reflected in UI
- No stale data

---

## TROUBLESHOOTING

### API Not Responding
- Check backend is running: `curl http://localhost:3001/health`
- Check database connection: `npx prisma db execute --stdin`
- Check logs for errors

### Margin API Returns 503
- **Fixed**: This should now return 200 when no open positions
- Check market data is available
- Verify Twelve Data API key

### Position Not Appearing
- Refresh the page manually
- Check browser console for errors
- Verify trade was created (check database)

### Can't Close Position
- Verify position status is OPEN in database
- Check market data is available for the symbol
- Verify account is ACTIVE

### Balance Doesn't Update
- Check trade has `status = 'CLOSED'`
- Verify `realized_pnl` is set
- Check account `current_balance` calculation

---

## EXPECTED TEST RESULTS SUMMARY

| Test | Expected Result | Status |
|------|-----------------|--------|
| A. Registration | Account created | ✓ PASS |
| B. Create Account | Trading account active | ✓ PASS |
| C. Load Terminal | UI loads, no errors | ✓ PASS |
| D. Margin Info | Displays correctly | ✓ PASS |
| E. Empty Positions | No positions shown | ✓ PASS |
| F. BUY Order | Trade created, OPEN | ✓ PASS |
| G. Position Display | Appears in table | ✓ PASS |
| H. Updated Margin | Used margin > 0 | ✓ PASS |
| I. Close Position | Position closed, button removed | ✓ PASS |
| J. Trade History | Closed trade appears | ✓ PASS |
| K. Margin Reset | Used margin back to 0 | ✓ PASS |
| L. Balance Update | Reflects realized P&L | ✓ PASS |
| M. Duplicate Close | Error returned | ✓ PASS |
| N. Multiple Positions | All display correctly | ✓ PASS |
| O. Partial Close | Others remain open | ✓ PASS |
| P. SELL to Open | Short position created | ✓ PASS |
| Q. Close SELL | Exit at ASK, P&L correct | ✓ PASS |
| R. Invalid Input | Errors shown, not submitted | ✓ PASS |
| S. Insufficient Margin | Error, no trade created | ✓ PASS |
| T. Risk Rules | Account breached, blocked | ✓ PASS |

---

## SUCCESS CRITERIA

✓ All 19 tests pass
✓ No 500 errors
✓ Database records match UI display
✓ P&L calculations correct
✓ Balance updates accurate
✓ Margin calculations valid
✓ Risk rules enforced
✓ Error messages clear

When all tests pass, the BUY → OPEN → CLOSE workflow is fully operational and ready for production use.
