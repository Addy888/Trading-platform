# PROP TRADING PLATFORM - COMPLETE IMPLEMENTATION PLAN

## AUDIT SUMMARY

**Project Status**: ~95% Complete
**Stack**: Next.js + NestJS + MySQL + Prisma 7.9.1 + Socket.IO

### ✅ FULLY IMPLEMENTED
- Authentication & Authorization (JWT + RBAC)
- Trading Engine V1 & V2 (complete with margin, SL/TP)
- Rule Evaluation System (4 rule types)
- WebSocket Real-time Communication
- Market Data Engine (simulated prices)
- Admin Panel (most features complete)
- User Trading Terminal (professional-grade)
- Order Management System
- Payment Management
- KYC Backend (complete)
- Payout Backend (complete)
- Notification System
- Audit Logging

### ⚠️ MISSING/INCOMPLETE

#### Frontend (User Side):
1. **KYC Submission Page** (`/dashboard/kyc`)
2. **Payout Request Page** (`/dashboard/payouts`)

#### Frontend (Admin Side):
3. **Settings Management Page** (currently placeholder)
4. **Trades Overview Page** (admin view of all trades)
5. **System Health Page** (real system status)

#### Navigation:
6. Remove "Soon" placeholders from user layout

---

## IMPLEMENTATION SEQUENCE

### PHASE 1: User KYC Page
**Location**: `apps/web/app/dashboard/kyc/page.tsx`

**Features**:
- KYC form with document upload
- View submission status
- Handle rejection/resubmission
- Document upload simulation (dev mode)

**Backend Endpoints** (Already Exist):
- `GET /api/kyc` - Get user's KYC submission
- `POST /api/kyc` - Submit KYC
- `PATCH /api/kyc/:id` - Update submission

---

### PHASE 2: User Payouts Page
**Location**: `apps/web/app/dashboard/payouts/page.tsx`

**Features**:
- Request payout form
- View payout history
- View status and notes
- Eligibility check

**Backend Endpoints** (Already Exist):
- `GET /api/payouts` - Get user's payouts
- `POST /api/payouts` - Request payout
- `GET /api/payouts/eligibility/:accountId` - Check eligibility

---

### PHASE 3: Admin Settings Page
**Location**: `apps/web/app/admin/settings/page.tsx`

**Features**:
- Platform Settings (name, email, currency, timezone)
- Trading Settings
- Notification Settings
- Feature Toggles
- Maintenance Mode

**Backend Requirements**:
- Create `admin/admin-settings.controller.ts`
- Create `platform-settings/platform-settings.service.ts`
- Use `PlatformSettings` model (already exists)

---

### PHASE 4: Admin Trades Overview
**Location**: `apps/web/app/admin/trades/page.tsx`

**Features**:
- All open positions
- All closed trades
- Filters (symbol, user, account, status, date range)
- Export capability

**Backend Requirements**:
- Create `GET /api/admin/trades` endpoint
- Create `GET /api/admin/positions` endpoint

---

### PHASE 5: Admin System Health
**Location**: `apps/web/app/admin/health/page.tsx`

**Features**:
- Database connection status
- API health
- WebSocket status
- Market data engine status
- Trading engine status
- Recent errors

**Backend Requirements**:
- Enhance `GET /api/admin/health` endpoint
- Add real health checks

---

### PHASE 6: Update Navigation
- Remove "Soon" from KYC and Payouts in `user-layout.tsx`
- Add Trades and Health to `admin-layout.tsx`

---

### PHASE 7: Final Verification
1. Test complete user flow
2. Test complete admin flow
3. Test ownership/authorization
4. Run build verification
5. Search for placeholders
6. Test with multiple users

---

## IMPLEMENTATION DETAILS

### 1. User KYC Page

```typescript
// apps/web/app/dashboard/kyc/page.tsx
// Form fields:
// - Full Name
// - Date of Birth
// - Address, City, Country, Postal Code
// - Document Type (Passport, ID, Driver License)
// - Document Number
// - Document Front (file upload)
// - Document Back (file upload)
// - Selfie (file upload)

// Status display:
// - NOT_SUBMITTED: Show form
// - PENDING: Show "Under Review" message
// - APPROVED: Show success message
// - REJECTED: Show rejection reason + resubmit button
// - RESUBMISSION_REQUESTED: Show notes + form
```

### 2. User Payouts Page

```typescript
// apps/web/app/dashboard/payouts/page.tsx
// Request Form:
// - Trading Account selector
// - Amount input (with eligibility check)
// - Payment Method
// - Destination (bank account / crypto address)
// - Notes

// History Table:
// - Amount, Account, Status, Requested Date, Processed Date
// - Admin Notes (if any)
```

### 3. Admin Settings

```typescript
// Settings Categories:
// 1. General Settings
//    - platformName, supportEmail, currency, timezone
// 2. Trading Settings
//    - defaultLeverage, allowedSymbols, marketUpdateInterval
// 3. Challenge Settings
//    - defaultAccountSize, defaultMinTradingDays
// 4. Notification Settings
//    - emailProvider, emailFrom, enablePushNotifications
// 5. Feature Toggles
//    - maintenanceMode, allowNewRegistrations, allowNewOrders
// 6. Risk Management
//    - maxDailyLossPercent, maxDrawdownPercent
```

### 4. Admin Trades Page

