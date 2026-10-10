# DAY 4 - PORTFOLIO API REFERENCE

Quick reference for portfolio synchronization endpoints.

---

## Authentication

All endpoints require JWT token:
```
Authorization: Bearer <your-jwt-token>
```

---

## Endpoints

### 1. Sync Portfolio

Trigger manual portfolio synchronization from broker.

```http
POST /api/broker/portfolio/sync
Authorization: Bearer <jwt>
```

**Response 200**:
```json
{
  "success": true,
  "syncId": "550e8400-e29b-41d4-a716-446655440000",
  "positionsCount": 5,
  "holdingsCount": 10,
  "funds": {
    "netAvailableFunds": "50000.00",
    "availableCash": "45000.00",
    "availableMargin": "100000.00",
    "collateral": "10000.00",
    "m2mUnrealized": "-2500.00",
    "m2mRealized": "1200.00",
    "utilizedMargin": "30000.00"
  },
  "syncedAt": "2026-10-09T10:30:00.000Z",
  "duration": 1234
}
```

**Errors**:
- `409 CONFLICT` - Sync already in progress
- `404 NOT_FOUND` - Broker not connected
- `412 PRECONDITION_FAILED` - Broker disconnected
- `401 UNAUTHORIZED` - Session expired

---

### 2. Get Sync Status

Check sync status and history.

```http
GET /api/broker/portfolio/sync-status
Authorization: Bearer <jwt>
```

**Response 200**:
```json
{
  "connected": true,
  "connectionStatus": "CONNECTED",
  "lastSync": {
    "syncId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "COMPLETED",
    "startedAt": "2026-10-09T10:30:00.000Z",
    "completedAt": "2026-10-09T10:30:01.234Z",
    "positionsCount": 5,
    "holdingsCount": 10,
    "errorMessage": null
  },
  "status": "CONNECTED",
  "inProgress": false
}
```

---

### 3. Get Complete Portfolio

Get positions, holdings, and funds in one call.

```http
GET /api/broker/portfolio
Authorization: Bearer <jwt>
```

**Note**: Returns last synced data, does NOT trigger new sync.

**Response 200**:
```json
{
  "positions": [
    {
      "id": "pos-123",
      "exchange": "NSE",
      "symbol": "SBIN",
      "symbolToken": "3045",
      "tradingSymbol": "SBIN-EQ",
      "productType": "DELIVERY",
      "instrumentType": "EQUITY",
      "netQuantity": "10.0000",
      "buyQuantity": "10.0000",
      "sellQuantity": "0.0000",
      "netAveragePrice": "550.50",
      "buyAveragePrice": "550.50",
      "sellAveragePrice": null,
      "lastTradedPrice": "560.75",
      "closePrice": "555.00",
      "realizedPnl": "0.00",
      "unrealizedPnl": "102.50",
      "totalPnl": "102.50",
      "pnlPercentage": "1.86",
      "totalBuyValue": "5505.00",
      "totalSellValue": null,
      "netValue": "5607.50",
      "multiplier": 1,
      "lotSize": 1,
      "positionType": "OPEN",
      "lastSyncedAt": "2026-10-09T10:30:01.000Z"
    }
  ],
  "holdings": [
    {
      "id": "hold-456",
      "exchange": "NSE",
      "symbol": "RELIANCE",
      "symbolToken": "2885",
      "tradingSymbol": "RELIANCE-EQ",
      "isin": "INE002A01018",
      "quantity": "50.0000",
      "t1Quantity": "0.0000",
      "realizedQuantity": "50.0000",
      "authorizedQuantity": "50.0000",
      "collateralQuantity": "0.0000",
      "averagePrice": "2450.00",
      "lastTradedPrice": "2500.00",
      "closePrice": "2480.00",
      "profitAndLoss": "2500.00",
      "pnlPercentage": "2.04",
      "currentValue": "125000.00",
      "investedValue": "122500.00",
      "collateralType": null,
      "haircut": null,
      "lastSyncedAt": "2026-10-09T10:30:01.000Z"
    }
  ],
  "funds": {
    "netAvailableFunds": "50000.00",
    "availableCash": "45000.00",
    "availableMargin": "100000.00",
    "collateral": "10000.00",
    "m2mUnrealized": "-2500.00",
    "m2mRealized": "1200.00",
    "utilizedMargin": "30000.00"
  },
  "lastSyncedAt": "2026-10-09T10:30:01.000Z"
}
```

---

### 4. Get Positions Only

Get broker positions without holdings or funds.

```http
GET /api/broker/positions?onlyOpen=true
Authorization: Bearer <jwt>
```

**Query Parameters**:
- `onlyOpen` (boolean, default: `true`) - Filter to only open positions

**Response 200**:
```json
[
  {
    "id": "pos-123",
    "exchange": "NSE",
    "symbol": "SBIN",
    "netQuantity": "10.0000",
    "totalPnl": "102.50",
    "positionType": "OPEN",
    ...
  }
]
```

---

### 5. Get Holdings Only

Get broker holdings (long-term investments).

```http
GET /api/broker/holdings
Authorization: Bearer <jwt>
```

**Response 200**:
```json
[
  {
    "id": "hold-456",
    "exchange": "NSE",
    "symbol": "RELIANCE",
    "quantity": "50.0000",
    "profitAndLoss": "2500.00",
    ...
  }
]
```

---

### 6. Get Funds Only

Get account funds/margin data.

```http
GET /api/broker/funds
Authorization: Bearer <jwt>
```

