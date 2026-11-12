'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownUp, Clock3, Globe2, Search } from 'lucide-react';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { useAuth } from '@/lib/auth-context';
import { MarketAssetType, MarketExchange, MarketInstrument, marketApi } from '@/lib/market-api';
import { tradingApi, TradingAccount } from '@/lib/trading-api';
import { useMarketQuotes } from '@/hooks/useMarketQuotes';

type ExchangeStatus = {
  isOpen: boolean;
  timeToOpen: string | null;
  timeToClose: string | null;
};

const ASSET_TYPES: Array<{ value: MarketAssetType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All assets' },
  { value: 'FOREX', label: 'Forex' },
  { value: 'CRYPTO', label: 'Crypto' },
  { value: 'COMMODITY', label: 'Commodities' },
  { value: 'STOCK', label: 'Stocks' },
  { value: 'OTHER', label: 'Other' },
];

const COUNTRY_CODES: Record<string, string> = {
  Argentina: 'AR',
  Australia: 'AU',
  Austria: 'AT',
  Belgium: 'BE',
  Brazil: 'BR',
  Bahrain: 'BH',
  Botswana: 'BW',
  Bulgaria: 'BG',
  Canada: 'CA',
  China: 'CN',
  Chile: 'CL',
  Colombia: 'CO',
  'Czech Republic': 'CZ',
  Croatia: 'HR',
  Cyprus: 'CY',
  Denmark: 'DK',
  Egypt: 'EG',
  Estonia: 'EE',
  Finland: 'FI',
  France: 'FR',
  Germany: 'DE',
  Greece: 'GR',
  'Hong Kong': 'HK',
  Hungary: 'HU',
  Iceland: 'IS',
  India: 'IN',
  Indonesia: 'ID',
  Ireland: 'IE',
  Israel: 'IL',
  Italy: 'IT',
  Japan: 'JP',
  Jordan: 'JO',
  Kenya: 'KE',
  Kuwait: 'KW',
  Latvia: 'LV',
  Lebanon: 'LB',
  Lithuania: 'LT',
  Luxembourg: 'LU',
  Malaysia: 'MY',
  Mexico: 'MX',
  Morocco: 'MA',
  'New Zealand': 'NZ',
  Netherlands: 'NL',
  Norway: 'NO',
  Nigeria: 'NG',
  Pakistan: 'PK',
  Peru: 'PE',
  Philippines: 'PH',
  Poland: 'PL',
  Portugal: 'PT',
  Qatar: 'QA',
  Romania: 'RO',
  Russia: 'RU',
  'Saudi Arabia': 'SA',
  Serbia: 'RS',
  Singapore: 'SG',
  Slovakia: 'SK',
  Slovenia: 'SI',
  'South Korea': 'KR',
  'South Africa': 'ZA',
  Spain: 'ES',
  'Sri Lanka': 'LK',
  Sweden: 'SE',
  Switzerland: 'CH',
  Taiwan: 'TW',
  Thailand: 'TH',
  Turkey: 'TR',
  'United Arab Emirates': 'AE',
  'United Kingdom': 'GB',
  'United States': 'US',
  Vietnam: 'VN',
  USA: 'US',
  UK: 'GB',
};

const WATCHLIST_KEY = 'tradeing.market.watchlist';
const WATCHLIST_LIMIT = 3;
const MARKET_WATCH_MIN_POLL_MS = 30 * 60_000;

function isMarketInstrument(value: unknown): value is MarketInstrument {
  if (typeof value !== 'object' || value === null) return false;
  const instrument = value as Partial<MarketInstrument>;
  return typeof instrument.symbol === 'string' &&
    typeof instrument.name === 'string' &&
    typeof instrument.assetType === 'string' &&
    instrument.source === 'TWELVE_DATA';
}

