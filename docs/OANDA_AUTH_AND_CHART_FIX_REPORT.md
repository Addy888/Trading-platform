# OANDA authentication and chart fix report

## Summary

OANDA authentication was not successful during this verification. The backend-local environment file contains a token value and selects the practice environment, but OANDA returned **HTTP 401 Unauthorized** for one EUR/USD H1 candle request. No candles were returned, so live chart rendering cannot be verified or claimed.

The chart was empty because the dashboard checks the backend OANDA status before requesting candles and stops when that status reports `INVALID_CREDENTIALS`. This is the correct no-fallback behavior: the internal trading account being `ACTIVE` does not authenticate the separate OANDA market-data connection. Bid/ask quotes are also unavailable because `OANDA_ACCOUNT_ID` is not configured; that account ID is distinct from the application's trading account ID.

## Configuration and authentication diagnosis

- Runtime backend env path: `apps/api/.env`, resolved by `apps/api/src/config/env-loader.ts`. The compiled loader was run and reported that this file exists, `OANDA_API_TOKEN` is configured, and `OANDA_ACCOUNT_ID` is not configured. No credential values were read into output.
- Environment: `practice`.
- Selected OANDA base URL: `https://api-fxpractice.oanda.com`; the backend does not switch to live automatically.
- Request auth format in `OandaProvider`: `Authorization: Bearer <token>`, as required by OANDA v20 token authentication.
- One minimal request was sent to `GET https://api-fxpractice.oanda.com/v3/instruments/EUR_USD/candles?granularity=H1&count=2&price=M`.
- Observed result: **HTTP 401**. Sanitized response body captured by the request tool: empty. No candle array was received.
- The result proves that OANDA rejected the credential as sent to the selected practice host; it does not establish whether the token is malformed/revoked or belongs to the live environment. The token must be checked in OANDA's account console and its environment confirmed.
- The request uses the account-independent instrument-candles endpoint. Account ID is not required to retrieve candles. The `/v3/accounts/{accountID}/pricing` and `/instruments` endpoints are account-specific and require a real OANDA account ID.

The API provider already classifies HTTP 401 as `INVALID_CREDENTIALS`, 403 as `ACCOUNT_ACCESS`, instrument 400/404 responses as `INSTRUMENT_UNAVAILABLE`, 429 as `RATE_LIMITED`, and network failures as `NETWORK`. The manager caches/deduplicates successful calls and stops further provider requests after authentication failure. Credentials are never included in the health response or logs.

## Changes made

- `apps/web/components/trading/candlestick-chart.tsx`
  - Replaced the generic empty-chart prompt with the actual candle error when present.
  - Added a retry action while preserving Lightweight Charts.
- `apps/web/components/trading/market-watch.tsx`
  - Added a clear quote-unavailable message.
- `apps/web/app/dashboard/trading/[accountId]/page.tsx`
  - Explains that OANDA bid/ask pricing needs an OANDA account ID and that the application's trading account ID cannot substitute.
  - Reads pricing availability from backend status even when the token is rejected, so quote limitations are not conflated with candle access.
  - Removed immediate duplicate symbol/timeframe fetches; the state-driven effect performs the request.

The existing backend endpoints, OANDA candle normalization and authorization checks were not weakened or bypassed. The API serializes candle timestamps as ISO strings and decimal OHLC values as strings; the dashboard converts those values to Unix-second chart points. The provider orders complete candles chronologically. No Twelve Data, Finnhub, or generated candle/quote fallback was added.

## Verification results

| Check | Result |
|---|---|
| Compiled backend env loader path and safe configuration diagnostic | Passed; `apps/api/.env`, token configured, account ID absent, practice host selected |
| Secret exclusion | `apps/api/.env` remains ignored by Git |
| One live OANDA EUR/USD H1 request | **HTTP 401**; sanitized response body empty |
| Genuine candles received | **No; 0** |
| Backend API returning genuine normalized candles | Not verifiable without an accepted OANDA token and authenticated application request |
| Frontend receiving genuine backend candles | Not verified; the OANDA request was rejected and no authenticated application session was available for a live browser/API test |
| TradingView Lightweight Charts rendering genuine candles | Not verified; no genuine candle data was returned |
| Bid/ask quotes | Not available; a real OANDA account ID is not configured. No internal application account ID was substituted. |
| API production build | Passed |
| Web production build and TypeScript validation | Passed |
| OANDA provider, manager, and open-position tests | Passed: 21 tests |
| `git diff --check` | Passed |

## Required next step

Create or confirm a personal access token under the intended OANDA **practice** account's API access settings, and ensure it belongs to the practice environment. Replace `OANDA_API_TOKEN` only in the ignored `apps/api/.env`, then restart the backend and retry the EUR/USD candle request. Do not put the token in frontend configuration or documentation. Configure `OANDA_ACCOUNT_ID` only if account-specific instruments and bid/ask prices are needed; it must be the actual OANDA account ID associated with the same environment.

Until OANDA accepts a credential, the chart correctly remains empty and shows the authentication error instead of fabricated market data.
