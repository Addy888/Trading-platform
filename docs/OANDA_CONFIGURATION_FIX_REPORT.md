# OANDA configuration fix report

## Result

The backend loads configuration from the API project's own `apps/api/.env`, independent of the directory from which NestJS is launched. The frontend's `.env.local` is not used to configure backend OANDA credentials. Candle retrieval needs the backend `OANDA_API_TOKEN`; account-specific instrument lists and bid/ask pricing additionally need `OANDA_ACCOUNT_ID`. The configured token was tested against OANDA practice and rejected with HTTP 401 (`INVALID_CREDENTIALS`), so no genuine candles were returned.

The app does not invent credentials, infer that a UUID is a valid OANDA token, or fall back to another environment. Existing account access checks, simulated account-execution mode, risk logic, and TradingView Lightweight Charts are unchanged.

## Configuration loading and diagnostics

- `apps/api/src/main.ts` calls the backend environment loader before importing the Nest application module. It loads the path returned by `apps/api/src/config/env-loader.ts`: `apps/api/.env`.
- The file path resolves relative to the loader module, both from TypeScript source and compiled `dist`, not relative to the terminal's current working directory.
- `dotenv` preserves environment variables already supplied by the operating system; those take precedence over file values.
- Startup logs include the config file path, whether the candle token is configured, whether account-specific pricing is configured, the chosen environment, and the selected OANDA base URL. Logs do not include token or account ID values.
- `GET /api/market/status` and `GET /api/health` now report the safe OANDA configuration/readiness state, missing variable names, environment, endpoint, and categorized status. Categories distinguish `NOT_CONFIGURED`, `INVALID_CREDENTIALS`, `ACCOUNT_ACCESS`, rate limiting, and network/provider outages.
- Practice uses `https://api-fxpractice.oanda.com`; live uses `https://api-fxtrade.oanda.com`. An unrecognized `OANDA_ENVIRONMENT` fails startup rather than silently switching.

## Required backend environment

Set the following in `apps/api/.env` or in the backend process environment:

```dotenv
OANDA_API_TOKEN=<OANDA personal access token>
OANDA_ACCOUNT_ID=<optional account ID, required for quotes and account instrument listing>
OANDA_ENVIRONMENT=practice
```

Create a personal access token after signing in to the intended OANDA fxTrade environment, using **Manage API Access** in the account profile / **My Account → My Services → Manage API Access**. Use the account ID belonging to that same practice or live environment. Keep the token and account ID server-side; do not put them in `apps/web/.env*`, `NEXT_PUBLIC_*` variables, source code, or logs. Restart the API after changing file-based environment settings.

## Frontend behavior

The trading page checks backend OANDA status before requesting data. Missing token or invalid authentication stops quote polling and candle/instrument requests. If no account ID is configured, the page still requests OANDA candles for its supported watchlist, but does not call the account instrument list or pricing endpoint; it clearly notes that bid/ask quotes require the account ID. These non-retryable conditions are not retried automatically.

## Verification

| Check | Result |
|---|---|
| API build | Passed (`npm run build`, `apps/api`) |
| Web build and TypeScript check | Passed (`npm run build`, `apps/web`) |
| Targeted configuration, OANDA, and paper-order unit tests | Passed before the live verification attempt; current report is superseded by `OANDA_SETUP_AND_VERIFICATION_REPORT.md` |
| Backend env path independent of current directory | Unit-tested; resolves to `apps/api/.env` |
| Secret-safe configuration diagnostics | Unit-tested; diagnostics contain no token/account values |
| Practice/live endpoint selection | Unit-tested; no automatic environment switch |
| Missing configuration prevents OANDA provider calls | Unit-tested |
| Invalid credentials, denied/unknown account, and network/provider error classification | Unit-tested with mocked HTTP responses |
| OANDA instruments and genuine EUR/USD M1 candles | Candle request was attempted; OANDA rejected the configured token before any candle was returned. Account instrument listing was not attempted because account ID is absent |
| Actual authenticated OANDA response | Practice endpoint returned HTTP 401, categorized as `INVALID_CREDENTIALS` |
| Existing simulated execution and risk/account behavior | No related account ownership, execution, or risk code was changed |

The detailed current test and request results are recorded in `docs/OANDA_SETUP_AND_VERIFICATION_REPORT.md`. Do not treat mocked tests or a rejected live request as evidence of genuine candle delivery.
