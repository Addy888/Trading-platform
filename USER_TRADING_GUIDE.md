# User Trading Guide

## How to Access the Trading Terminal

### Method 1: From Sidebar (NEW!)
1. Log in to your account
2. Look at the left sidebar
3. Click **"Trading"** (📈 icon)
4. Select your trading account
5. Start trading!

### Method 2: From Trading Accounts
1. Navigate to **"Trading Accounts"**
2. Find an **ACTIVE** account
3. Click **"Open Trading Terminal"** button
4. Terminal opens automatically

---

## Trading Terminal Overview

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  TOP BAR: Account Info | Balance | Equity | Status      │
├──────────┬────────────────────────────────┬─────────────┤
│  MARKET  │         CHART                  │    ORDER    │
│  WATCH   │                                │    PANEL    │
│          │    [1m][5m][15m][1H][4H][1D]  │             │
│ EURUSD   │                                │  BUY/SELL   │
│ GBPUSD   │    Candlestick Chart          │  Volume     │
│ XAUUSD   │                                │  SL/TP      │
│ BTCUSD   │                                │  [BUY]      │
│          │                                │  [SELL]     │
├──────────┴────────────────────────────────┴─────────────┤
│  OPEN POSITIONS  |  TRADE HISTORY                       │
│  Real-time P&L updates                                  │
└─────────────────────────────────────────────────────────┘
```

---

## How to Place Your First Trade

### Step 1: Select Symbol
- Look at **Market Watch** (left panel)
- Click on a symbol (e.g., EURUSD)
- Current price appears

### Step 2: Choose Side
- **BUY** if you think price will go UP
- **SELL** if you think price will go DOWN

### Step 3: Set Volume
- Enter lot size (e.g., 0.10 = 10,000 units)
- Minimum: 0.01 lots
- Check "Required Margin" display

### Step 4: Optional - Set Stop Loss
- Protection against losses
- **For BUY**: Set below entry price
- **For SELL**: Set above entry price

### Step 5: Optional - Set Take Profit
- Automatic profit taking
- **For BUY**: Set above entry price
- **For SELL**: Set below entry price

### Step 6: Execute
- Click green **BUY** button
- OR click red **SELL** button
- Wait for confirmation

### Step 7: Monitor Position
- Position appears in "Open Positions" table
- Watch real-time P&L changes
- Equity updates automatically

---

## Understanding the Display

### Account Metrics (Top Bar)

| Metric | Meaning |
|--------|---------|
| **Balance** | Your account balance |
| **Equity** | Balance + Unrealized P&L |
| **Status** | ACTIVE / BREACHED / PASSED |

### Position Details

| Column | Meaning |
|--------|---------|
| **Symbol** | Trading instrument |
| **Side** | BUY (Long) or SELL (Short) |
| **Volume** | Position size in lots |
| **Entry** | Price when you opened |
| **Current** | Current market price |
| **PnL** | Profit/Loss (green=profit, red=loss) |

### Market Status Indicators

| Indicator | Meaning |
|-----------|---------|
| 🟢 **LIVE** | Market data is fresh |
| 🟡 **STALE** | Data is old, wait before trading |
| 🔴 **DISCONNECTED** | No market connection |
| 🟢 **Connected** | WebSocket connected |
| 🔴 **Disconnected** | WebSocket disconnected |

---

## Trading Examples

### Example 1: Simple BUY Trade

**Setup:**
- Symbol: EURUSD
- Current Price: 1.0850
- Your Analysis: Price will go up
- Account Balance: $100,000

**Action:**
```
1. Click EURUSD in Market Watch
2. Enter Volume: 1.0 lots
3. Click BUY button
4. Position opens at ASK price: 1.0851
```

**Scenario A: Price Goes Up**
```
Price moves to: 1.0900
Your P&L: (1.0900 - 1.0851) × 1.0 × 100,000 = +$490
Equity: $100,490
```

**Scenario B: Price Goes Down**
```
Price moves to: 1.0800
Your P&L: (1.0800 - 1.0851) × 1.0 × 100,000 = -$510
Equity: $99,490
```

### Example 2: SELL Trade with SL/TP

**Setup:**
- Symbol: EURUSD
- Current Price: 1.0850
- Your Analysis: Price will go down
- Stop Loss: 1.0870 (risk: $200)
- Take Profit: 1.0800 (target: $500)

**Action:**
```
1. Click EURUSD
2. Enter Volume: 1.0 lots
3. Enter Stop Loss: 1.0870
4. Enter Take Profit: 1.0800
5. Click SELL button
6. Position opens at BID price: 1.0849
```

**Outcome A: TP Hit**
```
Price drops to 1.0800
Position closes automatically
P&L: (1.0849 - 1.0800) × 1.0 × 100,000 = +$490
```

**Outcome B: SL Hit**
```
Price rises to 1.0870
Position closes automatically
P&L: (1.0849 - 1.0870) × 1.0 × 100,000 = -$210
```

---

## How to Close a Position

### Manual Close
1. Find position in "Open Positions" table
2. Click **"Close"** button
3. Confirm closure
4. Position closes at current market price
5. P&L becomes realized
6. Balance updates

### Automatic Close (SL/TP)
- Server monitors your SL/TP levels
- Closes automatically when price hits
- No manual action needed
- Notification sent
- Balance updates automatically

---

## Understanding P&L

### Unrealized P&L (Floating)
- P&L on **open** positions
- Changes with market price
- **Not** added to balance yet
- Shown in green (profit) or red (loss)

### Realized P&L
- P&L on **closed** positions
- Added to or subtracted from balance
- Final result of trade
- Shown in trade history

### Equity Calculation
```
Equity = Balance + Unrealized P&L
```

**Example:**
```
Balance: $100,000
Open Position: +$450 (unrealized)
Equity: $100,450

