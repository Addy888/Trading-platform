# OANDA Authentication and Position Pricing Report

## Outcome

Position valuation now requires a fresh OANDA quote and uses the side a position would actually close at: bid for BUY positions and ask for SELL positions. Without a fresh quote, current price and unrealized P&L remain unavailable; entry prices and candle closes are not substituted. Ownership and existing risk checks remain enabled.

The production OANDA connection is **not verified**. The backend's practice-environment EUR/USD H1 candle request was rejected by OANDA with HTTP 401, so no live candles, quotes, frontend data flow, or rendered live chart could be verified. The application's active trading account is not an OANDA account.

## Authentication and configuration evidence

- The backend loads its environment from `apps/api/.env` using `apps/api/src/config/env-loader.ts`. The runtime diagnostic confirmed that `OANDA_API_TOKEN` is configured and `OANDA_ACCOUNT_ID` is absent; it did not print the token.
- `OANDA_ENVIRONMENT` is `practice`, selecting `https://api-fxpractice.oanda.com`. There is no automatic switch to live.
- The provider uses the official OANDA v20 bearer-token authorization header; the credential value is never emitted.
- A fresh authenticated request was made on 2026-10-21 to `GET /v3/instruments/EUR_USD/candles?granularity=H1&count=2&price=M` on the selected practice host. The request read the backend `.env` directly and printed only whether variables were configured, the environment/host, HTTP status, candle count, and sanitized error.
- Result: **HTTP 401**. Sanitized response: `Insufficient authorization to perform request.` Candles received: **0**.
- OANDA rejected the supplied credential at the configured practice host. This does not distinguish a revoked/invalid token from a token for a different environment. Verify the token and environment in the OANDA account console; do not paste it into source, frontend configuration, logs, or reports.
- Candle retrieval is account-independent. Account-specific instruments and `/pricing` quotes require the actual OANDA account ID. No quote request was made because that ID is not configured; the app's internal trading account ID was not used as a substitute.

## Root causes and behavior

1. The empty chart follows the real OANDA candle request failing authentication. Since OANDA returned no candles, the chart correctly has no genuine data to render.
2. Bid/ask and open-position current prices are unavailable because no OANDA account ID is configured for account-specific pricing, and the configured token was rejected for candles as well.
3. The previous valuation path could report unavailable positions when pricing failed. The revised path keeps positions visible with null/unavailable current price and P&L, and does not disguise an entry price or candle close as an executable quote.
4. Candle, quote, and account-specific pricing health are reported separately. Authentication and rate-limit failures are terminal/cooldown states rather than unbounded retries.
5. An audit of active backend/frontend source found no Twelve Data or Finnhub calls and no simulated quote/candle generator. The remaining simulated behavior is paper-order execution based on market data; it does not generate or substitute market prices.

## Changes made for position pricing and verification

- `apps/api/src/market-data/market-price.service.ts`
- `apps/api/src/market-data/market-price.service.spec.ts`
- `apps/api/src/market-data/market-data-engine.service.ts`
- `apps/api/src/market-data/market-data-manager.service.ts`
- `apps/api/src/market-data/market-data-manager.service.spec.ts`
- `apps/api/src/market-data/providers/oanda/oanda.provider.spec.ts`
- `apps/api/src/trading-engine/trading-engine.service.ts`
- `apps/api/src/trading-engine/trading-engine.service.spec.ts`
- `apps/api/src/trading-engine/admin-trading.controller.ts`
- `apps/api/src/trading-engine/balance-equity.service.ts`
- `apps/api/src/trading-engine/balance-equity.service.spec.ts`
- `apps/api/src/trading-engine/margin.service.ts`
- `apps/api/src/trading-engine/margin.service.spec.ts`
- `apps/api/src/realtime/realtime.service.ts`
- `apps/api/src/analytics/performance-analytics.service.ts`
- `apps/web/app/dashboard/trading/[accountId]/page.tsx`
- `apps/web/hooks/useOandaQuotes.ts`
- `apps/web/lib/market-api.ts`

- `apps/web/lib/authenticated-fetch.ts`
- `apps/web/lib/notifications-api.ts`
- `apps/web/lib/trading-api.ts`
- `apps/web/lib/auth-context.tsx`
- `docs/OANDA_AUTH_AND_POSITION_PRICING_REPORT.md`

The trading page now presents separate, actionable setup instructions for a rejected/missing OANDA token and missing OANDA account ID. The app account ID is explicitly not a substitute. It allows the chart-candle path to proceed without `OANDA_ACCOUNT_ID` when token authentication succeeds, and prevents new orders unless the selected OANDA quote has valid bid/ask values and a timestamp within the backend freshness window. The backend still validates quote freshness, execution price, account ownership, and risk before an order is created.

The live credential check was repeated on 2026-10-21 using the token loaded from the backend `.env`. It selected the practice host from `OANDA_ENVIRONMENT`, made one account-independent EUR/USD H1 candle request, and emitted no credential value. OANDA again returned HTTP 401 with `Insufficient authorization to perform request.` No real candle, bid/ask quote, position valuation, or P&L result can be reported as successful.

The H1 provider test also verifies chronological timestamp and OHLC normalization using a mocked OANDA response. This validates normalization logic, not live API access.

## Verification

| Check | Result |
|---|---|
| Backend environment path and safe credential diagnostic | Passed; token configured, OANDA account ID absent; secret value not emitted |
| Practice endpoint selection and authentication-header implementation | Confirmed from configuration and provider |
| Real OANDA EUR/USD H1 candle request | **HTTP 401**, sanitized message above |
| Genuine candles returned | **No; 0** |
| Real account-specific bid/ask quote request | Not attempted; OANDA account ID absent |
| Historical candles without account ID | Supported by implementation and provider unit tests; live call rejected by OANDA authentication |
| Position pricing with no quote | Automated test confirms current price and P&L remain unavailable |
| BUY/SELL close-side pricing | Automated tests confirm BUY uses bid and SELL uses ask |
| Position ownership check | Automated test passed |
| OANDA candle normalization and interval mapping | Automated tests passed, including H1 chronological normalization and requested interval mappings |
| Backend production build | Passed |
| Frontend production build and TypeScript validation | Passed |
| Focused test run | **5 suites, 52 tests passed** |
| `git diff --check` | Passed on tracked changes; the new report contains no whitespace errors |
| New-order safety | UI requires a valid, fresh bid/ask quote; backend independently rejects unavailable or stale prices before order creation |
| Live frontend/API request and browser chart rendering | Not verified; OANDA returned no candles and no authenticated browser session was available |

An earlier broader test attempt had unrelated test-fixture/formatting failures: the V2 trading-engine suite did not provide its `BalanceEquityService` dependency, and balance-equity expectations included Decimal trailing-zero formatting. The focused suites above passed; those broader failures are not represented as passing.

## Required next steps

1. Generate or confirm a valid OANDA personal access token for the **practice** environment and set `OANDA_API_TOKEN` in the ignored backend `apps/api/.env`.
2. Restart the backend and retry the EUR/USD H1 candle request. Do not claim live candle/chart operation until OANDA returns candles through the backend.
3. If account-specific bid/ask and live position valuation are needed, set `OANDA_ACCOUNT_ID` to the real OANDA practice account ID associated with that token. Do not use the application's trading account ID.
4. After authenticated data succeeds, verify the backend candle response, frontend request, chart rendering, and quote-based position P&L end to end.
