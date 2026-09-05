# Trading API V2 - Usage Guide

## Quick Start

### 1. Get Market Quotes

```http
GET /v2/trading-accounts/:accountId/quotes
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "status": "CONNECTED",
  "quotes": [
    {
      "symbol": "EURUSD",
      "bid": "1.08490",
      "ask": "1.08510",
      "spread": "0.00020",
      "last": "1.08500",
      "timestamp": "2026-09-05T12:00:00.000Z"
    }
  ]
}
```

### 2. Check Margin

```http
GET /v2/trading-accounts/:accountId/margin
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "accountId": "uuid",
  "balance": "100000.00",
  "equity": "100450.00",
  "usedMargin": "1085.00",
  "freeMargin": "99365.00",
  "marginLevel": "9258.99",
  "openPositions": 1
}
```

### 3. Open a BUY Trade

```http
POST /v2/trading-accounts/:accountId/trades
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "symbol": "EURUSD",
  "side": "BUY",
  "volume": 1.0,
  "stopLoss": 1.0800,
  "takeProfit": 1.0900,
  "leverage": 100
}
```

**Success Response (201):**
```json
{
  "success": true,
  "trade": {
    "id": "trade-uuid",
    "symbol": "EURUSD",
    "side": "BUY",
    "volume": "1.00",
    "entryPrice": "1.08510",
    "stopLoss": "1.08000",
    "takeProfit": "1.09000",
    "status": "OPEN",
    "openedAt": "2026-09-05T12:00:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "INSUFFICIENT_MARGIN",
  "message": "Insufficient margin",
  "details": {
    "requiredMargin": "1085.00",
    "freeMargin": "500.00"
  }
}
```

### 4. Update SL/TP

```http
PATCH /v2/trading-accounts/:accountId/trades/:tradeId
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "stopLoss": 1.0820,
  "takeProfit": 1.0950
}
```

### 5. Close Trade

```http
DELETE /v2/trading-accounts/:accountId/trades/:tradeId
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "trade": {
    "id": "trade-uuid",
    "symbol": "EURUSD",
    "side": "BUY",
    "volume": "1.00",
    "entryPrice": "1.08510",
    "exitPrice": "1.08950",
    "realizedPnl": "440.00",
    "status": "CLOSED",
    "openedAt": "2026-09-05T12:00:00.000Z",
    "closedAt": "2026-09-05T12:05:00.000Z"
  }
}
```

## Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `ACCOUNT_NOT_FOUND` | Trading account not found | Check account ID |
| `ACCOUNT_NOT_OWNED` | You don't own this account | Use your own account |
| `ACCOUNT_NOT_ACTIVE` | Account is not active | Contact support |
| `ACCOUNT_BREACHED` | Account breached rules | Cannot trade |
| `MARKET_DATA_STALE` | Market data is stale | Retry after a moment |
| `MARKET_DATA_UNAVAILABLE` | No market price | Wait for market connection |
| `INVALID_SYMBOL` | Symbol not supported | Check supported symbols |
| `SYMBOL_DISABLED` | Symbol trading disabled | Use another symbol |
| `INVALID_VOLUME` | Volume validation failed | Check min/max volume |
| `INSUFFICIENT_MARGIN` | Not enough margin | Reduce volume or close positions |
| `POSITION_NOT_FOUND` | Position not found | Check trade ID |
| `POSITION_NOT_OPEN` | Position already closed | Cannot modify |

## WebSocket Events

### Connect

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3001/trading', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Subscribe to Account

```javascript
socket.emit('subscribe:account', { accountId: 'your-account-id' });
```

### Listen to Events

```javascript
// Connection ready
socket.on('connection:ready', (data) => {
  console.log('Connected:', data);
});

// Market prices
socket.on('market:price', (data) => {
  console.log('Prices updated:', data.quotes);
});

// Account updates
socket.on('account:update', (data) => {
  console.log('Account:', data);
  // Update UI: balance, equity, P&L
});

// Position updates
socket.on('position:update', (data) => {
  console.log('Position:', data);
  // Update UI: current price, unrealized P&L
});

// Trade opened
socket.on('trade:opened', (data) => {
  console.log('Trade opened:', data);
  // Add to positions list
});

// Trade closed
socket.on('trade:closed', (data) => {
  console.log('Trade closed:', data);
  // Remove from positions, add to history
});

// Challenge updates
socket.on('challenge:update', (data) => {
  console.log('Challenge:', data);
  // Update progress bars
});

// Account status change
socket.on('account:status', (data) => {
  console.log('Status changed:', data);
  // Show BREACHED/PASSED notification
});

// Notifications
socket.on('notification:new', (data) => {
  console.log('Notification:', data);
  // Show toast/notification
});

// Errors
socket.on('system:error', (data) => {
  console.error('Error:', data);
});
```

## Instrument Specifications

### Get All Instruments

```http
GET /v2/trading-accounts/:accountId/instruments
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "instruments": [
    {
      "symbol": "EURUSD",
      "name": "Euro vs US Dollar",
      "category": "FOREX",
      "minVolume": "0.01",
      "maxVolume": "100.00",
      "volumeStep": "0.01",
      "defaultLeverage": 100,
      "maxLeverage": 500,
      "contractSize": 100000,
      "pipSize": "0.0001"
    }
  ]
}
```

