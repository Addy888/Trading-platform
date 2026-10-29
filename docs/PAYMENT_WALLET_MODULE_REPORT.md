# Module 1: Payment Integration → User Wallet → Trading Account Balance Report

**Status:** Completed & Validated  
**Module:** Payment Lifecycle, Platform Wallet & Account Funding Module  
**Repository:** `tradeing` platform (`apps/api`, `apps/web`, MySQL Database)  
**Verification Date:** 2026-10-21  

---

## 1. Executive Summary

Module 1 has been implemented to establish an auditable, decimal-safe, atomic, and idempotent payment lifecycle independently of OANDA market-data feeds. 

Verified incoming payments credit the user's platform wallet balance. Funds deposited in the user's platform wallet are kept strictly separate from trading account balances and trading P&L equity. Transfers between the platform wallet and trading accounts require an explicit, authorized, atomic transaction that updates both balances and records an immutable ledger entry.

Crucially:
- **Never credit on page visits:** Frontend page visits or redirects cannot credit balances.
- **Cryptographic Verification:** Balances are only credited after the backend verifies signed server-to-server webhooks using HMAC-SHA256 signatures with replay-attack protection.
- **Idempotency & Atomicity:** Database transactions ensure duplicate or concurrent webhooks cannot create duplicate credits.
- **Audit Integrity:** Administrators cannot silently mutate balances without a mandatory audit reason and an immutable ledger record.

---

## 2. Existing Code Reused

1. **Authentication & User Roles:** Reused `JwtAuthGuard`, `RolesGuard`, `User` entity, and role enforcement (`ADMIN` / `USER`).
2. **Order & Challenge Flow:** Reused `Order` and `ChallengePlan` models and services, while decoupling `Payment` from being strictly tied to `Order`.
3. **Audit Log System:** Reused `prisma.auditLog` to record structured security, initiation, verification, and adjustment audit entries without sensitive payment credentials.
4. **Trading Accounts Model & Engine:** Reused `TradingAccount` status checks, balance, and equity definitions while preserving simulated trading engine isolation and risk limit rules.
5. **Admin Layout & Navigation:** Reused `AdminLayout`, `UserLayout`, and `ProtectedRoute` components in Next.js frontend.

---

## 3. Files Created and Modified

### Backend (`apps/api`)
- `prisma/schema.prisma`:
  - Added `SUCCESS` and `CANCELLED` to `PaymentStatusExtended`.
  - Added `Wallet` model (`userId`, `currency`, `balance`, `lockedBalance`).
  - Added `WalletLedger` model and `WalletLedgerType`, `LedgerDirection` enums.
  - Decoupled `Payment` (`orderId` made nullable, added `userId`, `walletId`, unique `providerReference`, and unique `idempotencyKey`).
- `apply-payment-wallet-migration.js`: Safe MySQL migration script applying schema updates, indexes, foreign keys, and seeding existing user wallets.
- `src/payments/providers/payment-provider.interface.ts`: Standardized provider interface (`createCheckoutSession`, `verifyWebhook`, `getPaymentDetails`).
- `src/payments/providers/simulation.provider.ts`: Provider implementation with cryptographic HMAC-SHA256 verification and replay-attack protection.
- `src/payments/providers/stripe.provider.ts`: Provider implementation for official Stripe Checkout & signed webhook verification.
- `src/payments/providers/payment-provider.factory.ts`: Dynamic provider resolver.
- `src/payments/dto/initiate-deposit.dto.ts`: Validates deposit amount, currency, and redirect URLs.
- `src/payments/dto/transfer-funds.dto.ts`: Validates wallet ↔ trading account atomic transfers.
- `src/payments/dto/admin-adjustment.dto.ts`: Enforces mandatory audit reasons and direction for manual adjustments.
- `src/payments/dto/payments-query.dto.ts`: Pagination and query filtering DTO.
- `src/payments/payments.service.ts`: Core atomic business logic for wallets, deposits, webhook processing, transfers, and ledger accounting.
- `src/payments/payments.controller.ts`: Authenticated user wallet endpoints and public provider webhook receiver.
- `src/payments/payments.module.ts`: NestJS module wiring.
- `src/admin/admin-payments.service.ts`: Enhanced with atomic ledger adjustments and audit logs.
- `src/admin/admin-payments.controller.ts`: Exposed `/admin/payments/adjust-balance` endpoint.
- `src/admin/admin.module.ts`: Imported `PaymentsModule`.
- `src/app.module.ts`: Imported `PaymentsModule`.
- `src/auth/auth.service.ts`: Auto-initializes wallet upon user registration.
- `src/main.ts`: Configured NestFactory with `{ rawBody: true }` for cryptographic webhook signature verification.
- `src/orders/orders.service.ts`: Fixed `rejectPayment` return object.
- `src/orders/orders.service.spec.ts`: Added missing mocks for `AccountStateService` and `RuleSnapshotService`.
- `src/payments/payments.service.spec.ts`: Comprehensive test suite with 18 test cases.
- `tsconfig.json` & `tsconfig.build.json`: Resolved Jest typing and NestJS build separation.

