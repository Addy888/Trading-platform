# OANDA market-data integration report

## Scope and safety

OANDA v20 is integrated as a **backend-only market-data provider**. No OANDA order, position, account-mutation, or execution endpoint is used. Existing simulated execution, ownership checks, risk engine, and order management are unchanged.

LIVE requests do not fall back to generated candles. They return a provider error when no genuine provider can supply data. `mode=SIMULATED` remains explicit and is used by the simulated chart path.

## Changed files

- `apps/api/.env.example` — OANDA environment settings and OANDA as the documented primary provider.
- `apps/api/src/market-data/providers/oanda/oanda.provider.ts` — authenticated OANDA v20 client, account/instrument validation, quote and candle normalization.
- `apps/api/src/market-data/market-data-manager.service.ts` — OANDA registry entry, startup credential validation, forex-first routing, cache/deduplication integration, and credential failure state.
- `apps/api/src/market-data/market-data.module.ts` — provider registration.
- `apps/api/src/market-data/market-data.controller.ts` — the normal candle endpoint now uses genuine provider data in LIVE mode and reports the provider used.
- `apps/web/lib/market-api.ts` — simulated calls explicitly declare `mode=SIMULATED`.

## Configuration

Set only in the backend `apps/api/.env` (never `NEXT_PUBLIC_*`):

```dotenv
OANDA_API_TOKEN=personal-access-token
OANDA_ACCOUNT_ID=your-practice-account-id
OANDA_ENVIRONMENT=practice
MARKET_DATA_PROVIDER=OANDA
```

`practice` uses `https://api-fxpractice.oanda.com`. Only `OANDA_ENVIRONMENT=live` selects `https://api-fxtrade.oanda.com`; use it only with an eligible live account. Tokens are sent only in the backend `Authorization: Bearer` header and are never returned by API responses or logged.

To create a token: sign in to the OANDA account-management portal for the intended division/environment, open **Manage API Access** (or **My Services → API Access**), generate a personal access token, copy it once into `apps/api/.env`, and use the account ID shown for that same practice/live account. Restart the API. Do not substitute a UUID unless OANDA accepts it as the personal access token.

## API behavior

Startup validates configured credentials with `GET /v3/accounts/{accountID}/summary`. Requests validate instrument availability with `GET /v3/accounts/{accountID}/instruments?instruments=...` before use.

Canonical mappings include `EUR/USD` → `EUR_USD`, `GBP/USD` → `GBP_USD`, and `USD/JPY` → `USD_JPY` (the legacy `EURUSD` form is also normalized). The account instrument response is authoritative: this integration does not claim support for stocks, crypto, commodities, or every forex pair.

Candles use `GET /v3/instruments/{instrument}/candles?granularity=...&count=...&price=M`, discard incomplete/malformed/invalid OHLC bars, retain decimal precision during normalization, and return chronological candles.

| UI interval | OANDA granularity |
| --- | --- |
| 1m | M1 |
| 5m | M5 |
| 10m | M10 |
| 15m | M15 |
| 30m | M30 |
| 1h | H1 |
| 4h | H4 |
| 1d | D |

## Provider health and failures

Configured providers begin `UNVERIFIED`; they become `AVAILABLE` only after a successful request. OANDA becomes `AVAILABLE` after a successful account-summary validation. HTTP 401/403 is `INVALID_CREDENTIALS` and is not retried indefinitely. Twelve Data quota cooldown does not stop OANDA polling or routing. Shared five-minute candle caching and in-flight request deduplication remain in the manager.

## Verification performed on 2026-10-20

- `npm run build` in `apps/api`: passed.
- `npm run build` in `apps/web`: passed.
- Credential and live-response tests: **not run**. The local backend environment contains no `OANDA_API_TOKEN`, `OANDA_ACCOUNT_ID`, or `OANDA_ENVIRONMENT` entries, so no genuine OANDA request can be honestly claimed.

After credentials are added, verify in this order: inspect provider status for a successful OANDA validation; request an EUR/USD quote; request EUR/USD candles for M1, M10, M5, M15, M30, H1, H4, and D; then confirm the TradingView Lightweight Charts view displays the non-empty returned bars. Also verify an invalid token produces `INVALID_CREDENTIALS` and an unavailable account instrument returns its explicit OANDA error.
