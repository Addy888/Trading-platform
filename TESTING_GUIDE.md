# TRADING PLATFORM - TESTING GUIDE

## Prerequisites

1. Database running (MySQL)
2. Environment variables configured
3. Node.js and npm installed

## Start the Application

### Terminal 1 - Backend
```bash
cd apps/api
npm run start:dev
```
Backend should start on `http://localhost:3001`

### Terminal 2 - Frontend
```bash
cd apps/web
npm run dev
```
Frontend should start on `http://localhost:3000`

## Test Scenario 1: New User Flow

### Step 1: Register User
1. Go to `http://localhost:3000/register`
2. Fill in:
   - Email: `trader1@example.com`
   - Password: `Password123!`
   - First Name: `John`
   - Last Name: `Trader`
3. Click **Register**
4. Should redirect to login

### Step 2: Login
1. Go to `http://localhost:3000/login`
2. Email: `trader1@example.com`
3. Password: `Password123!`
4. Click **Login**
5. Should redirect to `/dashboard`

### Step 3: Purchase Challenge
1. Click **Browse Challenges** or navigate to `/dashboard/challenges`
2. Select a challenge plan
3. Click **Purchase**
4. Should create an order
5. Note the **Order ID**

### Step 4: Admin Approves Payment (Separate Admin User)
1. Login as ADMIN (you need to create admin account first or update existing user role in database)
2. Go to `/admin/orders`
3. Find the order
4. Click **Approve Payment**
5. This creates the trading account

### Step 5: User Views Trading Account
1. Logout admin, login as `trader1@example.com`
2. Go to `/dashboard/accounts`
3. Should see the new trading account card
4. Status should be **ACTIVE**
5. Click **View Details** to see challenge progress
6. Click **Open Trading Terminal**

### Step 6: Trading Terminal
1. Should see:
   - ✅ Account balance at top
   - ✅ Market Watch on left with symbols
   - ✅ Candlestick chart in center
   - ✅ Order panel on right
   - ✅ WebSocket status (green dot = connected)
   - ✅ Positions/Trade History tabs at bottom

### Step 7: Open BUY Position
1. Select symbol from Market Watch (e.g., EURUSD)
2. In Order Panel:
   - Select **BUY**
   - Volume: `0.01`
   - Stop Loss: (optional, e.g., `1.08000`)
   - Take Profit: (optional, e.g., `1.09000`)
3. Click **BUY EURUSD**
4. Should see success
5. Position should appear in **Open Positions** tab
6. Watch **unrealized P&L** change as prices update

### Step 8: Modify SL/TP
1. In Open Positions tab, click **Modify**
2. Enter new SL/TP values
3. Click checkmark ✓
4. Should update immediately

### Step 9: Close Position
1. In Open Positions tab, click **Close**
2. Confirm closure
3. Position should disappear
4. Account balance should update
5. Trade should appear in **Trade History** tab
6. Realized P&L should be recorded

### Step 10: View Account Progress
1. Click **Back to Accounts**
2. Click **View Details**
3. Should see:
   - Account status
   - Financial overview
   - Challenge progress bars
   - Profit target progress
   - Drawdown usage
   - Trading days completed

## Test Scenario 2: Security Testing

### Test A: User Cannot Access Other User's Account
1. Create second user: `trader2@example.com`
2. Have admin create trading account for trader2
3. Note trader2's account ID
4. Login as `trader1@example.com`
5. Try to access: `/dashboard/accounts/[trader2-account-id]`
6. **Expected**: 403 Forbidden or redirect
7. Try to access: `/dashboard/trading/[trader2-account-id]`
8. **Expected**: 403 Forbidden or redirect

### Test B: API Security
1. Login as `trader1@example.com`
2. Get trader1's account ID
3. Login as `trader2@example.com`
4. Open browser DevTools
5. Try API call: `GET /api/trading-accounts/[trader1-account-id]`
6. **Expected**: 403 Forbidden

