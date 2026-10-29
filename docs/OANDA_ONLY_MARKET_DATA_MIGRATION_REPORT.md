# OANDA-only market-data migration report

## Outcome

The active API and trading-page market-data paths now use OANDA v20 only. There is no Twelve Data, Finnhub, simulated-price, or simulated-candle fallback in the active market-data path. When OANDA data is unavailable, market-dependent trading is unavailable rather than silently supplied invented prices. Simulated and paper account execution modes remain separate from the market-data source; they still require genuine OANDA quotes to price orders.

No live OANDA connection is claimed: the local API environment has no OANDA token or account ID configured. Therefore no authenticated quote, candle, account, or instrument response was obtained in this work.

## Implementation

- API market-data endpoints are authenticated and return OANDA-only status, account instruments, bid/ask quotes, and candles.
- Quote and candle requests use successful-response caching and deduplicate concurrent identical requests. Provider requests are spaced; 401/403 failures stop polling and 429 responses observe the returned retry delay.
- Candles use OANDA mid-price OHLC, discard incomplete or invalid bars, and preserve OANDA timestamps and decimal strings through the API. The browser converts timestamps to Unix seconds for the existing Lightweight Charts series.
- Supported chart intervals map to OANDA granularity: `1m` → `M1`, `5m` → `M5`, `10m` → `M10`, `15m` → `M15`, `30m` → `M30`, `1h` → `H1`, `4h` → `H4`, `1d` → `D`.
- The chart and quote list identify OANDA as the source only after successful OANDA data is displayed. A provider failure is shown separately from account ownership errors. Order submission is disabled without a quote for the selected symbol.
- The server-side trading market cache and account P&L updates now consume OANDA quotes. Existing account ownership checks, order/risk logic, and simulated execution modes were retained.

## Removed paths

- Twelve Data and Alpha Vantage provider implementations and old multi-provider/failover/caching test paths.
- Twelve Data quote hooks and API client methods, quota manager/UI, provider status panels, provider selection, and legacy Twelve Data candle endpoints.
- The simulated market engine, random/static market-price fallbacks, synthetic OHLC data, old market-price WebSocket broadcaster, and Twelve Data-oriented symbol normalization.
- Obsolete Twelve Data, Finnhub, simulated-market, and provider-selection entries from local API configuration. `.env.example` now documents only OANDA market-data configuration.

Historical reports elsewhere in the repository may mention the providers as part of past work; they are not active code or current setup instructions.

## Files changed

- API environment/configuration: `apps/api/.env.example`; obsolete provider keys were also removed from the ignored local `apps/api/.env`.
- API OANDA path: `apps/api/src/market-data/market-data.controller.ts`, `apps/api/src/market-data/market-data.module.ts`, `apps/api/src/market-data/market-data-manager.service.ts`, `apps/api/src/market-data/market-data-manager.service.spec.ts`, `apps/api/src/market-data/market-data-engine.service.ts`, `apps/api/src/market-data/market-price.service.ts`, `apps/api/src/market-data/providers/oanda/oanda.provider.ts`, `apps/api/src/market-data/providers/oanda/oanda.provider.spec.ts`.
- API integrations and surfaces: `apps/api/src/main.ts`, `apps/api/src/admin/admin.service.ts`, `apps/api/src/broker-orders/adapters/paper-order.adapter.ts`, `apps/api/src/realtime/realtime.service.ts`, `apps/api/src/websocket/dto/socket-events.dto.ts`, `apps/api/src/websocket/trading.gateway.ts`.
- API tests and obsolete market-data files: `apps/api/test/broker-orders/paper-order.spec.ts`; removed the old provider DTO/registry, simulated and unified market-data implementations, Twelve Data/Alpha Vantage implementations, Twelve Data-specific tests, and symbol normalizer.
- Web: `apps/web/app/dashboard/trading/[accountId]/page.tsx`, `apps/web/app/admin/health/page.tsx`, `apps/web/app/admin/page.tsx`, `apps/web/components/connection-status.tsx`, `apps/web/components/trading/candlestick-chart.tsx`, `apps/web/components/trading/execution-mode-indicator.tsx`, `apps/web/components/trading/market-watch.tsx`, `apps/web/components/trading/order-panel.tsx`, `apps/web/hooks/useOandaQuotes.ts`, `apps/web/lib/admin-api.ts`, `apps/web/lib/hooks/useTradingAccountSocket.ts`, `apps/web/lib/market-api.ts`, and `apps/web/lib/socket.ts`. Removed the old Twelve Data hook and quota manager.
- Documentation: `docs/OANDA_ONLY_MARKET_DATA_MIGRATION_REPORT.md`.