### Frontend (`apps/web`)
- `lib/payments-api.ts`: API client with TypeScript interfaces for `Wallet`, `WalletLedger`, `Payment`, deposits, transfers, and admin adjustments.
- `components/layout/user-layout.tsx`: Added "Wallet & Deposits" navigation item.
- `app/dashboard/wallet/page.tsx`: Full user wallet page displaying verified live balance, deposit checkout triggers, atomic trading account funding, and transaction ledger table.
- `app/dashboard/wallet/checkout/page.tsx`: Simulation checkout sandbox for testing cryptographically signed server-to-server webhook flows.
- `app/admin/payments/page.tsx`: Admin payment audit table with search, filters, provider references, and manual balance adjustment modal.

---

## 4. Payment Lifecycle & Separation of Balances

### State Machine
```
[User Request]
       │
       ▼
[PENDING] ──(Provider Checkout Session Created, Unique Reference Assigned)
       │
       ├── Webhook verified: SUCCESS ──► [SUCCESS] ──► Atomic MySQL Ledger Credit ──► User Wallet
       │
       ├── Webhook verified: FAILED  ──► [FAILED]  ──► Zero Balance Credit, Audit Log Recorded
       │
       ├── Webhook verified: CANCEL  ──► [CANCELLED]──► Zero Balance Credit, Audit Log Recorded
       │
       └── Refund event: REFUNDED    ──► [REFUNDED] ──► Immutable Refund Ledger Entry
```

### Destination of Funds
| Concept | Definition | Storage | Mutated By |
|---|---|---|---|
| **Platform Wallet Balance** | User's deposited platform capital | `wallets.balance` | Verified payment webhooks, authorized transfers to/from trading accounts, auditable admin adjustments |
| **Trading Account Balance** | Balance assigned to a simulated/funded trading account | `trading_accounts.currentBalance` | Explicit authorized transfers from wallet, trade execution P&L |
| **Trading Equity** | Account Balance + Realized & Unrealized Trade P&L | `trading_accounts.equity` | Real-time position mark-to-market and trading engine |

---

## 5. Security & Idempotency Controls

1. **HMAC-SHA256 Signature Verification:**
   - Provider webhooks must present valid HMAC signatures matching the secret stored in backend environment variables.
   - Timing-safe buffer comparison (`crypto.timingSafeEqual`) prevents timing attack vulnerabilities.
2. **Replay-Attack Protection:**
   - Webhook timestamp header is verified against server time; timestamps exceeding a 300-second window are rejected immediately.
3. **Database-Level Idempotency:**
   - Unique constraints on `payments.providerReference` and `payments.idempotencyKey`.
   - Before applying a credit, the transaction queries the existing status. If `SUCCESS` or `COMPLETED`, it bails out immediately without creating duplicate credits.
4. **Amount and Currency Validation:**
   - The reported provider amount and currency are verified against the original pending payment. Discrepancies abort the transaction and write a security alert audit log.
5. **Client Sanitization:**
   - Amounts, user IDs, and success flags provided in browser requests are never trusted. All calculations use `Decimal.js` fixed-point decimal arithmetic.

---

## 6. Build and Test Verification Results

### Backend (`apps/api`)
```
Test Suites: 2 passed, 2 total
Tests:       36 passed, 36 total
Snapshots:   0 total
Time:        22.566 s
Ran all test suites matching /src\payments\payments.service.spec.ts|src\orders\orders.service.spec.ts/i.

> api@1.0.0 build
> nest build
✓ Built successfully without errors
```

### Frontend (`apps/web`)
```
> web@0.1.0 build
> next build

✓ Compiled successfully in 6.5s
✓ Generating static pages using 11 workers (38/38) in 1891ms
Route (app)
├ ○ /dashboard/wallet
├ ○ /dashboard/wallet/checkout
├ ○ /admin/payments
✓ All 38 routes prerendered and optimized
```

---

## 7. Payment Provider Configuration & Environment

To use **Stripe** in production or live staging, set these in `apps/api/.env`:
```env
PAYMENT_PROVIDER=STRIPE
STRIPE_SECRET_KEY=sk_test_... (or live sk_live_...)
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:3000
PAYMENT_WEBHOOK_SECRET=your-secure-internal-hmac-key
```

When `STRIPE_SECRET_KEY` is omitted, the platform runs in `SIMULATION` mode, ensuring full offline testability with signed HMAC-SHA256 webhooks.

> **Operational Notice:** No real payment charges or live credentials were used during verification. Do not deploy to a public gateway or initiate real customer charges without explicit operational authorization and live Stripe webhook endpoint registration.