### Test C: Admin Access
1. Login as regular USER
2. Try to access: `/admin`
3. **Expected**: Redirect to dashboard or access denied
4. Login as ADMIN
5. Access `/admin`
6. **Expected**: Success

## Test Scenario 3: WebSocket Real-Time Updates

### Test A: Market Price Updates
1. Open trading terminal
2. Open browser console
3. Watch for `market:price` events
4. Prices should update every few seconds
5. Symbol prices in Market Watch should change

### Test B: Position Updates
1. Open position
2. Open browser console in another tab (same user)
3. Close position in first tab
4. **Expected**: Second tab receives update and position disappears

### Test C: Connection Status
1. Stop backend server
2. **Expected**: WebSocket status turns red "Disconnected"
3. Restart backend server
4. **Expected**: WebSocket status turns green "Connected"
5. Data should reload

## Test Scenario 4: Trading Rules

### Test A: Breached Account Cannot Trade
1. Create account with small balance (e.g., $1000)
2. Create rule with small max drawdown (e.g., $50)
3. Open losing trades to breach drawdown
4. Account status should change to **BREACHED**
5. Trading terminal should show "Trading Disabled"
6. Try to open trade
7. **Expected**: Error or disabled button

### Test B: Challenge Progress
1. Start with fresh ACTIVE account
2. Open and close several profitable trades
3. Go to account details
4. Check profit target progress bar
5. Should increase towards target
6. Check trading days completed
7. Should increment

## Expected Behaviors

### ✅ Successful Tests
- User registration works
- Login works
- Order creation works
- Admin can approve payments
- Trading account created
- Trading terminal opens
- WebSocket connects
- Market prices update
- Charts display
- BUY/SELL works
- Positions open
- P&L calculates
- SL/TP modifiable
- Positions close
- Balance updates
- Trade history records
- Challenge progress tracks

### ❌ Security Tests (Should Fail)
- Cross-user account access
- Cross-user position access
- Cross-user trade access
- Unauthenticated API calls
- USER accessing admin endpoints
- Modifying other user's positions
- Closing other user's positions

## Common Issues

### Issue: WebSocket not connecting
**Solution**: 
- Check backend is running
- Check CORS settings
- Check WebSocket URL in frontend

### Issue: Prices not updating
**Solution**:
- Check SimulatedMarketEngine is running
- Check WebSocket connection
- Check market:price events in console

### Issue: Charts not displaying
**Solution**:
- Check lightweight-charts is installed
- Check console for errors
- Refresh page

### Issue: Account ownership error
**Solution**:
- Verify JWT token is valid
- Check user ID matches account owner
- Check backend logs for details

### Issue: Trading disabled
**Solution**:
- Check account status is ACTIVE
- Check account not breached
- Check challenge rules

## Performance Checks

1. **Page Load Time**: Dashboard should load < 2 seconds
2. **WebSocket Latency**: Price updates should be near real-time (< 500ms)
3. **Chart Rendering**: Chart should render < 1 second
4. **API Response Time**: Trading APIs should respond < 500ms
5. **Database Queries**: Should be optimized with indexes

## Browser Compatibility

Test in:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (if on Mac)

## Mobile Responsiveness

Test on:
- Tablet view (768px+)
- Mobile view (< 768px)
- Trading terminal may need horizontal scroll on mobile

---

## Quick Test Commands

```bash
# Check backend health
curl http://localhost:3001/api/health

# Check market prices
curl http://localhost:3001/api/market/prices

# Check symbols
curl http://localhost:3001/api/market/symbols
```

## Debugging Tips

1. **Check Browser Console**: All WebSocket events logged
2. **Check Network Tab**: See all API calls
3. **Check Backend Logs**: See server-side errors
4. **Check Database**: Verify data persistence
5. **Use Prisma Studio**: `npx prisma studio` to view database

---

**Happy Testing! 🚀**