Close Position:
Balance: $100,450
Open Position: $0
Equity: $100,450
```

---

## Challenge Rules Monitoring

### Profit Target
- Target: Usually 8-10% of starting balance
- Progress bar shows how close you are
- Must reach target to pass challenge

### Daily Loss Limit
- Maximum loss allowed per day
- Resets at midnight (server time)
- **Exceeding this = BREACH**

### Maximum Drawdown
- Maximum total loss from peak
- Calculated from highest equity
- **Exceeding this = BREACH**

### Minimum Trading Days
- Number of days you must trade
- At least one trade per day counts
- Multiple trades on same day = 1 day

---

## Common Mistakes to Avoid

### ❌ Don't:
1. **Trade without Stop Loss** - Always protect your account
2. **Risk too much per trade** - Keep position sizes reasonable
3. **Ignore margin requirements** - Check before every trade
4. **Trade on stale data** - Wait for LIVE status
5. **Close positions impulsively** - Stick to your plan
6. **Exceed daily loss limit** - Monitor closely
7. **Trade when account is BREACHED** - It's locked

### ✅ Do:
1. **Start with small volumes** - Learn the platform first
2. **Use Stop Loss always** - Protect your capital
3. **Monitor challenge rules** - Track your progress
4. **Check margin before trading** - Ensure sufficient funds
5. **Wait for LIVE market status** - Don't trade on stale data
6. **Keep track of daily P&L** - Stay within limits
7. **Review trade history** - Learn from each trade

---

## Troubleshooting

### "Trading Disabled"
**Problem:** BUY/SELL buttons are grayed out

**Possible Causes:**
1. Account status is BREACHED → Cannot trade anymore
2. Account status is PASSED → Check rules for next step
3. Daily loss limit reached → Wait until tomorrow
4. Maximum drawdown reached → Account breached

**Solution:** Check account status in top bar

---

### "Insufficient Margin"
**Problem:** Order rejected with margin error

**Solution:**
1. Reduce volume (use smaller lot size)
2. Close some open positions first
3. Check "Free Margin" display

---

### "Market Data Stale"
**Problem:** Cannot place orders, shows "STALE" status

**Solution:**
1. Wait a few seconds
2. Check WebSocket status (should show "Connected")
3. If still stale, refresh page
4. Contact support if persists

---

### Position Not Updating
**Problem:** P&L not changing in real-time

**Solution:**
1. Check WebSocket status (top right)
2. Should show "Connected" (green dot)
3. If "Disconnected", refresh page
4. Position will update when connection restores

---

### Cannot Close Position
**Problem:** Close button not working

**Possible Causes:**
1. Position already being closed
2. Network issue
3. Position already closed (check trade history)

**Solution:**
1. Wait a moment and try again
2. Check "Trade History" tab
3. Refresh page if needed

---

## Keyboard Shortcuts

Currently no keyboard shortcuts implemented.
Use mouse/touch to interact with terminal.

---

## Mobile Trading

The terminal works on mobile devices but:
- Best experience on desktop/laptop
- Chart may be smaller on mobile
- Landscape orientation recommended
- All features available

---

## Need Help?

### Check These First:
1. **Account Status** - Is it ACTIVE?
2. **WebSocket** - Is it Connected?
3. **Market Status** - Is it LIVE?
4. **Margin** - Do you have enough?
5. **Challenge Rules** - Are you within limits?

### Contact Support:
- If you see persistent errors
- If trades don't execute
- If positions disappear
- If P&L calculations seem wrong

---

## Tips for Success

### Risk Management
- Never risk more than 1-2% per trade
- Always use Stop Loss
- Position size based on account size
- Don't overtrade

### Challenge Completion
- Monitor daily loss closely
- Stay well below drawdown limit
- Accumulate trading days steadily
- Aim for profit target gradually

### Technical
- Keep WebSocket connected
- Don't refresh during trades
- Monitor market status
- Close positions before market close (if applicable)

### Psychology
- Stick to your trading plan
- Don't revenge trade
- Take breaks
- Keep a trading journal

---

## Summary

### To Start Trading:
1. ✅ Click "Trading" in sidebar
2. ✅ Select ACTIVE account
3. ✅ Choose symbol
4. ✅ Set volume
5. ✅ Set SL/TP (recommended)
6. ✅ Click BUY or SELL
7. ✅ Monitor position
8. ✅ Close when target reached

**Happy Trading! 📈**

---

## Important Disclaimers

⚠️ **SIMULATED MARKET**
- This is a demo/practice environment
- Prices are simulated
- Not connected to real exchanges
- For educational purposes

⚠️ **RISK WARNING**
- Trading involves risk
- Past performance ≠ future results
- Only trade what you can afford to lose
- Seek independent financial advice

⚠️ **CHALLENGE RULES**
- Read all rules carefully
- Breaches are permanent
- Rules are strictly enforced
- No exceptions

---

**Version:** 1.0
**Last Updated:** Day 15 Implementation
**Platform:** Trading Challenge Platform
