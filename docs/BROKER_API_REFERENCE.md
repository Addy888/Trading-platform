# Broker API Reference - Quick Guide

**Base URL:** `http://localhost:3000`  
**Authentication:** All endpoints require JWT Bearer token  
**Provider:** ANGELONE (default)

---

## Endpoints

### 1. Get Connection Status

**GET** `/api/broker/connection/status`

**Query Params:**
- `provider` (optional) - Broker provider (default: ANGELONE)

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "provider": "ANGELONE",
  "status": "NOT_CONFIGURED" | "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "ERROR",
  "lastConnectedAt": "2026-10-09T10:30:00.000Z",
  "lastError": "Session expired",
  "lastErrorCode": "AB1008"
}
```

**cURL Example:**
```bash
curl http://localhost:3000/api/broker/connection/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 2. Connect to Broker

**POST** `/api/broker/connection/connect`

**Query Params:**
- `provider` (optional) - Broker provider (default: ANGELONE)

**Headers:**
```
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "clientId": "YOUR_ANGELONE_CLIENT_CODE",
  "password": "your-trading-password",
  "apiKey": "your-api-key",
  "totpSecret": "JBSWY3DPEHPK3PXP"
}
```

**Response:**
```json
{
  "provider": "ANGELONE",
  "status": "CONNECTED",
  "lastConnectedAt": "2026-10-09T10:35:00.000Z"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/broker/connection/connect \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "ABC123",
    "password": "YourPassword",
    "apiKey": "your-api-key",
    "totpSecret": "JBSWY3DPEHPK3PXP"
  }'
```

---

### 3. Disconnect from Broker

**DELETE** `/api/broker/connection`

**Query Params:**
- `provider` (optional) - Broker provider (default: ANGELONE)

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "message": "Disconnected successfully"
}
```

**cURL Example:**
```bash
curl -X DELETE http://localhost:3000/api/broker/connection \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 4. Get Account Summary

**GET** `/api/broker/account/summary`

**Query Params:**
- `provider` (optional) - Broker provider (default: ANGELONE)

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "provider": "ANGELONE",
  "clientId": "ABC123",
  "name": "John Doe",
  "email": "john@example.com",
  "availableFunds": 100000.50,
  "usedMargin": 5000.25,
  "totalFunds": 105000.75,
  "exchanges": ["NSE", "BSE", "MCX"]
}
```

**cURL Example:**
```bash
curl http://localhost:3000/api/broker/account/summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 5. Validate Session

**GET** `/api/broker/connection/validate`

**Query Params:**
- `provider` (optional) - Broker provider (default: ANGELONE)

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "valid": true
}
```

**cURL Example:**
```bash
curl http://localhost:3000/api/broker/connection/validate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable message",
  "details": "Additional information",
  "code": "BROKER_ERROR_CODE"
}
```

### Common Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `INVALID_CREDENTIALS` | Missing required credentials |
| 401 | `BROKER_AUTH_FAILED` | Authentication failed with broker |
| 401 | `BROKER_SESSION_EXPIRED` | Session token has expired |
| 404 | `BROKER_NOT_CONNECTED` | No connection found for user |
| 429 | `BROKER_RATE_LIMIT` | Too many requests to broker API |
| 500 | `BROKER_CONFIG_ERROR` | Missing environment configuration |
| 503 | `BROKER_CONNECTION_FAILED` | Network error or broker unavailable |
| 503 | `BROKER_API_ERROR` | Generic broker API error |

---

## Authentication Flow

```
1. User logs in to app → receives JWT token
2. User connects to broker:
   POST /api/broker/connection/connect
   Body: { clientId, password, apiKey, totpSecret }
3. App authenticates with Angel One:
   - Generates TOTP from totpSecret
   - Calls Angel One login API
   - Receives session tokens
4. App stores encrypted tokens:
   - Encrypted with AES-256-GCM
   - Stored in broker_connections table
   - Linked to user ID
5. User makes subsequent requests:
   - App retrieves encrypted token
   - Decrypts and uses for broker API calls
   - Returns normalized data
```

---

## Security Notes

✅ **All credentials are encrypted** before storage  
✅ **User isolation enforced** - User A cannot access User B's connection  
✅ **JWT required** for all endpoints  
✅ **No secrets in responses** - errors are sanitized  
✅ **Audit trail** - all connections logged  

⚠️ **TOTP Secret:** Required for each connection attempt (2FA)  
⚠️ **Token Expiry:** Angel One tokens expire after 24 hours  
⚠️ **Rate Limits:** 10 requests/second for order APIs  

---

## Environment Variables

Required in `apps/api/.env`:

```bash
# Encryption key (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64').substring(0,32))")
ANGELONE_ENCRYPTION_KEY="your-32-character-key-here"

# Optional: For testing with your own account
ANGELONE_API_KEY="your-api-key"
ANGELONE_CLIENT_ID="your-client-id"
ANGELONE_PASSWORD="your-password"
ANGELONE_TOTP_SECRET="your-totp-secret"
```

---

## Testing with Postman

### Collection Setup

1. **Base URL:** `http://localhost:3000`
2. **Authorization:** Add Bearer Token in collection-level auth
3. **Environment Variables:**
   - `jwt_token`: Your JWT token from login
   - `base_url`: `http://localhost:3000`

### Test Sequence

1. Login to get JWT token:
   ```
   POST {{base_url}}/api/auth/login
   Body: { "email": "user@example.com", "password": "password123" }
   Save: accessToken → jwt_token
   ```

2. Check connection status:
   ```
   GET {{base_url}}/api/broker/connection/status
   Authorization: Bearer {{jwt_token}}
   ```

3. Connect to broker:
   ```
   POST {{base_url}}/api/broker/connection/connect
   Authorization: Bearer {{jwt_token}}
   Body: { credentials }
   ```

4. Get account summary:
   ```
   GET {{base_url}}/api/broker/account/summary
   Authorization: Bearer {{jwt_token}}
   ```

---

## Frontend Integration Example

```typescript
// React/Next.js example

// 1. Check connection status
const checkStatus = async () => {
  const response = await fetch('/api/broker/connection/status', {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('jwt')}`
    }
  });
  const data = await response.json();
  setConnectionStatus(data.status);
};

// 2. Connect to broker
const connectBroker = async (credentials) => {
  const response = await fetch('/api/broker/connection/connect', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('jwt')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(credentials)
  });
  
  if (!response.ok) {
    const error = await response.json();
    alert(error.message);
    return;
  }
  
  const data = await response.json();
  setConnectionStatus(data.status);
};

// 3. Get account summary
const getAccountSummary = async () => {
  const response = await fetch('/api/broker/account/summary', {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('jwt')}`
    }
  });
  
  const data = await response.json();
  setAccountData(data);
};
```

---

## Support

For issues, check:
1. JWT token is valid and not expired
2. User is authenticated with app first
3. Broker credentials are correct
4. Environment variables are set
5. Check server logs for detailed errors

Angel One Official Docs: https://smartapi.angelbroking.com/docs/

---

**Last Updated:** October 9, 2026  
**API Version:** v1 (Day 1)
