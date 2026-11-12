# Twelve Data market data and TradingView chart

The trading terminal uses the existing `lightweight-charts` 5.2.1 package and its v5 API (`addSeries(CandlestickSeries, ...)`). Twelve Data supplies historical candles and latest display prices. No broker execution or WebSocket market-data stream is enabled by this integration.

## Environment setup

Add the provider key only to `apps/api/.env`, then restart the API:

```dotenv
TWELVE_DATA_API_KEY=your_server_only_key
TWELVE_DATA_API_BASE_URL=https://api.twelvedata.com
TWELVE_DATA_TIMEOUT_MS=15000
MARKET_DATA_QUOTE_CACHE_TTL=900000
MARKET_DATA_CANDLE_CACHE_TTL=300000
MARKET_DATA_POLLING_INTERVAL=900000
MARKET_DATA_STALE_THRESHOLD_MS=1200000
```

The API reads the key through its existing server-side environment loader. Never put it in `apps/web/.env*`, a `NEXT_PUBLIC_*` variable, frontend code, logs, or a response. The status endpoint reports only whether the key is configured; it never returns the value. At API startup a real one-candle validation request checks the credentials and provider access. A configured key is not proof of an active plan or of every symbol's entitlement.

## Authenticated market-data endpoints

All routes below are protected by the existing JWT guard and use the `/api` global prefix:

- `GET /api/market/status`
- `GET /api/market/instruments`
- `GET /api/market/exchanges?query=&type=ALL&page=1&limit=20`
- `GET /api/market/instruments/search?query=EUR/USD&type=ALL&page=1&limit=20&exchange=`
- `GET /api/market/instruments/details?symbol=EUR/USD&exchange=`
- `GET /api/market/exchanges/:exchange/status`
- `GET /api/market/exchanges/:exchange/schedule`
- `GET /api/market/quote/:symbol`
- `GET /api/market/candles?symbol=EURUSD&interval=1h&outputsize=100&exchange=`

All routes remain protected by the existing JWT guard. The candle route validates `symbol` and a positive integer `outputsize` (capped at 5,000). The provider adapter maps terminal symbols and intervals, requests UTC time series, validates finite positive OHLC values, checks candle high/low relationships, sorts by timestamp, and rejects duplicate timestamps. The API serializes normalized timestamps as ISO UTC strings. Optional exchange identifiers are included in quote/candle requests and cache keys, so similarly named listings are not served from another exchange's cache.

## Exchange directory and Market Watch

The authenticated `/dashboard/markets` page uses the same server-side Twelve Data provider. It includes a searchable/paginated exchange directory, instrument search with asset-category and exchange filters, sorting, and links to the existing terminal. Search results are provider metadata, not price data. The provider search cap is 30 rows per query; use a narrower search to discover additional instruments. No full-market download is attempted.

The user watchlist is stored in browser local storage and populated only from returned provider instrument metadata. It is limited to three symbols and polls the authenticated backend no faster than every 30 minutes (or the longer configured API interval). It displays provider-supplied change/percentage change only when present, the provider timestamp separately from server fetch time, and the configured timestamp-staleness assessment without equating a recent timestamp with a contractual real-time entitlement. These are display-only last prices, not bid/ask execution quotes; missing change fields remain unavailable rather than being calculated from other values. This caps the directory watchlist to at most 144 quote requests/day in a continuously open browser; it is not a guarantee of total application usage or API credits, since endpoint weights and other clients share the provider key.

The exchange-list endpoint returned 97 stock-exchange records in a genuine Twelve Data response during verification. The provider's `cryptocurrency_exchanges` response contained exchange names but omitted country, exchange code, and timezone; those fields remain unknown in the UI. `/symbol_search` returned metadata for tested FX, digital-currency, precious-metal, and stock queries. This is query-based discovery, not evidence that every instrument is available to this subscription.

`/market_state?exchange=NASDAQ` returned provider market-state rows and can report open/closed state; an empty or failed response remains unavailable. `/exchange_schedule?exchange=NASDAQ` returned HTTP 403 with the provider message that the endpoint is available exclusively with Ultra or Enterprise plans. The frontend shows the returned error and does not invent hours or infer that the instrument itself is unavailable. Neither the exchange list nor symbol search reported user-specific real-time/delayed entitlements; the UI labels that information as not reported.

### Directory endpoint verification recorded 2026-10-29

Using `apps/api/.env` without printing the key, direct provider requests returned: `/exchanges` HTTP 200 (97 rows), `/cryptocurrency_exchanges` HTTP 200 (201 rows), `/symbol_search?symbol=EUR/USD` HTTP 200 (2 rows requested), `/time_series?symbol=EUR/USD&interval=1h&outputsize=1&timezone=UTC` HTTP 200 (latest candle `2026-10-29 15:00:00` UTC), `/quote?symbol=EUR/USD` HTTP 200 (`last_quote_at=2026-10-29T15:54:00Z`, server check time `2026-10-29T15:54:20Z`; about 21 seconds apart), and `/market_state?exchange=NASDAQ` HTTP 200 (4 market-state rows, including `is_market_open=true`). The quote's separate provider `timestamp` was `2026-10-28T20:00:00Z`; the adapter uses the newer `last_quote_at` as the provider quote time. `/exchange_schedule?exchange=NASDAQ` returned HTTP 403 with the provider's Ultra/Enterprise restriction message. A recent quote timestamp and open-market flag do not establish a real-time entitlement; the configured subscription tier was not identified.

