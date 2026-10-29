# Wallet-Funded Direct Trading Accounts & Modern Fintech Dashboard UX Report

**Date:** October 21, 2026  
**System:** `tradeing` Prop & Fintech Trading Platform  
**Target Environment:** Local / Production-Ready  
**Execution Mode:** `SIMULATED` (with strict market data safety)  

---

## Executive Summary

The platform has been redesigned and upgraded from a restrictive challenge-only prop model to an open, dual-mode trading architecture. Users are **no longer forced** to buy a challenge plan to access trading. Instead, users can deposit funds directly into their platform wallet, create dedicated simulated trading accounts, and transfer wallet funds atomically into their trading accounts with comprehensive ledger tracking.

All frontend and backend builds have completed with 0 errors, all unit test suites pass (59/59), and the end-to-end integration and security test suite verified the complete user journey and ownership boundaries.

---

## 1. Key Changes & Architecture

### A. Removal of the Challenge-Only Trading Gate
* **Previous behavior:** Users navigating to `/dashboard/trading` with zero accounts saw a large blue blocker panel: *"No Trading Accounts Available — Purchase a challenge to start trading."*
* **New behavior:**
  * Replaced the blocker with a clean, dark-mode fintech interface.
  * When accounts exist: displays interactive account cards with account numbers, status badges, execution mode badges (`SIMULATED`), current balance, equity, and an **"Open Trading Terminal"** button.
  * When no accounts exist: displays an actionable empty state with two prominent calls to action: **"Create Trading Account"** and **"Deposit Funds to Wallet"**, plus an optional link to evaluate prop challenges if desired.
  * Removed aggressive auto-redirect behavior that prevented users from inspecting or managing multiple trading accounts.

### B. Direct Wallet-Funded Account Creation
* **Database Schema Update:**
  * Made `challengePlanId` and `orderId` nullable in `trading_accounts` table.
  * Added `executionMode` column (`VARCHAR(50) DEFAULT 'SIMULATED'`).
  * Default stage set to `AccountStage.FUNDED`.
* **Backend Endpoint:** `POST /trading-accounts`
  * Generates sequential unique account numbers (`TRD-${year}-${sequence}`).
  * Assigns the default active standard `RuleSet`.
  * Creates an immutable rule snapshot via `RuleSnapshotService` so future rule changes do not affect existing accounts.
  * Initializes account state via `AccountStateService` with `stage: FUNDED` and `status: ACTIVE`.
  * Atomically creates the initial account snapshot via `AccountSnapshotsService`.
  * If initial funding is specified, checks sufficient wallet balance, debits wallet balance, and writes a `TRANSFER_TO_TRADING` ledger entry in the same transaction.

### C. Fund Separation & Double-Count Prevention
* **Four Independent Balances:**
  1. **Platform Wallet Balance:** Stored in `wallets.balance`. Only modified via verified deposits, withdrawals, or explicit wallet ↔ trading account transfers.
  2. **Trading Account Balance:** Stored in `trading_accounts.currentBalance`. Represents realized cash deposited into the trading account plus realized P&L from closed trades.
  3. **Account Equity:** Stored in `trading_accounts.equity`. Balance plus unrealized P&L of open positions.
  4. **Available Margin:** Calculated dynamically via `TradingV2Service` based on open position leverage and fresh quotes.
* Funds are **never double-counted**. A transfer is an atomic debit on one side and an atomic credit on the other side within a single MySQL transaction.

### D. Redesigned User Dashboard (`/dashboard`)
* **Top Navigation:**
  * Modernized platform logo with `SIMULATED` pill.
  * Quick **"Deposit Funds"** CTA in top bar.
  * Notification bell with unread indicators.
  * User avatar dropdown with profile details and quick links.
  * Responsive hamburger navigation toggle and mobile drawer.
* **Dashboard Summary Grid:**
  * **Platform Wallet:** Real-time wallet balance with direct deposit link.
  * **Selected Trading Account:** Real-time account balance with status pill.
  * **Account Equity:** Real-time equity and unrealized P&L color-coded calculation.
  * **Available Margin:** Real-time free margin or explicit *"Unavailable"* state when live quotes are missing.
* **Trading Accounts Grid:**
  * Cards showing account number, execution mode, status, balance, equity, P&L, and quick actions.
  * Interactive selection updates the top summary metrics dynamically.
