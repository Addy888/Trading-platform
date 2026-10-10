# DAY 4 - ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT APPLICATION                               │
│                    (Web Browser / Mobile App)                            │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 │ HTTP/REST + JWT
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NESTJS API SERVER                                   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │              BrokerController                                   │    │
│  │                                                                 │    │
│  │  POST   /api/broker/portfolio/sync                             │    │
│  │  GET    /api/broker/portfolio/sync-status                      │    │
│  │  GET    /api/broker/portfolio                                  │    │
│  │  GET    /api/broker/positions                                  │    │
│  │  GET    /api/broker/holdings                                   │    │
│  │  GET    /api/broker/funds                                      │    │
│  │                                                                 │    │
│  │  [JwtAuthGuard] - All endpoints protected                      │    │
│  │  [CurrentUser] - Extract userId from JWT                       │    │
│  └────────────────────────┬───────────────────────────────────────┘    │
│                           │                                              │
│                           ▼                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │        BrokerPortfolioSyncService                              │    │
│  │                                                                 │    │
│  │  - syncPortfolio(userId, provider)                             │    │
│  │    ├─ Concurrent sync prevention (Map)                         │    │
│  │    ├─ Get broker connection                                    │    │
│  │    ├─ Create sync record                                       │    │
│  │    └─ Fetch data in parallel                                   │    │
│  │                                                                 │    │
│  │  - syncPositions(userId, connectionId, positions[])            │    │
│  │    ├─ Upsert positions (no duplicates)                         │    │
│  │    └─ Mark closed positions                                    │    │
│  │                                                                 │    │
│  │  - syncHoldings(userId, connectionId, holdings[])              │    │
│  │    └─ Upsert holdings (no duplicates)                          │    │
│  │                                                                 │    │
│  │  - getSyncStatus(userId, provider)                             │    │
│  │  - getPositions(userId, provider, onlyOpen)                    │    │
│  │  - getHoldings(userId, provider)                               │    │
│  │  - getFunds(userId, provider)                                  │    │
│  └────────────────────────┬───────────────────────────────────────┘    │
│                           │                                              │
│                           ▼                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │         AngelOnePortfolioAdapter                               │    │
│  │                                                                 │    │
│  │  - getPositions(sessionToken)                                  │    │
│  │    └─ GET /rest/secure/angelbroking/order/v1/getPosition      │    │
│  │                                                                 │    │
│  │  - getHoldings(sessionToken)                                   │    │
│  │    └─ GET /rest/secure/angelbroking/portfolio/v1/getHolding   │    │
│  │                                                                 │    │
│  │  - getFunds(sessionToken)                                      │    │
│  │    └─ GET /rest/secure/angelbroking/user/v1/getRMS            │    │
│  └────────────────────────┬───────────────────────────────────────┘    │
│                           │                                              │
│                           ▼                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │         BrokerConnectionService                                │    │
│  │                                                                 │    │
│  │  - getSessionToken(userId, provider)                           │    │
│  │    ├─ Fetch from database                                      │    │
│  │    ├─ Decrypt token (AES-256-GCM)                              │    │
│  │    └─ Check expiry                                             │    │
│  └────────────────────────┬───────────────────────────────────────┘    │
│                           │                                              │
│                           ▼                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │              PrismaService                                     │    │
│  │                                                                 │    │
│  │  - Transaction support                                         │    │
│  │  - Connection pooling                                          │    │
│  │  - Type-safe queries                                           │    │
│  └────────────────────────┬───────────────────────────────────────┘    │
│                           │                                              │
└───────────────────────────┼──────────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────────────┐
         │                                          │
         │           MYSQL DATABASE                 │
         │                                          │
         │  ┌────────────────────────────────┐     │
         │  │   broker_positions             │     │
         │  │                                │     │
         │  │  - id (PK)                     │     │
         │  │  - userId (FK)                 │     │
         │  │  - brokerConnectionId (FK)     │     │
         │  │  - exchange                    │     │
         │  │  - symbol                      │     │
         │  │  - symbolToken                 │     │
         │  │  - netQuantity (DECIMAL)       │     │
         │  │  - realizedPnl (DECIMAL)       │     │
         │  │  - unrealizedPnl (DECIMAL)     │     │
         │  │  - totalPnl (DECIMAL)          │     │
         │  │  - positionType (ENUM)         │     │
         │  │  - lastSyncedAt                │     │
         │  │  - brokerRawData (JSON)        │     │
         │  │                                │     │
         │  │  UNIQUE (userId, brokerConn,  │     │
         │  │    exchange, symbol, token,   │     │
         │  │    productType)                │     │
         │  └────────────────────────────────┘     │
         │                                          │
         │  ┌────────────────────────────────┐     │
         │  │   broker_holdings              │     │
         │  │                                │     │
         │  │  - id (PK)                     │     │
         │  │  - userId (FK)                 │     │
         │  │  - brokerConnectionId (FK)     │     │
         │  │  - exchange                    │     │
         │  │  - symbol                      │     │
         │  │  - symbolToken                 │     │
         │  │  - quantity (DECIMAL)          │     │
         │  │  - averagePrice (DECIMAL)      │     │
         │  │  - profitAndLoss (DECIMAL)     │     │
         │  │  - lastSyncedAt                │     │
         │  │  - brokerRawData (JSON)        │     │
         │  │                                │     │
         │  │  UNIQUE (userId, brokerConn,  │     │
         │  │    exchange, symbol, token)   │     │
         │  └────────────────────────────────┘     │
         │                                          │
         │  ┌────────────────────────────────┐     │
         │  │   broker_portfolio_syncs       │     │
         │  │                                │     │
         │  │  - id (PK)                     │     │
         │  │  - userId (FK)                 │     │
         │  │  - brokerConnectionId (FK)     │     │
         │  │  - syncType                    │     │
         │  │  - status                      │     │
         │  │  - startedAt                   │     │
         │  │  - completedAt                 │     │
         │  │  - positionsCount              │     │
         │  │  - holdingsCount               │     │
         │  │  - fundsData (JSON)            │     │
         │  │  - errorMessage                │     │
         │  └────────────────────────────────┘     │
         │                                          │
         │  ┌────────────────────────────────┐     │
         │  │   broker_connections           │     │
         │  │  (From Day 1)                  │     │
         │  │                                │     │
         │  │  - id (PK)                     │     │
         │  │  - userId (FK)                 │     │
         │  │  - provider                    │     │
         │  │  - status                      │     │
         │  │  - encryptedToken (AES-256)    │     │
         │  │  - tokenExpiresAt              │     │
         │  └────────────────────────────────┘     │
         │                                          │
         └──────────────────────────────────────────┘
                            ▲
                            │
                            │ HTTPS/REST
                            │
                            ▼
         ┌──────────────────────────────────────────┐
         │                                          │
         │      ANGEL ONE SMARTAPI                  │
         │      (Broker External API)               │
         │                                          │
         │  - GET /getPosition                      │
         │  - GET /getHolding                       │
         │  - GET /getRMS (funds)                   │
         │                                          │
         │  Rate Limit: 10 req/sec                  │
         │  Session Timeout: 1 day                  │
         │                                          │
         └──────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════