## Environment setup

Create a personal access token and select the account from the **same** OANDA environment:

1. Sign in to the intended OANDA fxTrade account.
2. Open **My Account → My Services → Manage API Access** (also labeled **Manage API Access** on the account profile) and generate a personal access token. OANDA treats this token like a password and does not retain it for recovery; store it securely.
3. Obtain the account ID for that account/environment.
4. Set these backend-only values in `apps/api/.env`:

   ```dotenv
   OANDA_API_TOKEN=your-personal-access-token
   OANDA_ACCOUNT_ID=your-account-id
   OANDA_ENVIRONMENT=practice
   ```

`practice` uses `https://api-fxpractice.oanda.com`. Set `OANDA_ENVIRONMENT=live` only for an account provisioned for live access; that selects `https://api-fxtrade.oanda.com`. The service never switches environments automatically. Do not place these credentials in `apps/web/.env*`, `NEXT_PUBLIC_*` variables, source code, or logs.

A UUID or other supplied value cannot be recognized as an OANDA token from its shape alone. It must be an OANDA personal access token and must be validated against the selected environment. No OANDA credential was configured here, so any previously supplied value has not been authenticated.

## Safe error behavior

The API distinguishes invalid credentials/environment mismatch, account-access denial, unsupported instrument, unsupported interval, rate limiting, empty candles, and network/provider failures. Invalid credentials and denied accounts are not retried in the polling loop. Rate limiting honors OANDA's retry delay; network failures are reported as temporarily unavailable. No error path switches environments or providers or returns generated market data.

## Verification results

| Check | Result |
|---|---|
| API build (`npm run build`, `apps/api`) | Passed |
| Web build/type check (`npm run build`, `apps/web`) | Passed |
| Focused OANDA provider, market-data manager, and paper-order tests | Passed: 20 tests; these use mocked OANDA HTTP responses |
| Practice/live base URL selection and unsupported environment | Unit-tested |
| Quote bid/ask precision, account instrument validation, and M10 candle normalization | Unit-tested with fixture responses |
| OANDA interval mappings M1/M5/M10/M15/M30/H1/H4/D | Unit-tested; no live candle responses |
| Invalid credentials, rate limiting, network failure, unsupported instrument, empty candles, no simulated fallback | Unit-tested |
| Genuine authenticated OANDA connectivity, EUR/USD quote, or M1/M10 candles | Not verified: backend token/account ID are not configured |
| Actual supported-symbol list for the configured OANDA account | Not verified: account credentials unavailable |
| Browser chart with live OANDA data | Not verified: no live OANDA candle response was available |
| Real-money execution | Not enabled by this migration |

An additional account/trading regression run executed the margin-service suite successfully, but its broader legacy suites were not clean: the risk consistency spec fails TypeScript compilation because mock objects include an unsupported `create` property, while the order and trading-engine specs fail Nest test-module setup because `AccountStateService` and `BalanceEquityService` are not registered in their test modules. These failures are outside the files changed for the market-data migration and were not altered.

Once credentials are configured, restart the API and check `/api/market/status` for successful authentication, then request `/api/market/quote/EURUSD` and `/api/market/candles?symbol=EURUSD&interval=1m` and `interval=10m` with a valid application JWT. Verify remaining intervals and account-supported instruments the same way before relying on their availability. Do not treat mocked test results as live connectivity.

## References

- [OANDA v20 Authentication](https://developer.oanda.com/rest-live-v20/authentication/)
- [OANDA v20 Pricing endpoints](https://developer.oanda.com/rest-live-v20/pricing-ep/)
- [OANDA v20 Introduction](https://developer.oanda.com/rest-live-v20/introduction/)