* **Recent Activity Feed:**
  * **Wallet & Transfer History:** Real-time feed of credits and debits from the `wallet_ledgers` table with timestamps.
  * **Recent Trading Activity:** Real-time feed of recent orders and trades.

### E. Market Data Safety & Execution Mode Transparency
* Real-world broker data from OANDA is strictly guarded:
  * Stale or unavailable pricing explicitly disables order buttons with clear guidance.
  * Simulated execution is clearly labeled `SIMULATED` throughout the UI.
  * No simulated prices are misrepresented as live broker execution.

---

## 2. Files Modified & Added

| Component | File Path | Description |
|---|---|---|
| **Backend Schema** | `apps/api/prisma/schema.prisma` | Nullable `challengePlanId` and `orderId`, added `executionMode` and `stage: FUNDED`. |
| **Backend Service** | `apps/api/src/trading-accounts/trading-accounts.service.ts` | Added `createWalletFundedAccount` and `generateAccountNumber` logic. |
| **Backend Controller** | `apps/api/src/trading-accounts/trading-accounts.controller.ts` | Exposed `POST /trading-accounts` endpoint with JWT authentication. |
| **Backend Module** | `apps/api/src/trading-accounts/trading-accounts.module.ts` | Added `AccountSnapshotsModule` import. |
| **Backend State Service** | `apps/api/src/trading-accounts/account-state.service.ts` | Added `stage` argument defaulting to `AccountStage.CHALLENGE` with support for `FUNDED`. |
| **Backend Payments** | `apps/api/src/payments/payments.service.ts` | Added security ownership validation prior to wallet debit checks in transfers. |
| **Backend Safety Fix** | `apps/api/src/dashboard/dashboard.service.ts` | Added optional chaining `a.challengePlan?.name` to prevent null pointer crashes on direct accounts. |
| **Backend Safety Fix** | `apps/api/src/trading-engine/admin-trading.controller.ts` | Added optional chaining `account.challengePlan?.name` with fallback. |
| **Frontend Layout** | `apps/web/components/layout/user-layout.tsx` | Added responsive mobile navigation drawer, brand identity, and fintech top navigation. |
| **Frontend Trading Page** | `apps/web/app/dashboard/trading/page.tsx` | Replaced challenge gate with account cards, create account modal, fund modal, and clean empty state. |
| **Frontend Main Dashboard** | `apps/web/app/dashboard/page.tsx` | Redesigned into full fintech dashboard with 4-metric summary, accounts grid, and ledger history. |
| **Frontend Accounts Page** | `apps/web/app/dashboard/accounts/page.tsx` | Updated empty state to direct users to create accounts and deposit to wallet. |
| **Frontend Terminal** | `apps/web/app/dashboard/trading/[accountId]/page.tsx` | Added `SIMULATED` execution mode badge to terminal top bar. |
| **Frontend API Clients** | `apps/web/lib/trading-api.ts` & `trading-accounts-api.ts` | Added `createTradingAccount` / `createAccount` methods, updated types for nullable challenge plans. |
| **Frontend Safety Fixes** | `apps/web/app/dashboard/trades/page.tsx` & admin pages | Added safe optional chaining for `challengePlan?.name`. |
| **Integration Test** | `test-wallet-funded-journey.js` | Complete end-to-end integration and security test suite. |

---

## 3. Verification & Test Results

### 1. Backend Unit & Security Test Suite
Ran:
```bash
npm test -- payments.service.spec.ts orders.service.spec.ts trading-accounts.controller.spec.ts account-state.service.spec.ts
```
**Result:**
* **Test Suites:** 4 passed, 4 total
* **Tests:** 59 passed, 59 total
* **Security Checks Verified:**
  * User can only view their own accounts and progress.
  * Intruder cannot access another user's account details (403 Forbidden).
  * Webhook replay attack protection (HMAC timestamp tolerance 300s).
  * Webhook duplicate idempotency (no double-crediting).
  * Atomic transfer checks and balance isolation.

### 2. Frontend Production Build
Ran:
```bash
npm run build (in apps/web)
```
**Result:**
* `next build` compiled cleanly with 0 TypeScript errors.
* 38 static and dynamic routes successfully generated.

