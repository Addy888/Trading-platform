# Simulated test account funding

The test-funding option creates one account per allowlisted user with a server-configured virtual balance (default **$10,000.00 USD**). The amount cannot be selected by the client. It does not create a payment or deposit, debit the wallet, write a wallet ledger entry, or provide withdrawable funds. The account remains in simulated execution mode and uses the existing account state, risk rules, and snapshots.

## Enable for an approved development/test user

In `apps/api/.env`, set:

```dotenv
SIMULATED_TEST_FUNDING_ENABLED=true
SIMULATED_TEST_USER_IDS=the-approved-user-id
SIMULATED_TEST_INITIAL_BALANCE=10000.00
```

For multiple approved test users, use a comma-separated list of user IDs. Obtain the user ID from a trusted development/admin context; do not make a public allowlist or use client-supplied identity. `SIMULATED_TEST_INITIAL_BALANCE` is server-controlled, defaults to `$10,000.00`, and must be positive with at most two decimal places. Restart the API after changing configuration. The API only enables this feature when `NODE_ENV` is exactly `development` or `test`; it is always rejected in production. The sample `.env.example` keeps the feature disabled and the allowlist empty by default.

Open **Trading Accounts → Create Trading Account**, select **TEST MODE / SIMULATED FUNDS**, review the configured virtual-funds notice (default `$10,000.00`), and create the account. The backend fixes the amount from server configuration (clients cannot choose a test amount), checks the authenticated user's allowlist entry, and permits at most one test-funded account per user. Repeated/concurrent attempts are blocked by a database unique constraint.

## Database update

The schema adds `isTestAccount` and a nullable unique `testFundingUserId` marker. Apply the checked-in MySQL migration with the project's normal migration release process before starting the new API code:

```powershell
cd apps/api
npx prisma migrate deploy
```

Existing accounts default to `isTestAccount=false`; this migration does not update wallet, payment, or existing account balances.

## Simulated order pricing

Only accounts whose persisted execution mode is `SIMULATED` may use this order path. An accepted simulated order uses the latest Twelve Data `quote` last price only when its provider timestamp is within the configured freshness window. The same last-price policy is used when closing simulated positions. No bid, ask, spread, broker fill, or real execution is inferred. Simulated margin and P&L are account calculations, not executable broker valuations; stale or unavailable provider prices block new simulated orders and position closes. Real, paper, and broker-sandbox execution remain blocked until an authorized execution integration is configured.

The terminal labels these orders, account values, and trade-history P&L as simulated. These values do not represent a broker execution or guarantee that a market could be traded at the displayed price.

## Verification

Validation performed: Prisma schema validation passed; the API build passed; the web production build passed; and the focused account-service/risk-state tests passed (25 tests). The schema migration has not been applied to a database. No real provider/payment or wallet transaction was attempted.
