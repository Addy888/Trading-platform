# OANDA setup and verification report

## Result

The backend reads the OANDA token from the ignored `apps/api/.env` file and selects the configured practice endpoint. A genuine request to OANDA's account-independent EUR/USD M1 candles endpoint was made using the backend provider. OANDA returned **HTTP 401**, classified as `INVALID_CREDENTIALS`; no candles were returned. The token has therefore not been verified as a valid OANDA personal access token, and the dashboard cannot display genuine OANDA data yet.

No credential value is included in this report, command output, application log, frontend bundle, or API response. `apps/api/.env` is ignored by Git. The account ID field is blank; it was not invented.

## Backend configuration and request path

- Backend environment file: `apps/api/.env`, loaded by `apps/api/src/config/env-loader.ts` before Nest modules initialize. Loading is independent of the process working directory.
- Environment: `practice`.
- Base URL: `https://api-fxpractice.oanda.com`.
- Candle API: `GET /v3/instruments/EUR_USD/candles?granularity=M1&count=...&price=M`.
- A personal access token is sufficient for candles. Account ID is not required for the instrument-candle endpoint.
- OANDA's account-specific `/v3/accounts/{accountID}/instruments` and `/pricing` endpoints still require a real account ID. The implementation reports `ACCOUNT_ID_REQUIRED` and does not substitute candle closes for bid/ask data.
- API response candles retain timestamp and decimal OHLC values as strings; the trading page converts timestamps to Unix seconds and OHLC strings to numeric series points for the existing Lightweight Charts component.
- The authenticated market-data controller remains behind `JwtAuthGuard`; account endpoints and ownership checks were not weakened.

## Actual provider verification

| Check | Result |
|---|---|
| Backend env loader resolves `apps/api/.env` from outside the project working directory | Passed |
| OANDA practice candle HTTP request | Attempted against `api-fxpractice.oanda.com` |
| HTTP status | **401 Unauthorized** |
| Safe category | `INVALID_CREDENTIALS` |
| EUR/USD candle count received | **0**; request rejected before candle data |
| OANDA account instrument-list endpoint | Not attempted because no account ID was supplied |
| OANDA bid/ask endpoint | Not attempted; account-specific pricing requires an account ID |
| Frontend authenticated request through the backend and live chart rendering | Not verified: OANDA rejected the credential, and no application JWT was provided to the verification process |
| Unauthenticated backend market endpoint | Not exercised separately; `/api/market/*` remains JWT-protected and no application JWT was supplied for verification |

To unblock: sign in to the intended OANDA fxTrade **practice** account, create a personal access token under **Manage API Access**, update `OANDA_API_TOKEN` in `apps/api/.env`, and restart NestJS. Do not use an account ID placeholder. Add the actual same-environment account ID only if account instrument lists or bid/ask quotes are required. Re-run `npm run test:oanda:live` from `apps/api`; success requires actual authenticated EUR/USD candles.

## Application behavior

- Market data is OANDA-only; no Twelve Data, Finnhub, generated candles, or simulated quote fallback was introduced.
- With token but no account ID, the dashboard can request candles for its configured watchlist. It does not request account-specific instruments or quote polling. It tells the user that bid/ask pricing needs `OANDA_ACCOUNT_ID` and disables order entry until a genuine quote exists.
- Invalid credentials stop frontend polling. Network/provider errors remain categorized and retryable; 401/403 and missing-configuration failures are not automatically retried.
- When an OANDA quote is unavailable, owned open positions still load with `currentPrice`, `unrealizedPnl`, and `priceSource` set to `null`; the UI shows these as unavailable rather than inventing prices. The dashboard logs unrelated trading-data failures separately from market-data errors.
- Lightweight Charts, account ownership authorization, simulated execution mode, orders, and risk logic remain in place.

## WebSocket diagnosis

The trading page previously subscribed as soon as the Socket.IO transport connected, which can precede the server's asynchronous JWT/database authentication completion. The dashboard now waits for the server's `connection:ready` event before subscribing. Socket clients use the documented `NEXT_PUBLIC_SOCKET_URL`; the context previously read a different variable. Gateway CORS now follows backend `CORS_ORIGINS`, malformed subscription payloads receive a specific error, and room joins are awaited.

JWT validation and non-admin account ownership checks remain mandatory. The WebSocket path was not live-tested in this run: no authenticated application session was available. An `AUTH_FAILED` can still correctly occur for expired/invalid JWTs, a JWT-secret mismatch between issuer and API, or an inactive/missing user. A legitimate ownership failure remains `FORBIDDEN`, not a successful subscription.

## Builds and tests

| Check | Result |
|---|---|
| API production build | Passed |
| Web production build and TypeScript validation | Passed |
| Focused OANDA provider and manager tests | Passed |
| Backend env path/configuration tests | Passed |
| Account-independent candle behavior and no synthetic quote behavior | Unit-tested |
| Practice/live host selection, supported interval mappings, and safe error categories | Unit-tested |
| Paper-order integration regression tests | Passed in the latest isolated unit run |
| Open-position outage and account-ownership regression tests | Passed (2 focused tests) |
| API and web builds after the open-position outage fix | Passed |
| Live OANDA integration check | Failed as expected for the configured value: HTTP 401 `INVALID_CREDENTIALS` |
| Git ignore check for `apps/api/.env` | Passed |
| Browser rendering against genuine candles | Not tested because OANDA returned no candles |

## Files changed for this integration

- `apps/api/.env` (ignored local configuration; token kept private, account ID blank)
- `apps/api/.env.example`
- `apps/api/package.json` (live OANDA integration test command)
- `apps/api/src/config/env-loader.ts` and `apps/api/src/config/env-loader.spec.ts`
- `apps/api/src/main.ts` (loads backend env before Nest initialization and logs safe configuration state)
- `apps/api/src/health/health.module.ts` and `apps/api/src/health/health.service.ts`
- `apps/api/src/market-data/providers/oanda/oanda.provider.ts`
- `apps/api/src/market-data/providers/oanda/oanda.provider.spec.ts`
- `apps/api/src/market-data/providers/oanda/oanda.live.spec.ts`
- `apps/api/src/market-data/market-data-manager.service.ts`
- `apps/api/src/market-data/market-data-manager.service.spec.ts`
- `apps/api/src/market-data/market-price.service.ts`
- `apps/api/src/trading-engine/trading-engine.service.ts`
- `apps/api/src/trading-engine/trading-engine.service.spec.ts`
- `apps/api/src/websocket/trading.gateway.ts`
- `apps/api/src/websocket/trading.gateway.ts`
- `apps/web/app/dashboard/trading/[accountId]/page.tsx`
- `apps/web/app/dashboard/accounts/[id]/page-analytics.tsx`
- `apps/web/components/trading/positions-table.tsx`
- `apps/web/lib/trading-api.ts`
- `apps/web/hooks/useOandaQuotes.ts`
- `apps/web/lib/market-api.ts`
- `apps/web/lib/socket-context.tsx`
- `apps/web/lib/socket.ts`
- `apps/web/lib/hooks/useSocket.ts`
- `apps/web/lib/hooks/useTradingAccountSocket.ts`
- `docs/OANDA_CONFIGURATION_FIX_REPORT.md`
- `docs/OANDA_SETUP_AND_VERIFICATION_REPORT.md`

The existing API-local env loader, startup diagnostic, and health integration are also used by this configuration; they were added in the preceding configuration fix. No deployment, GitHub push, or real-money order was performed.
