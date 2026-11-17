# TEST FUNDING CONFIGURATION

## Overview

The ASSETS FUNDED platform includes a secure, isolated test funding mechanism for development and testing environments.

## Security Features

✅ **Environment Restricted**: Only works in `development` or `test` NODE_ENV (never in `production`)
✅ **User Whitelist**: Requires explicit user ID configuration (no wildcards)
✅ **Single Account**: Each user can only create one test-funded account
✅ **Audit Logged**: All test funding actions are logged
✅ **Separate Flag**: Test accounts are marked with `isTestAccount: true`

## Configuration

Add these environment variables to `apps/api/.env`:

```bash
# Test Funding Configuration (Development/Test Only)
NODE_ENV=development
SIMULATED_TEST_FUNDING_ENABLED=true
SIMULATED_TEST_USER_IDS=<your-user-id-here>
SIMULATED_TEST_INITIAL_BALANCE=10000.00
```

## Getting Your User ID

1. Register a user account via the frontend
2. Login and check the browser console or network tab
3. Copy your user ID from the JWT token or API responses
4. Add it to `SIMULATED_TEST_USER_IDS` in `.env`

For multiple test users, use comma-separated IDs:
```bash
SIMULATED_TEST_USER_IDS=user-id-1,user-id-2,user-id-3
```

## Creating a Test-Funded Account

### Via API

```bash
POST /api/trading-accounts
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "testFunding": true
}
```

### Response

```json
{
  "id": "account-uuid",
  "accountNumber": "ACC-123456",
  "userId": "user-uuid",
  "initialBalance": "10000.00",
  "currentBalance": "10000.00",
  "equity": "10000.00",
  "status": "ACTIVE",
  "isTestAccount": true,
  "executionMode": "SIMULATED"
}
```

## Restrictions

- ❌ Cannot be enabled in production (NODE_ENV check)
- ❌ Cannot use wildcard user IDs (explicit whitelist required)
- ❌ Cannot specify custom amount (uses server-configured balance)
- ❌ Cannot create multiple test accounts per user
- ❌ Cannot convert test account to real account

## Verification

Check if test funding is available for your user:

```bash
GET /api/trading-accounts/test-funding-status
Authorization: Bearer <your-jwt-token>
```

Response:
```json
{
  "enabled": true,
  "initialBalance": "10000.00",
  "currency": "USD",
  "label": "SIMULATED TEST FUNDS"
}
```

## Production Safety

The test funding mechanism includes multiple safety layers:

1. **Environment Check**: Hard-coded to reject `NODE_ENV=production`
2. **Explicit Enablement**: Requires `SIMULATED_TEST_FUNDING_ENABLED=true`
3. **User Whitelist**: Requires user IDs in `SIMULATED_TEST_USER_IDS`
4. **Database Flag**: Test accounts marked with `isTestAccount: true`
5. **Audit Trail**: All actions logged to `audit_logs` table

## Example: Complete Setup

```bash
# 1. Set environment variables
echo "NODE_ENV=development" >> apps/api/.env
echo "SIMULATED_TEST_FUNDING_ENABLED=true" >> apps/api/.env
echo "SIMULATED_TEST_USER_IDS=04e1be1d-e5e7-4894-a38e-f37378b56b71" >> apps/api/.env
echo "SIMULATED_TEST_INITIAL_BALANCE=10000.00" >> apps/api/.env

# 2. Restart API server
cd apps/api
npm run start:dev

# 3. Create test account via API
curl -X POST http://localhost:3001/api/trading-accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"testFunding": true}'

# 4. Verify account has balance
curl http://localhost:3001/api/trading-accounts/YOUR_ACCOUNT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Implementation Details

### Source Code

- **Service**: `apps/api/src/trading-accounts/trading-accounts.service.ts`
- **Method**: `createWalletFundedAccount(userId, { testFunding: true })`
- **Authorization**: `isTestFundingAuthorized(userId)`
- **Balance Config**: `getSimulatedTestBalance()`

### Database Schema

```sql
CREATE TABLE trading_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  is_test_account BOOLEAN DEFAULT FALSE,
  test_funding_user_id UUID UNIQUE,
  initial_balance DECIMAL(12,2),
  current_balance DECIMAL(12,2),
  execution_mode VARCHAR DEFAULT 'SIMULATED',
  ...
);
```

### Audit Log Entry

```json
{
  "action": "TRADING_ACCOUNT_CREATED",
  "actorId": "user-uuid",
  "entityType": "TradingAccount",
  "entityId": "account-uuid",
  "metadata": {
    "isTestAccount": true,
    "testFunding": true,
    "initialBalance": "10000.00",
    "executionMode": "SIMULATED"
  }
}
```

## Troubleshooting

### "Simulated test funding is disabled or this user is not authorized"

**Cause**: Environment not configured or user not whitelisted

**Solution**:
1. Check `NODE_ENV` is `development` or `test`
2. Check `SIMULATED_TEST_FUNDING_ENABLED=true`
3. Check your user ID is in `SIMULATED_TEST_USER_IDS`
4. Restart API server after changing `.env`

### "This user already has a simulated test account"

**Cause**: One test account per user limit

**Solution**:
- Delete existing test account, or
- Use the existing test account, or
- Create a new user for additional testing

### Test funding not available in production

**Expected behavior** - This is a security feature, not a bug.

Test funding is intentionally blocked in production to prevent unauthorized account funding.