### 3. Backend Production Build
Ran:
```bash
npm run build (in apps/api)
```
**Result:**
* `nest build` exited with code 0.

### 4. Live End-to-End User Journey Test (`test-wallet-funded-journey.js`)
Executed against live running NestJS server:
```
================================================================
🚀 TESTING WALLET-FUNDED TRADING JOURNEY & SECURITY ENFORCEMENT
================================================================

[1] Registering User 1: trader_382504@test.com...
✅ User 1 registered. UserID: ce2b6556-a7f3-4591-b46a-744db0277830
[2] Registering User 2 (Intruder): intruder_382504@test.com...
✅ User 2 registered.
[3] Checking User 1 trading accounts (expecting 0)...
✅ User 1 has 0 accounts. Verified empty state triggers correctly.
[4] Checking User 1 wallet balance...
✅ User 1 wallet verified: $0
[5] Initiating $500.00 deposit via Simulation Provider...
✅ Deposit initiated: ProviderRef=SIM-1792601492871-8fe6f823cbf0
[6] Submitting HMAC-SHA256 verified webhook for payment confirmation...
✅ Webhook verified and processed. Credited to wallet.
[7] Submitting duplicate webhook to verify idempotency (replay attack protection)...
✅ Duplicate webhook safely ignored (alreadyProcessed=true). No double crediting!
[8] Checking wallet balance after deposit...
✅ Wallet balance confirmed: $500
[9] Creating direct wallet-funded trading account with $200.00 initial funding...
✅ Trading Account created successfully!
   Account Number : TRD-2026-917434
   Status         : ACTIVE
   Stage          : FUNDED
   Execution Mode : SIMULATED
   Initial Balance: $200
   Current Balance: $200
   Current Equity : $200
[10] Verifying wallet balance after $200 initial funding...
✅ Wallet balance is now exactly $300. Distinct balance preserved!
[11] Transferring additional $100.00 from Wallet to Trading Account...
✅ Transfer successful!
   New Wallet Balance : $200.00
   New Account Balance: $300.00
   New Account Equity : $300.00
[12] Security Test: Intruder (User 2) attempts to transfer funds to User 1's Trading Account...
✅ Intruder transfer blocked with 403 Forbidden! Ownership enforced.
[13] Security Test: Intruder attempts to fetch User 1's Account details...
✅ Intruder account view blocked with 403 Forbidden! Ownership enforced.
[14] Overdraft Test: User 1 attempts to transfer $9,999.00 (wallet only has $200)...
✅ Overdraft blocked with 400 Bad Request! Wallet balance protected.
[15] Checking complete Wallet Ledger audit trail for User 1...
✅ Ledger entries recorded: 3
   [1] TRANSFER_TO_TRADING (DEBIT): $100 | BalBefore: $300 -> BalAfter: $200
   [2] TRANSFER_TO_TRADING (DEBIT): $200 | BalBefore: $500 -> BalAfter: $300
   [3] DEPOSIT (CREDIT): $500 | BalBefore: $0 -> BalAfter: $500

================================================================
🎉 ALL INTEGRATION & SECURITY ASSERTIONS PASSED PERFECTLY!
================================================================
```

---

## 4. Remaining Payment Provider Configuration Requirements

1. **Stripe Integration (When Moving to Live Fiat Deposits):**
   * Provide `STRIPE_SECRET_KEY` in `apps/api/.env`.
   * Provide `STRIPE_WEBHOOK_SECRET` in `apps/api/.env`.
   * Configure Stripe webhook endpoint: `https://<domain>/api/payments/webhook/stripe`.
   * Enable events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`.
2. **Simulation Provider (Current Development / Sandbox Mode):**
   * Configured with HMAC-SHA256 signing secret `dev-simulated-webhook-secret-tradeing-platform-2026`.
   * Allows deposit testing and checkout testing via `/dashboard/wallet/checkout` without requiring external merchant accounts.
3. **OANDA Market Data & Broker Credentials:**
   * `OANDA_API_TOKEN` configured in `apps/api/.env`.
   * `OANDA_ACCOUNT_ID` is optional for historical candle rendering, but required for account-specific real-time bid/ask pricing and live broker execution.
   * Execution is safely isolated as `SIMULATED` until broker credentials are fully verified.