function countryFlag(country: string | null): string {
  const code = country ? COUNTRY_CODES[country] || (/^[A-Z]{2}$/.test(country) ? country : null) : null;
  if (!code) return '';
  return String.fromCodePoint(...[...code].map((letter) => letter.charCodeAt(0) + 127397));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Market directory request failed.';
}

export default function MarketsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [exchanges, setExchanges] = useState<MarketExchange[]>([]);
  const [exchangeOptions, setExchangeOptions] = useState<MarketExchange[]>([]);
  const [exchangeQuery, setExchangeQuery] = useState('');
  const [exchangeType, setExchangeType] = useState<'ALL' | 'STOCK' | 'CRYPTO'>('ALL');
  const [exchangePage, setExchangePage] = useState(1);
  const [exchangeTotalPages, setExchangeTotalPages] = useState(1);
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [assetType, setAssetType] = useState<MarketAssetType | 'ALL'>('ALL');
  const [selectedExchange, setSelectedExchange] = useState('');
  const [instruments, setInstruments] = useState<MarketInstrument[]>([]);
  const [instrumentPage, setInstrumentPage] = useState(1);
  const [instrumentHasMore, setInstrumentHasMore] = useState(false);
  const [instrumentLoading, setInstrumentLoading] = useState(false);
  const [instrumentError, setInstrumentError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<MarketInstrument[]>([]);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [marketDataEnabled, setMarketDataEnabled] = useState(false);
  const [marketPollingInterval, setMarketPollingInterval] = useState(MARKET_WATCH_MIN_POLL_MS);
  const [staleThresholdMs, setStaleThresholdMs] = useState(1_200_000);
  const [marketStatusError, setMarketStatusError] = useState<string | null>(null);
  const [exchangeStatuses, setExchangeStatuses] = useState<Record<string, ExchangeStatus | null>>({});
  const [statusMessages, setStatusMessages] = useState<Record<string, string>>({});
  const [scheduleMessages, setScheduleMessages] = useState<Record<string, string>>({});
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'symbol' | 'name' | 'exchange'>('symbol');
  const [sortAscending, setSortAscending] = useState(true);
  const watchlistExchanges = useMemo(() => {
    const result: Record<string, string> = {};
    for (const instrument of watchlist) {
      if (instrument.exchange && ['STOCK', 'CRYPTO'].includes(instrument.assetType)) {
        result[instrument.symbol] = instrument.exchange;
      }
    }
    return result;
  }, [watchlist]);
  const marketQuotes = useMarketQuotes(
    watchlist.map((instrument) => instrument.symbol),
    marketPollingInterval,
    accessToken || undefined,
    marketDataEnabled && watchlist.length > 0,
    undefined,
    undefined,
    watchlistExchanges,
  );

  const loadExchanges = useCallback(async () => {
    if (!accessToken) return;
    setExchangeLoading(true);
    setExchangeError(null);
    try {
      const result = await marketApi.getExchanges(accessToken, {
        query: exchangeQuery,
        type: exchangeType,
        page: exchangePage,
        limit: 20,
      });
      setExchanges(result.exchanges);
      setExchangeTotalPages(Math.max(result.pagination.totalPages, 1));
    } catch (error) {
      setExchangeError(errorText(error));
      setExchanges([]);
    } finally {
      setExchangeLoading(false);
    }
  }, [accessToken, exchangePage, exchangeQuery, exchangeType]);

  useEffect(() => {
    void loadExchanges();
  }, [loadExchanges]);

  useEffect(() => {
    if (!accessToken) return;
    void (async () => {
      try {
        const firstPage = await marketApi.getExchanges(accessToken, { type: 'ALL', page: 1, limit: 100 });
        const remainingPages = await Promise.all(
          Array.from({ length: Math.max(0, firstPage.pagination.totalPages - 1) }, (_, index) =>
            marketApi.getExchanges(accessToken, { type: 'ALL', page: index + 2, limit: 100 }),
          ),
        );
        setExchangeOptions([
          ...firstPage.exchanges,
          ...remainingPages.flatMap((page) => page.exchanges),
        ]);
      } catch (error) {
        setExchangeError(errorText(error));
      }
    })();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    tradingApi.getTradingAccounts(accessToken)
      .then(setAccounts)
      .catch((error: unknown) => setAccountError(errorText(error)));
    marketApi.getStatus(accessToken)
      .then((status) => {
        setMarketPollingInterval(Math.max(status.configuration.pollingIntervalMs, MARKET_WATCH_MIN_POLL_MS));
        setStaleThresholdMs(status.configuration.staleThresholdMs);
        const providerUnavailable = !status.configuration.configured ||
          ['DISABLED', 'INVALID_CREDENTIALS'].includes(status.providers.TWELVE_DATA.status);
        setMarketDataEnabled(!providerUnavailable);
        if (providerUnavailable) {
          setMarketStatusError(status.providers.TWELVE_DATA.quoteLastError || status.providers.TWELVE_DATA.lastError);
        } else {
          setMarketStatusError(null);
        }
      })
      .catch((error: unknown) => setMarketStatusError(errorText(error)));
  }, [accessToken]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(WATCHLIST_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) setWatchlist(parsed.filter(isMarketInstrument).slice(0, WATCHLIST_LIMIT));
      }
    } catch (error) {
      setWatchlistError(`Could not load the saved watchlist: ${errorText(error)}`);
    } finally {
      setWatchlistLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!watchlistLoaded) return;
    try {
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch (error) {
      setWatchlistError(`Could not save the watchlist: ${errorText(error)}`);
    }
  }, [watchlist, watchlistLoaded]);

  const search = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!accessToken || searchText.trim().length < 2) {
      setInstrumentError('Enter at least two characters to search Twelve Data instruments.');
      setInstruments([]);
      return;
    }
    setInstrumentLoading(true);
    setInstrumentError(null);
    setInstrumentPage(1);
    try {
      const result = await marketApi.searchInstruments(accessToken, {
        query: searchText.trim(),
        type: assetType,
        exchange: selectedExchange || undefined,
        page: 1,
        limit: 10,
      });
      setInstruments(result.instruments);
      setInstrumentHasMore(result.pagination.hasMore || result.pagination.refineQueryWhenExhausted);
      if (!result.instruments.length) setInstrumentError('No matching instruments were returned for this search and filter.');
    } catch (error) {
      setInstrumentError(errorText(error));
      setInstruments([]);
    } finally {
      setInstrumentLoading(false);
    }
  };

  const changeInstrumentPage = async (page: number) => {
    if (!accessToken || page < 1 || page > 3 || searchText.trim().length < 2) return;
    setInstrumentLoading(true);
    setInstrumentError(null);
    try {
      const result = await marketApi.searchInstruments(accessToken, {
        query: searchText.trim(),
        type: assetType,
        exchange: selectedExchange || undefined,
        page,
        limit: 10,
      });
      setInstruments(result.instruments);
      setInstrumentPage(page);
      setInstrumentHasMore((result.pagination.hasMore || result.pagination.refineQueryWhenExhausted) && page < 3);
    } catch (error) {
      setInstrumentError(errorText(error));
    } finally {
      setInstrumentLoading(false);
    }
  };

  const loadMarketStatus = async (exchange: MarketExchange) => {
    if (!accessToken) return;
    setStatusLoading(exchange.code || exchange.name);
    try {
      const result = await marketApi.getExchangeMarketState(accessToken, exchange.name);
      const matching = result.markets.find((market) =>
        !exchange.code || market.code === exchange.code,
      ) ?? result.markets[0];
      setExchangeStatuses((current) => ({ ...current, [exchange.code || exchange.name]: matching ?? null }));
      setStatusMessages((current) => ({
        ...current,
        [exchange.code || exchange.name]: matching ? '' : 'Provider returned no market-state row for this exchange.',
      }));
    } catch (error) {
      setExchangeStatuses((current) => ({ ...current, [exchange.code || exchange.name]: null }));
      setStatusMessages((current) => ({ ...current, [exchange.code || exchange.name]: errorText(error) }));
    } finally {
      setStatusLoading(null);
    }
  };

  const loadSchedule = async (exchange: MarketExchange) => {
    if (!accessToken) return;
    const key = exchange.code || exchange.name;
    setScheduleLoading(key);
    setScheduleMessages((current) => ({ ...current, [key]: '' }));
    try {
      const result = await marketApi.getExchangeSchedule(accessToken, exchange.name);
      setScheduleMessages((current) => ({ ...current, [key]: JSON.stringify(result.schedule) }));
    } catch (error) {
      setScheduleMessages((current) => ({ ...current, [key]: errorText(error) }));
    } finally {
      setScheduleLoading(null);
    }
  };

  const openInstrument = (instrument: MarketInstrument) => {
    const account = accounts.find((item) => item.status === 'ACTIVE') || accounts[0];
    if (!account) {
      setAccountError('Create or select a trading account before opening instruments in the terminal.');
      return;
    }
    const params = new URLSearchParams({ symbol: instrument.symbol });
    if (instrument.exchange && ['STOCK', 'CRYPTO'].includes(instrument.assetType)) {
      params.set('exchange', instrument.exchange);
    }
    router.push(`/dashboard/trading/${account.id}?${params.toString()}`);
  };

  const addToWatchlist = (instrument: MarketInstrument) => {
    if (watchlist.some((item) => item.symbol === instrument.symbol)) return;
    if (watchlist.length >= WATCHLIST_LIMIT) {
      setWatchlistError(`The display watchlist is limited to ${WATCHLIST_LIMIT} instruments to control provider requests.`);
      return;
    }
    setWatchlistError(null);
    setWatchlist((current) => [...current, instrument]);
  };

  const removeFromWatchlist = (instrument: MarketInstrument) => {
    setWatchlist((current) => current.filter((item) => item.symbol !== instrument.symbol));
  };

  const quoteTimestampState = (timestamp: string) => {
    const age = Date.now() - Date.parse(timestamp);
    if (!Number.isFinite(age)) return 'Provider time unavailable';
    return age > staleThresholdMs ? 'Provider timestamp is old' : 'Provider timestamp within threshold';
  };

  const sortedInstruments = useMemo(() => [...instruments].sort((a, b) => {
    const left = (sortKey === 'symbol' ? a.symbol : sortKey === 'name' ? a.name : a.exchange || '').toLowerCase();
    const right = (sortKey === 'symbol' ? b.symbol : sortKey === 'name' ? b.name : b.exchange || '').toLowerCase();
    return left.localeCompare(right) * (sortAscending ? 1 : -1);
  }), [instruments, sortAscending, sortKey]);

  const toggleSort = (key: 'symbol' | 'name' | 'exchange') => {
    if (sortKey === key) setSortAscending((current) => !current);
    else {
      setSortKey(key);
      setSortAscending(true);
    }
  };

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm text-cyan-300"><Globe2 className="h-4 w-4" /> TWELVE DATA · VERIFIED DIRECTORY</p>
                <h1 className="text-3xl font-semibold">Exchanges &amp; Markets</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Exchange and instrument metadata is sourced from Twelve Data. Data entitlements and real-time access vary by account and are not inferred from directory listings.
                </p>
              </div>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">Market data · polling · display-only</span>
            </header>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div id="instrument-search" className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Discover instruments</h2>
                  <p className="mt-1 text-xs text-slate-400">Twelve Data symbol search returns a bounded result set. Refine the query to explore more listings.</p>
                </div>
              </div>
              <form onSubmit={search} className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_12rem_14rem_auto]">
                <label className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input value={searchText} onChange={(event) => setSearchText(event.target.value)} minLength={2} maxLength={80} placeholder="Symbol or instrument name" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-cyan-400" />
                </label>
                <select value={assetType} onChange={(event) => setAssetType(event.target.value as MarketAssetType | 'ALL')} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm">
                  {ASSET_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <select value={selectedExchange} onChange={(event) => setSelectedExchange(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm">
                  <option value="">All exchanges</option>
                  {exchangeOptions.filter((exchange) => exchange.marketType === 'STOCK').map((exchange) => <option key={exchange.code} value={exchange.name}>{exchange.displayName} · {exchange.code}</option>)}
                </select>
                <button disabled={instrumentLoading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
                  <Search className="h-4 w-4" /> {instrumentLoading ? 'Searching…' : 'Search'}
                </button>
              </form>
              {instrumentError && <p role="status" className="mt-3 rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-200">{instrumentError}</p>}

              {sortedInstruments.length > 0 && (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-3"><button onClick={() => toggleSort('symbol')} className="inline-flex items-center gap-1">Symbol <ArrowDownUp className="h-3 w-3" /></button></th>
                        <th className="py-3"><button onClick={() => toggleSort('name')} className="inline-flex items-center gap-1">Instrument <ArrowDownUp className="h-3 w-3" /></button></th>
                        <th className="py-3">Asset</th>
                        <th className="py-3"><button onClick={() => toggleSort('exchange')} className="inline-flex items-center gap-1">Exchange <ArrowDownUp className="h-3 w-3" /></button></th>
                        <th className="py-3">Country / currency / timezone</th>
                        <th className="py-3">Data access</th>
                        <th className="py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {sortedInstruments.map((instrument, index) => (
                        <tr key={`${instrument.symbol}:${instrument.exchangeCode || instrument.exchange}:${index}`} className="hover:bg-slate-800/40">
                          <td className="py-3 font-mono font-semibold text-cyan-200">{instrument.symbol}</td>
                          <td className="py-3">{instrument.name}</td>
                          <td className="py-3 text-slate-300">{instrument.assetType}</td>
                          <td className="py-3 text-slate-300">{instrument.exchange || 'Not provided'}{instrument.exchangeCode ? ` · ${instrument.exchangeCode}` : ''}</td>
                          <td className="py-3 text-slate-400">{countryFlag(instrument.country)} {instrument.country || 'Not provided'}<br /><span className="text-xs">{instrument.currency || 'Currency not provided'} · {instrument.timezone || 'Timezone not provided'}</span></td>
                          <td className="py-3 text-xs text-amber-200">Entitlement not reported</td>
                          <td className="py-3 text-right"><div className="flex justify-end gap-2"><button onClick={() => addToWatchlist(instrument)} className="rounded-md border border-slate-600 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Watch</button><button onClick={() => openInstrument(instrument)} className="rounded-md border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/10">Open terminal</button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs text-slate-500">Provider search results; values are not an execution quote.</p>
                    <div className="flex gap-2">
                      <button disabled={instrumentPage <= 1 || instrumentLoading} onClick={() => void changeInstrumentPage(instrumentPage - 1)} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs disabled:opacity-40">Previous</button>
                      <span className="px-2 py-1.5 text-xs text-slate-400">Page {instrumentPage}</span>
                      <button disabled={!instrumentHasMore || instrumentLoading} onClick={() => void changeInstrumentPage(instrumentPage + 1)} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs disabled:opacity-40">Next</button>
                    </div>
                  </div>
                </div>
              )}
              {accountError && <p className="mt-3 text-sm text-amber-200">{accountError}</p>}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Market Watch</h2>
                  <p className="mt-1 text-xs text-slate-400">Display-only Twelve Data prices. Provider timestamp, server fetch time, and account execution pricing are separate. Limited to {WATCHLIST_LIMIT} symbols and polled no faster than every 30 minutes.</p>
                </div>
                <span className="text-xs text-slate-400">{marketDataEnabled ? `Polling · ${Math.round(marketPollingInterval / 60_000)} min` : 'Market provider unavailable'}</span>
              </div>
              {(marketStatusError || marketQuotes.error || watchlistError) && <p role="status" className="mb-3 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-sm text-amber-200">{watchlistError || marketQuotes.error || marketStatusError}</p>}
              {!marketDataEnabled && <p className="mb-3 text-xs text-amber-200">Provider configuration or status does not allow market polling. No prices are displayed as connected.</p>}
              {watchlist.length === 0 ? <p className="rounded-lg border border-dashed border-slate-700 py-8 text-center text-sm text-slate-400">No instruments in your watchlist. Search provider instruments above and select Watch.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-slate-800 text-xs uppercase text-slate-500"><tr><th className="py-3">Instrument</th><th className="py-3">Exchange / category</th><th className="py-3">Latest display price</th><th className="py-3">Change</th><th className="py-3">Change %</th><th className="py-3">Provider timestamp</th><th className="py-3">Server fetch time</th><th className="py-3">Timestamp assessment</th><th></th></tr></thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {watchlist.map((instrument, index) => {
                        const quote = marketQuotes.quotes[instrument.symbol];
                        return (
                          <tr key={`${instrument.symbol}:${instrument.exchange}:${index}`}>
                            <td className="py-3"><button onClick={() => openInstrument(instrument)} className="font-mono font-semibold text-cyan-200 hover:underline">{instrument.symbol}</button><div className="text-xs text-slate-400">{instrument.name}</div></td>
                            <td className="py-3 text-slate-300">{instrument.exchange || 'Not provided'}<div className="text-xs text-slate-500">{instrument.assetType}</div></td>
                            <td className="py-3 font-mono">{quote ? quote.price : marketQuotes.loading ? 'Loading…' : 'No quote'}</td>
                            <td className="py-3 font-mono text-slate-300">{quote?.change ?? 'Not provided'}</td>
                            <td className="py-3 font-mono text-slate-300">{quote?.percentChange ?? 'Not provided'}</td>
                            <td className="py-3 text-xs text-slate-300">{quote ? new Date(quote.timestamp).toLocaleString() : 'Unavailable'}{quote && <div className="text-[10px] text-slate-500" title={quote.timestamp}>{quote.timestamp}</div>}</td>
                            <td className="py-3 text-xs text-slate-300">{quote?.fetchedAt ? new Date(quote.fetchedAt).toLocaleString() : 'Unavailable'}{quote?.fetchedAt && <div className="text-[10px] text-slate-500" title={quote.fetchedAt}>{quote.fetchedAt}</div>}</td>
                            <td className="py-3 text-xs">{quote ? quoteTimestampState(quote.timestamp) : 'Provider timestamp unavailable'}<div className="text-[10px] text-amber-200">Realtime/delayed entitlement not reported</div></td>
                            <td className="py-3 text-right"><button onClick={() => removeFromWatchlist(instrument)} className="text-xs text-slate-400 hover:text-red-300">Remove</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Exchange directory</h2>
                  <p className="mt-1 text-xs text-slate-400">Only exchanges returned by Twelve Data are listed. Trading hours are omitted because the configured subscription does not provide the schedule endpoint.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input value={exchangeQuery} onChange={(event) => { setExchangeQuery(event.target.value); setExchangePage(1); }} placeholder="Filter exchanges" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                  <select value={exchangeType} onChange={(event) => { setExchangeType(event.target.value as 'ALL' | 'STOCK' | 'CRYPTO'); setExchangePage(1); }} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                    <option value="ALL">All exchange types</option><option value="STOCK">Stock exchanges</option><option value="CRYPTO">Crypto exchanges</option>
                  </select>
                </div>
              </div>
              {exchangeError && <p role="alert" className="mb-3 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-200">{exchangeError}</p>}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                    <tr><th className="py-3">Exchange</th><th className="py-3">Country</th><th className="py-3">Code</th><th className="py-3">Timezone</th><th className="py-3">Market status</th><th className="py-3">Trading hours</th><th className="py-3">Data classification</th><th className="py-3"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {exchangeLoading && <tr><td colSpan={8} className="py-8 text-center text-slate-400">Loading provider directory…</td></tr>}
                    {!exchangeLoading && exchanges.map((exchange) => {
                      const key = exchange.code || exchange.name;
                      const status = exchangeStatuses[key];
                      return (
                        <tr key={`${exchange.marketType}:${key}`} className="hover:bg-slate-800/40">
                          <td className="py-3"><div className="font-medium">{exchange.displayName}</div><div className="text-xs text-slate-500">{exchange.marketType}</div></td>
                          <td className="py-3">{countryFlag(exchange.country)} {exchange.country || 'Not provided'}</td>
                          <td className="py-3 font-mono text-slate-300">{exchange.code || 'Not provided'}</td>
                          <td className="py-3 text-slate-300">{exchange.timezone || 'Not provided'}</td>
                          <td className="py-3">
                            {status ? <span className={status.isOpen ? 'text-emerald-300' : 'text-slate-400'}>{status.isOpen ? 'Open' : 'Closed'}{status.isOpen && status.timeToClose ? ` · closes in ${status.timeToClose}` : ''}</span> : <><button disabled={statusLoading === key} onClick={() => void loadMarketStatus(exchange)} className="text-cyan-300 hover:text-cyan-100 disabled:opacity-50">{statusLoading === key ? 'Checking…' : 'Check provider status'}</button>{statusMessages[key] && <div className="mt-1 max-w-36 text-[10px] text-amber-200">{statusMessages[key]}</div>}</>}
                          </td>
                          <td className="py-3 text-slate-400"><button disabled={scheduleLoading === key} onClick={() => void loadSchedule(exchange)} className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-100 disabled:opacity-50"><Clock3 className="h-3 w-3" />{scheduleLoading === key ? 'Checking…' : 'Check schedule'}</button><div className="mt-1 max-w-48 text-[10px] text-amber-200">{scheduleMessages[key] || 'Not in directory'}</div></td>
                          <td className="py-3 text-xs text-amber-200">Subscription entitlement not provided</td>
                          <td className="py-3"><button onClick={() => { setSelectedExchange(exchange.name); setAssetType('STOCK'); document.getElementById('instrument-search')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-xs text-cyan-300 hover:text-cyan-100">Search listings</button></td>
                        </tr>
                      );
                    })}
                    {!exchangeLoading && exchanges.length === 0 && !exchangeError && <tr><td colSpan={8} className="py-8 text-center text-slate-400">No exchanges returned for this filter.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span>Page {exchangePage} of {exchangeTotalPages}</span>
                <div className="flex gap-2">
                  <button disabled={exchangePage <= 1 || exchangeLoading} onClick={() => setExchangePage((page) => page - 1)} className="rounded-md border border-slate-700 px-3 py-1.5 disabled:opacity-40">Previous</button>
                  <button disabled={exchangePage >= exchangeTotalPages || exchangeLoading} onClick={() => setExchangePage((page) => page + 1)} className="rounded-md border border-slate-700 px-3 py-1.5 disabled:opacity-40">Next</button>
                </div>
              </div>
            </section>

            <p className="text-xs leading-relaxed text-slate-500">
              Twelve Data documentation: <a className="text-cyan-300 underline" href="https://twelvedata.com/docs/markets/exchanges" target="_blank" rel="noreferrer">exchanges</a>, <a className="text-cyan-300 underline" href="https://twelvedata.com/docs/discovery/symbol-search" target="_blank" rel="noreferrer">symbol search</a>, and <a className="text-cyan-300 underline" href="https://twelvedata.com/docs/markets/exchange-schedule" target="_blank" rel="noreferrer">exchange schedule</a>. A schedule access failure is shown as returned; no hours, delays, or subscription tiers are inferred.
            </p>
          </div>
        </main>
      </UserLayout>
    </ProtectedRoute>
  );
}