A separate direct provider quote check on `2026-10-29` returned HTTP 200 for `EUR/USD`, price `1.11648`, and `last_quote_at=2026-10-29T16:22:00Z`. The server received the response at `2026-10-29T16:22:52Z`, approximately 53 seconds after the provider timestamp. A same-session `1h` time-series request returned HTTP 200 with 10 valid candles, latest candle `2026-10-29 16:00:00` UTC. These are point-in-time results; no provider entitlement or guaranteed real-time service level was returned.

### Adapter-supported symbols and intervals

The adapter currently maps `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD`, `BTCUSD`, `ETHUSD`, `XAUUSD`, and `XAGUSD` to Twelve Data symbols. Supported intervals are `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, and `1d`. The terminal currently offers the first five FX pairs and the listed intervals. These are adapter capabilities, not a guarantee of subscription entitlement or historical availability. The successful live check below verified only `EURUSD` at `1h`.

## Polling and plan limitations

The terminal polls the authenticated backend for the five watchlist display prices every 15 minutes by default. The API enforces a 15-minute minimum, shares a quote cache at least as long as that interval, deduplicates concurrent provider requests, and uses bounded retries/backoff. Historical candles are cached for five minutes, loaded on initial/symbol/timeframe changes, and polled on the same 15-minute interval. Initial history uses `series.setData()`; later provider OHLC candles update the active chart bar with `series.update()` without reloading the full series. A quote-only last price is displayed separately and is never used to construct or alter candle OHLC values.

Polling is not WebSocket streaming. The currently inspected [Twelve Data pricing page](https://twelvedata.com/pricing) lists Basic at 8 API credits/minute and 800/day, with 8 trial WebSocket credits; it lists real-time Forex market data, but the per-minute and daily quotas are shared by all requests. At 15-minute polling, five quote calls plus one selected-symbol candle call produce up to 576 endpoint requests/day before startup validation, retries, or user-initiated symbol/timeframe changes on one API instance. This is a request-count estimate, not a credit estimate: Twelve Data applies endpoint-specific weights, other apps/instances may use the same key, and the account plan was not identified. The API usage check returned HTTP 200 and `daily_usage=10`, but did not identify the account plan or its limits. The provider also controls symbol coverage, delayed/realtime entitlements, history, and licensing. Confirm the account's plan, endpoint weights, and rights before wider use; provider responses and timestamps are not grounds for claiming real-time data. The UI shows the last provider timestamp and marks old quotes as delayed.

Twelve Data's quote endpoint supplies a latest/display price, not an executable bid/ask. The watchlist and chart label it as a last/display-only price. It must not be used to calculate fills, spread, margin, equity, P&L, or wallet/account balances. The existing execution and risk surfaces remain separate and continue to require executable bid/ask data.

The UI reports **Stale quote** when the provider's quote timestamp is older than the configured freshness threshold. This means the returned quote timestamp is old; it does not establish that the account's feed is contractually delayed. The UI shows the provider timestamp separately from when the quote response was received by the web app. Twelve Data's tested response did not establish the subscription's real-time/delayed entitlement.

## Chart, attribution, and testing

Sign in to an existing trading account, open its terminal, choose a supported symbol and interval, and check the visible provider status and quote timestamp. The chart provides loading, no-data, stale-quote, disconnected, request-error, and chart-library-error states. Quote-only display prices do not alter candlestick OHLC. Symbol/timeframe requests are guarded against stale responses, quote polling uses one recursive timeout, and chart/observer resources are removed when the component unmounts. No static prices or sample candles are used.

The active terminal component imports the installed `lightweight-charts` package, pinned by the lockfile to 5.2.1, and uses the v5 `chart.addSeries(CandlestickSeries, ...)` API. The installed package declares the Apache-2.0 license. The separate cloned source repository/NOTICE file was not present in the inspected project checkout; the chart enables the v5 `layout.attributionLogo` link to keep TradingView attribution visible.

### Verification recorded 2026-10-29

- The API key was present in `apps/api/.env`; its value was not displayed or logged.
- Follow-up investigation of the “No quote” state found a frontend contract edge case: `useMarketQuotes` treated the server-fetch timestamp as mandatory and discarded otherwise-valid provider quotes if `quote.fetchedAt` was omitted, even though the quote endpoint also has a top-level server response timestamp. The client now accepts that server timestamp as fetch-time metadata when present; provider timestamp and positive finite price remain mandatory. If no server fetch time is supplied, it displays as unavailable rather than replacing it with a fabricated value.
- A fresh genuine call through the compiled provider succeeded for EUR/USD: `/quote` HTTP `200`, price `1.11709`, provider quote time `2026-10-29T15:26:00.000Z`, server fetch time `2026-10-29T15:26:32.264Z`. `/time_series` HTTP `200`, EUR/USD / `1h`, latest candle `2026-10-29T15:00:00.000Z`, close `1.11709`. The API key was not printed.
- The running API health endpoint returned HTTP `200`, with Twelve Data configured and quote status `AVAILABLE`; quote last-success was `2026-10-29T15:23:09.610Z`, and the configured polling interval was 900,000 ms. This status is service-level and does not prove a specific authenticated frontend quote request succeeded.
- The original timestamp bug was in quote-field precedence: Twelve Data returned `timestamp=1793217600` (`2026-10-28T20:00:00.000Z`) alongside `last_quote_at=1793286780` (`2026-10-29T15:13:00.000Z`). The adapter selected `timestamp` first, making a current quote appear about 19 hours stale. It now prefers `last_quote_at`; it does not weaken the stale threshold.
- A fresh real `/quote` request for provider symbol `EUR/USD` succeeded with HTTP `200` at `2026-10-29T15:13:07.903Z`. Twelve Data returned price `1.11673`, `is_market_open=true`, and `last_quote_at=2026-10-29T15:13:00.000Z` (about 8 seconds old at response time). Its separate `timestamp` still referred to the prior session. The response did not contain bid/ask fields.
- A fresh real `/time_series` request succeeded with HTTP `200` for provider symbol `EUR/USD` / `1h`, requesting 1 candle. Its latest candle was `2026-10-29T15:00:00.000Z` with close `1.11673` (about 13 minutes old at the quote check). Earlier five-candle validation also passed finite OHLC, high/low, ordering, and duplicate-time checks.
- After rebuilding the adapter with the corrected timestamp precedence, a real call through the compiled provider succeeded: price `1.11722`, provider quote time `2026-10-29T15:17:00.000Z`, and server fetch time `2026-10-29T15:17:40.522Z` (40 seconds apart). A matching real `1h` candle request returned latest candle time `2026-10-29T15:00:00.000Z` and close `1.11722`. The direct provider requests returned HTTP `200`; response status and timestamps were recorded without printing the key.
- Quote objects now carry the provider market timestamp and the server request completion time separately. The client also retains its own app-receipt time; the UI labels all three rather than treating a recent fetch as proof of a fresh provider timestamp.
- The configured poll interval remains 15 minutes. Plan-specific quota permission was not independently confirmed; check the Twelve Data account dashboard before changing the interval or scaling the number of symbols.
- This verifies provider connectivity and the provider adapter response, not an authenticated HTTP request to the application's `/api/market/candles` route. That route requires a valid user JWT; no auth bypass or account credential was used for this check.
- Provider invalid/missing-key handling is covered by API unit tests, which use a mocked 401 response for the invalid-key case; no invalid key was sent to Twelve Data.
- `apps/api`: `npm run build` passed. `apps/web`: `npm run build` passed. Relevant API market-data tests passed (3 suites, 13 tests).
- The user's subscription tier and contractual delayed/realtime entitlement were not verified; `is_market_open=true` and a fresh `last_quote_at` are provider response facts, not entitlement proof.
- The local API's authenticated market routes correctly require a valid user JWT. Browser verification redirected to `/login` without a signed-in session. Therefore the exact authenticated request that produced “No quote” in the user's terminal could not be inspected, and the frontend contract edge case is a verified failure mode rather than a proven cause of that specific user's current response.
- Socket configuration was consistent locally: the frontend defaults to `http://localhost:3001/trading`, the API listens on port 3001, and API CORS allows `http://localhost:3000`. The client sends its JWT through Socket.IO `auth.token`, and the gateway verifies the JWT and active user before sending `connection:ready`. Authentication was not bypassed. The client also now clears its auth-failure latch when the access token changes, allowing a refreshed token to establish a new socket.
- A local Socket.IO connection with no token reached the gateway and was rejected with `system:error` code `AUTH_FAILED`, as intended. A no-token quote request returned HTTP `401`. An authenticated socket/account-room subscription could not be verified without a user session.
- UI status now distinguishes market quote state/error, historical candle availability/time, and the account-update WebSocket. A successful account socket is not presented as provider connectivity. Last-known quotes are retained when a poll fails and remain subject to provider-timestamp staleness checks.
- The browser session redirected to `/login` and had no signed-in token, so authenticated terminal quote rendering, live chart updates, network traffic, and browser console behavior could not be verified. Source inspection confirms the active `/dashboard/trading/[accountId]` page renders `CandlestickChart`, which imports the installed v5.2.1 package and uses `setData()` for history and `update()` for subsequent candles.
- The frontend and backend builds passed after the chart/status changes. The focused Twelve Data backend tests passed (3 suites, 13 tests). The terminal browser chart could not be tested without an authenticated session.

## Known limitations and next steps

- Confirm the key's account plan, symbol access, history, and redistribution/display terms in Twelve Data before production or broader user access.
- Use a valid signed-in terminal session to verify the authenticated `/api/market/candles` response through the running application.
- WebSocket streaming has not been implemented or verified. The UI and API report polling only.
- An executable bid/ask source is still needed before order execution, margin, and P&L can use live market values.