**Response 200**:
```json
{
  "netAvailableFunds": "50000.00",
  "availableCash": "45000.00",
  "availableMargin": "100000.00",
  "collateral": "10000.00",
  "m2mUnrealized": "-2500.00",
  "m2mRealized": "1200.00",
  "utilizedMargin": "30000.00"
}
```

**Response 200** (if no sync completed):
```json
null
```

---

## Data Types

### Position Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal position ID |
| `exchange` | string | Exchange (NSE, BSE, NFO, etc.) |
| `symbol` | string | Trading symbol |
| `symbolToken` | string | Broker instrument token |
| `tradingSymbol` | string | Full trading symbol |
| `productType` | string | DELIVERY, INTRADAY, CARRYFORWARD |
| `instrumentType` | string | EQUITY, FUTIDX, OPTIDX, etc. |
| `netQuantity` | string | Net quantity (buy - sell) |
| `buyQuantity` | string | Total buy quantity |
| `sellQuantity` | string | Total sell quantity |
| `netAveragePrice` | string | Weighted average price |
| `lastTradedPrice` | string | Current market price (LTP) |
| `realizedPnl` | string | Realized P&L |
| `unrealizedPnl` | string | Unrealized P&L (MTM) |
| `totalPnl` | string | Total P&L |
| `pnlPercentage` | string | P&L percentage |
| `positionType` | string | OPEN or CLOSED |
| `lastSyncedAt` | string | ISO 8601 timestamp |

### Holding Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal holding ID |
| `exchange` | string | Exchange |
| `symbol` | string | Trading symbol |
| `isin` | string | ISIN code |
| `quantity` | string | Total quantity |
| `t1Quantity` | string | T+1 unsettled quantity |
| `realizedQuantity` | string | Settled quantity |
| `averagePrice` | string | Average buy price |
| `lastTradedPrice` | string | Current market price |
| `profitAndLoss` | string | Total P&L |
| `pnlPercentage` | string | P&L percentage |
| `currentValue` | string | Current market value |
| `investedValue` | string | Total invested amount |
| `lastSyncedAt` | string | ISO 8601 timestamp |

### Funds Fields

| Field | Type | Description |
|-------|------|-------------|
| `netAvailableFunds` | string | Net available funds |
| `availableCash` | string | Available cash |
| `availableMargin` | string | Available margin |
| `collateral` | string | Collateral value |
| `m2mUnrealized` | string | Mark-to-market unrealized |
| `m2mRealized` | string | Mark-to-market realized |
| `utilizedMargin` | string | Utilized margin |

---

## Common Errors

### 401 Unauthorized
```json
{
  "error": "BROKER_SESSION_EXPIRED",
  "message": "Session expired",
  "details": "Please reconnect to the broker"
}
```
**Solution**: Call `POST /api/broker/connection/connect` to reconnect

---

### 404 Not Found
```json
{
  "error": "BROKER_NOT_CONNECTED",
  "message": "Broker connection not found"
}
```
**Solution**: Connect to broker first

---

### 409 Conflict
```json
{
  "error": "SYNC_IN_PROGRESS",
  "message": "Portfolio sync already in progress"
}
```
**Solution**: Wait for current sync to complete

---

### 412 Precondition Failed
```json
{
  "error": "BROKER_DISCONNECTED",
  "message": "Broker status: DISCONNECTED"
}
```
**Solution**: Reconnect to broker

---

### 429 Too Many Requests
```json
{
  "error": "BROKER_RATE_LIMIT",
  "message": "Rate limit exceeded",
  "details": "Too many requests to broker API"
}
```
**Solution**: Wait before retrying

---

## Best Practices

### 1. Always Check Sync Status First
```javascript
// Check if sync needed
const status = await fetch('/api/broker/portfolio/sync-status');
if (!status.inProgress && needsRefresh) {
  await fetch('/api/broker/portfolio/sync', { method: 'POST' });
}
```

### 2. Handle Stale Data
```javascript
const portfolio = await fetch('/api/broker/portfolio');
const lastSync = new Date(portfolio.lastSyncedAt);
const now = new Date();
const minutesSinceSync = (now - lastSync) / 1000 / 60;

if (minutesSinceSync > 5) {
  // Data is stale, show warning
  alert('Portfolio data is outdated. Click to refresh.');
}
```

### 3. Use Specific Endpoints When Possible
```javascript
// ❌ Bad - Fetches everything
const portfolio = await fetch('/api/broker/portfolio');
const positions = portfolio.positions;

// ✅ Good - Fetches only what you need
const positions = await fetch('/api/broker/positions');
```

### 4. Handle Decimals Properly
```javascript
// All numeric values are strings (for Decimal precision)
const position = await fetch('/api/broker/positions/123');

// ❌ Bad - Loses precision
const pnl = parseFloat(position.totalPnl);

// ✅ Good - Keep as string for display
const pnl = position.totalPnl; // "102.50"

// ✅ Good - Use Decimal library for calculations
import Decimal from 'decimal.js';
const pnl = new Decimal(position.totalPnl);
```

---

## Testing with curl

### Sync Portfolio
```bash
curl -X POST http://localhost:4000/api/broker/portfolio/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Portfolio
```bash
curl http://localhost:4000/api/broker/portfolio \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Positions
```bash
curl "http://localhost:4000/api/broker/positions?onlyOpen=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

**Last Updated**: October 9, 2026  
**Version**: Day 4 - v1.0