### Get Specific Instrument

```http
GET /v2/trading-accounts/:accountId/instruments/EURUSD
Authorization: Bearer {jwt_token}
```

## Trading Examples

### Example 1: Simple BUY

```javascript
// 1. Check margin
const margin = await fetch('/v2/trading-accounts/123/margin');
console.log('Free margin:', margin.freeMargin);

// 2. Get current price
const quotes = await fetch('/v2/trading-accounts/123/quotes');
const eurusd = quotes.quotes.find(q => q.symbol === 'EURUSD');
console.log('EURUSD Ask:', eurusd.ask); // You'll pay this price

// 3. Open trade
const trade = await fetch('/v2/trading-accounts/123/trades', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    symbol: 'EURUSD',
    side: 'BUY',
    volume: 0.10,  // 0.10 lots = 10,000 units
    stopLoss: 1.0800,
    takeProfit: 1.0900
  })
});

console.log('Trade opened:', trade.trade.id);
```

### Example 2: Calculate Required Margin

```javascript
// Formula: (Volume × Price × Contract Size) / Leverage
// EURUSD: 1.0 lot at 1.0850, leverage 100

const volume = 1.0;
const price = 1.0850;
const contractSize = 100000;
const leverage = 100;

const requiredMargin = (volume * price * contractSize) / leverage;
console.log('Required margin:', requiredMargin); // $1,085
```

### Example 3: Calculate P&L

```javascript
// LONG position
const entryAsk = 1.0851;  // You bought at ASK
const currentBid = 1.0900; // You'll sell at BID
const volume = 1.0;
const contractSize = 100000;

const pnl = (currentBid - entryAsk) * volume * contractSize;
console.log('Unrealized P&L:', pnl); // $490

// SHORT position
const entryBid = 1.0849;  // You sold at BID
const currentAsk = 1.0800; // You'll buy at ASK
const pnlShort = (entryBid - currentAsk) * volume * contractSize;
console.log('Unrealized P&L:', pnlShort); // $490
```

## Best Practices

### 1. Always Check Margin Before Trading

```javascript
const checkMargin = async (accountId, symbol, volume) => {
  const margin = await getMargin(accountId);
  const quotes = await getQuotes(accountId);
  const instrument = await getInstrument(accountId, symbol);
  
  const price = quotes.find(q => q.symbol === symbol).ask;
  const required = (volume * price * instrument.contractSize) / instrument.defaultLeverage;
  
  return margin.freeMargin >= required;
};
```

### 2. Handle Errors Gracefully

```javascript
try {
  const trade = await openTrade(data);
  showSuccess('Trade opened successfully');
} catch (error) {
  if (error.error === 'INSUFFICIENT_MARGIN') {
    showError('Not enough margin. Close some positions or reduce volume.');
  } else if (error.error === 'MARKET_DATA_STALE') {
    showWarning('Market data updating... Please retry.');
  } else if (error.error === 'ACCOUNT_BREACHED') {
    showError('Account breached. Trading disabled.');
    disableTrading();
  } else {
    showError(error.message);
  }
}
```

### 3. Subscribe to WebSocket on Mount

```javascript
useEffect(() => {
  const socket = connectSocket(token);
  
  socket.on('connection:ready', () => {
    socket.emit('subscribe:account', { accountId });
  });
  
  socket.on('account:update', updateAccount);
  socket.on('position:update', updatePosition);
  socket.on('trade:closed', handleTradeClosed);
  
  return () => {
    socket.emit('unsubscribe:account', { accountId });
    socket.disconnect();
  };
}, [accountId]);
```

### 4. Refetch on Reconnect

```javascript
socket.on('connect', async () => {
  // Refetch authoritative state
  const account = await getAccount(accountId);
  const positions = await getPositions(accountId);
  const margin = await getMargin(accountId);
  
  // Update UI
  setAccount(account);
  setPositions(positions);
  setMargin(margin);
  
  // Resubscribe
  socket.emit('subscribe:account', { accountId });
});
```

### 5. Validate Inputs

```javascript
const validateTrade = (symbol, side, volume, sl, tp) => {
  const instrument = instruments.find(i => i.symbol === symbol);
  
  if (!instrument) {
    throw new Error('Invalid symbol');
  }
  
  if (volume < instrument.minVolume) {
    throw new Error(`Minimum volume: ${instrument.minVolume}`);
  }
  
  if (volume > instrument.maxVolume) {
    throw new Error(`Maximum volume: ${instrument.maxVolume}`);
  }
  
  // Validate SL/TP levels
  if (side === 'BUY') {
    if (sl && sl >= entryPrice) {
      throw new Error('SL must be below entry price for BUY');
    }
    if (tp && tp <= entryPrice) {
      throw new Error('TP must be above entry price for BUY');
    }
  } else {
    if (sl && sl <= entryPrice) {
      throw new Error('SL must be above entry price for SELL');
    }
    if (tp && tp >= entryPrice) {
      throw new Error('TP must be below entry price for SELL');
    }
  }
};
```

## Rate Limiting (Future)

Currently no rate limits, but recommended for production:
- 10 trades per minute per user
- 100 API requests per minute per user
- 1 connection per user per account

## Support

For issues or questions:
1. Check error code in response
2. Verify account status
3. Check market status
4. Review audit logs (admin)
5. Check server logs