DATA FLOW: PORTFOLIO SYNC
═══════════════════════════════════════════════════════════════════════════

1. User clicks "Sync Portfolio" in UI
   │
   ▼
2. POST /api/broker/portfolio/sync (JWT in header)
   │
   ▼
3. JwtAuthGuard validates token → extract userId
   │
   ▼
4. BrokerController.syncPortfolio(userId)
   │
   ▼
5. BrokerPortfolioSyncService.syncPortfolio(userId)
   │
   ├─ Check concurrent sync (Map.get(syncKey))
   │  └─ If already syncing → 409 CONFLICT
   │
   ├─ Get broker connection from DB
   │  └─ If not found → 404 NOT_FOUND
   │
   ├─ Create sync record (status: IN_PROGRESS)
   │
   ├─ Get session token (decrypted)
   │  └─ If expired → 401 UNAUTHORIZED
   │
   ├─ Parallel API calls:
   │  ├─ AngelOnePortfolioAdapter.getPositions(token)
   │  │  └─ GET Angel One API
   │  ├─ AngelOnePortfolioAdapter.getHoldings(token)
   │  │  └─ GET Angel One API
   │  └─ AngelOnePortfolioAdapter.getFunds(token)
   │     └─ GET Angel One API
   │
   ├─ Transaction START
   │  │
   │  ├─ syncPositions(positions[])
   │  │  ├─ Get current open positions
   │  │  ├─ Upsert each position (create or update)
   │  │  └─ Mark missing positions as CLOSED
   │  │
   │  └─ syncHoldings(holdings[])
   │     └─ Upsert each holding (create or update)
   │
   ├─ Transaction COMMIT
   │
   ├─ Update sync record (status: COMPLETED)
   │
   └─ Return result
      │
      ▼
6. BrokerController returns JSON response
   │
   ▼
7. Client receives portfolio data


═══════════════════════════════════════════════════════════════════════════
SECURITY LAYERS
═══════════════════════════════════════════════════════════════════════════

Layer 1: JWT Authentication
  └─ All endpoints protected by JwtAuthGuard
  └─ Invalid/expired JWT → 401 UNAUTHORIZED

Layer 2: User Ownership
  └─ userId extracted from JWT
  └─ All queries filtered by userId
  └─ No cross-user access possible

Layer 3: Broker Session
  └─ Session token encrypted in database (AES-256-GCM)
  └─ Token expiry checked before API calls
  └─ Expired session → 401 UNAUTHORIZED

Layer 4: Data Isolation
  └─ Positions/holdings linked to brokerConnectionId
  └─ Unique constraints prevent duplicates
  └─ Foreign key cascades ensure consistency


═══════════════════════════════════════════════════════════════════════════
ERROR HANDLING
═══════════════════════════════════════════════════════════════════════════

409 CONFLICT
  └─ Concurrent sync detected
  └─ Only one sync per user at a time

404 NOT_FOUND
  └─ Broker not connected
  └─ User must connect first

401 UNAUTHORIZED
  └─ Session expired
  └─ User must reconnect

412 PRECONDITION_FAILED
  └─ Broker status not CONNECTED
  └─ Connection in ERROR or EXPIRED state

429 TOO_MANY_REQUESTS
  └─ Angel One rate limit hit
  └─ Wait before retrying

500 INTERNAL_SERVER_ERROR
  └─ Database error
  └─ Network error
  └─ Unexpected error


═══════════════════════════════════════════════════════════════════════════
PERFORMANCE OPTIMIZATIONS
═══════════════════════════════════════════════════════════════════════════

1. Parallel API Calls
   └─ Promise.all([getPositions, getHoldings, getFunds])
   └─ Reduces total time from ~1500ms to ~500ms

2. Single Transaction
   └─ All database writes in one transaction
   └─ Reduces round trips

3. Upsert Strategy
   └─ No separate SELECT + INSERT/UPDATE
   └─ Atomic operation

4. Indexed Lookups
   └─ userId, brokerConnectionId, symbolToken indexed
   └─ Fast queries

5. Concurrent Prevention
   └─ In-memory Map (no database lock)
   └─ O(1) lookup


═══════════════════════════════════════════════════════════════════════════
```

**Last Updated**: October 9, 2026