```typescript
// apps/web/app/admin/trades/page.tsx
// Tabs:
// - Open Positions (status=OPEN)
// - Closed Trades (status=CLOSED)
// - All Trades

// Filters:
// - Symbol, User, Account, Date Range, Status
// - Sort by: Date, PnL, Volume

// Columns:
// - Trade ID, Account, User, Symbol, Side, Volume
// - Entry Price, Exit Price, SL, TP
// - P&L, Status, Open/Close Time
```

### 5. Admin Health Page

```typescript
// apps/web/app/admin/health/page.tsx
// Status Cards:
// - Database: Connected / Error
// - API: Operational / Error
// - WebSocket: Active Connections Count
// - Market Data: Last Update Time
// - Trading Engine: Active / Stopped
// - Background Jobs: Running / Stopped

// Metrics:
// - Uptime
// - Response Times
// - Active Users
// - Open Trades Count
// - WebSocket Connections
```

---

## API ENDPOINTS TO CREATE

### Admin Settings Controller
```typescript
// apps/api/src/admin/admin-settings.controller.ts

@Get('settings')
getSettings()

@Get('settings/:key')
getSetting(@Param('key') key)

@Put('settings/:key')
updateSetting(@Param('key') key, @Body() dto)

@Post('settings')
createSetting(@Body() dto)

@Delete('settings/:key')
deleteSetting(@Param('key') key)
```

### Admin Trades Controller
```typescript
// apps/api/src/admin/admin-trades.controller.ts

@Get('trades')
getTrades(@Query() filters)

@Get('positions')
getOpenPositions(@Query() filters)

@Get('trades/stats')
getTradeStats()
```

### Enhanced Health Endpoint
```typescript
// Already exists at GET /api/admin/health
// Enhance to return real status for:
// - database, api, websocket, marketData, tradingEngine
```

---

## SECURITY CHECKLIST

For every new endpoint/page:
- ✅ JWT Authentication
- ✅ Role-based Authorization
- ✅ Ownership Verification (user endpoints)
- ✅ Input Validation
- ✅ Audit Logging (admin actions)
- ✅ Error Handling
- ✅ Rate Limiting (if needed)

---

## FILE STRUCTURE

```
apps/
├── api/
│   └── src/
│       ├── admin/
│       │   ├── admin-settings.controller.ts [NEW]
│       │   └── admin-trades.controller.ts [NEW]
│       └── platform-settings/
│           ├── platform-settings.module.ts [NEW]
│           ├── platform-settings.controller.ts [NEW]
│           └── platform-settings.service.ts [NEW]
└── web/
    └── app/
        ├── dashboard/
        │   ├── kyc/
        │   │   └── page.tsx [NEW]
        │   └── payouts/
        │       └── page.tsx [NEW]
        └── admin/
            ├── settings/
            │   └── page.tsx [UPDATE]
            ├── trades/
            │   └── page.tsx [NEW]
            └── health/
                └── page.tsx [NEW]
```

---

## BUILD VERIFICATION CHECKLIST

After implementation:
- [ ] `cd apps/api && npm run build` - No errors
- [ ] `cd apps/web && npm run build` - No errors
- [ ] Search for "Soon" placeholder
- [ ] Search for "coming soon"
- [ ] Search for "TODO"
- [ ] Search for "FIXME"
- [ ] Search for hardcoded user IDs
- [ ] Search for hardcoded account IDs
- [ ] Test admin login
- [ ] Test user login
- [ ] Test ownership (user A cannot access user B data)
- [ ] Test WebSocket authentication
- [ ] Test trading flow end-to-end
- [ ] Test KYC flow
- [ ] Test payout flow
- [ ] Test all admin actions create audit logs

---

## TESTING SCENARIOS

### User Flow:
1. Register → Login
2. Browse challenges → Create order
3. Complete payment (test mode)
4. Receive trading account
5. Go to trading terminal
6. Open trade → Close trade
7. Submit KYC
8. Request payout
9. View notifications
10. Update profile

### Admin Flow:
1. Login as admin
2. View dashboard (real data)
3. Manage users
4. Manage challenge plans
5. Manage trading rules
6. View/approve orders
7. View/approve payments
8. Review KYC
9. Approve/reject payouts
10. View all trades
11. View analytics
12. Configure settings
13. Check system health
14. View audit logs

### Security Testing:
1. Create User A and User B
2. User A tries to access User B's:
   - Trading account
   - Orders
   - Trades
   - Payouts
   - KYC
   - Notifications
3. Should fail with 403 Forbidden
4. Admin should be able to access all

---

## COMPLETION CRITERIA

The project is considered COMPLETE when:
1. ✅ All "Soon" placeholders removed
2. ✅ All navigation links functional
3. ✅ User can complete entire flow without errors
4. ✅ Admin can manage entire platform
5. ✅ No TypeScript errors in build
6. ✅ No runtime errors in console
7. ✅ All ownership checks working
8. ✅ All admin actions audited
9. ✅ WebSocket authentication working
10. ✅ Both frontend and backend builds succeed

---

## NOTES

- **DO NOT** reset database or drop tables
- **DO NOT** delete existing users/accounts/trades
- **DO NOT** break existing functionality
- **ALWAYS** verify ownership on backend
- **ALWAYS** create audit logs for admin actions
- **USE** existing patterns and architecture
- **REUSE** existing services and components
- **TEST** after each phase

