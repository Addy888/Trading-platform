import { TwelveDataApiError, TwelveDataProvider } from './twelve-data.provider';

const originalApiKey = process.env.TWELVE_DATA_API_KEY;

function providerResponse(data: unknown, status = 200, retryAfter: string | null = null): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: jest.fn().mockReturnValue(retryAfter) },
    json: jest.fn().mockResolvedValue(data),
  } as unknown as Response;
}

describe('TwelveDataProvider', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.TWELVE_DATA_API_KEY = 'test-key-not-for-network';
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    if (originalApiKey === undefined) delete process.env.TWELVE_DATA_API_KEY;
    else process.env.TWELVE_DATA_API_KEY = originalApiKey;
  });

  it('normalizes, validates and sorts candle responses', async () => {
    fetchMock.mockResolvedValue(providerResponse({
      values: [
        { datetime: '2026-10-29T12:00:00+01:00', open: '1.2', high: '1.3', low: '1.1', close: '1.25', volume: '12' },
        { datetime: '2026-10-29 10:00:00', open: '1.0', high: '1.2', low: '0.9', close: '1.1' },
      ],
    }));

    const candles = await new TwelveDataProvider().getTimeSeries('EURUSD', '1h', 2);

    expect(candles.map((candle) => candle.timestamp.toISOString())).toEqual([
      '2026-10-29T10:00:00.000Z',
      '2026-10-29T11:00:00.000Z',
    ]);
    expect(candles.every((candle) =>
      candle.open.isFinite() &&
      candle.high.gte(candle.open) &&
      candle.high.gte(candle.close) &&
      candle.high.gte(candle.low) &&
      candle.low.lte(candle.open) &&
      candle.low.lte(candle.close),
    )).toBe(true);

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe('/time_series');
    expect(requestUrl.searchParams.get('symbol')).toBe('EUR/USD');
    expect(requestUrl.searchParams.get('interval')).toBe('1h');
    expect(requestUrl.searchParams.get('timezone')).toBe('UTC');
  });

  it('uses the latest quote timestamp instead of the prior-session timestamp', async () => {
    fetchMock.mockResolvedValue(providerResponse({
      symbol: 'EUR/USD',
      close: '1.11673',
      change: '-0.0004',
      percent_change: '-0.04',
      datetime: '2026-10-29',
      timestamp: 1793217600,
      last_quote_at: 1793286780,
    }));

    const quote = await new TwelveDataProvider().getQuote('EURUSD');

    expect(quote.timestamp).toBe('2026-10-29T15:13:00.000Z');
    expect(quote.change).toBe('-0.0004');
    expect(quote.percentChange).toBe('-0.04');
    expect(Number.isFinite(Date.parse(quote.fetchedAt))).toBe(true);
  });

  it('resolves compact trading symbols through Twelve Data provider symbols', async () => {
    fetchMock.mockResolvedValue(providerResponse({
      data: [{
        symbol: 'EUR/USD',
        instrument_name: 'Euro / US Dollar',
        instrument_type: 'Physical Currency',
      }],
    }));

    const instrument = await new TwelveDataProvider().getInstrumentDetails('EURUSD');

    expect(instrument).toMatchObject({
      symbol: 'EUR/USD',
      name: 'Euro / US Dollar',
      assetType: 'FOREX',
    });
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe('/symbol_search');
    expect(requestUrl.searchParams.get('symbol')).toBe('EUR/USD');
  });

  it('normalizes and caches provider exchange and symbol-search results without inventing metadata', async () => {
    fetchMock
      .mockResolvedValueOnce(providerResponse({
        data: [{ name: 'NASDAQ', title: 'Nasdaq Stock Market', code: 'XNGS', country: 'United States', timezone: 'America/New_York' }],
      }))
      .mockResolvedValueOnce(providerResponse({ data: [{ name: 'Binance' }] }))
      .mockResolvedValueOnce(providerResponse({
        data: [{
          symbol: 'EUR/USD',
          instrument_name: 'Euro / US Dollar',
          exchange: 'PHYSICAL CURRENCY',
          mic_code: 'PHYSICAL_CURRENCY',
          instrument_type: 'Physical Currency',
          exchange_timezone: 'Australia/Sydney',
          country: '',
          currency: '',
        }],
      }));

    const provider = new TwelveDataProvider();
    const exchanges = await provider.getExchanges();
    const cachedExchanges = await provider.getExchanges();
    const instruments = await provider.searchInstruments('EUR/USD', 12);

    expect(cachedExchanges).toBe(exchanges);
    expect(exchanges).toEqual([
      expect.objectContaining({
        name: 'NASDAQ',
        displayName: 'Nasdaq Stock Market',
        code: 'XNGS',
        country: 'United States',
        timezone: 'America/New_York',
        marketType: 'STOCK',
      }),
      expect.objectContaining({ name: 'Binance', marketType: 'CRYPTO', country: null, timezone: null }),
    ]);
    expect(instruments[0]).toMatchObject({
      symbol: 'EUR/USD',
      assetType: 'FOREX',
      exchange: 'PHYSICAL CURRENCY',
      country: null,
      currency: null,
    });
    expect(new URL(String(fetchMock.mock.calls[2][0])).searchParams.get('outputsize')).toBe('12');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('normalizes root-array market state and surfaces restricted schedule endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(providerResponse([
        { name: 'NASDAQ', code: 'XNGS', country: 'United States', is_market_open: true, time_to_close: '03:00:00' },
      ]))
      .mockResolvedValueOnce(providerResponse({
        status: 'error',
        code: 403,
        message: 'This endpoint is available exclusively with Ultra or Enterprise plans.',
      }, 403));

    const provider = new TwelveDataProvider();
    const markets = await provider.getExchangeMarketState('NASDAQ');

    expect(markets).toEqual([
      expect.objectContaining({ name: 'NASDAQ', code: 'XNGS', isOpen: true, timeToClose: '03:00:00' }),
    ]);
    await expect(provider.getExchangeSchedule('NASDAQ')).rejects.toMatchObject({
      category: 'SUBSCRIPTION_RESTRICTED',
      message: 'Twelve Data restricted this endpoint for the configured subscription.',
    });
  });

  it('deduplicates duplicate timestamps instead of rejecting the series', async () => {
    const provider = new TwelveDataProvider();
    fetchMock.mockResolvedValue(providerResponse({
      values: [
        { datetime: '2026-10-29 10:00:00', open: '1.0', high: '1.2', low: '0.9', close: '1.1' },
        { datetime: '2026-10-29T10:00:00Z', open: '1.0', high: '1.25', low: '0.88', close: '1.12' },
      ],
    }));
    const candles = await provider.getTimeSeries('EURUSD', '1h', 2);
    expect(candles).toHaveLength(1);
    expect(candles[0].open.toNumber()).toBe(1);
    expect(candles[0].close.toNumber()).toBe(1.12);
    expect(candles[0].high.toNumber()).toBe(1.25);
    expect(candles[0].low.toNumber()).toBe(0.88);
  });

  it('rejects invalid OHLC values', async () => {
    const provider = new TwelveDataProvider();

    fetchMock.mockResolvedValue(providerResponse({
      values: [{ datetime: '2026-10-29 10:00:00', open: '1.0', high: '0.8', low: '0.9', close: '1.1' }],
    }));
    await expect(provider.getTimeSeries('EURUSD', '1h', 1))
      .rejects.toMatchObject({ category: 'PROVIDER', message: expect.stringContaining('invalid OHLC') });
  });

  it('validates OHLC constraints: high >= max(open, close, low)', async () => {
    const provider = new TwelveDataProvider();
    
    // Case 1: high < close
    fetchMock.mockResolvedValue(providerResponse({
      values: [{ datetime: '2026-10-29 10:00:00', open: '1.0', high: '1.05', low: '0.9', close: '1.1' }],
    }));
    await expect(provider.getTimeSeries('EURUSD', '1h', 1))
      .rejects.toMatchObject({ 
        category: 'PROVIDER', 
        message: expect.stringContaining('high must be >= max(open, close, low)')
      });
    
    // Case 2: high < open
    fetchMock.mockResolvedValue(providerResponse({
      values: [{ datetime: '2026-10-29 10:00:00', open: '1.2', high: '1.15', low: '0.9', close: '1.0' }],
    }));
    await expect(provider.getTimeSeries('EURUSD', '1h', 1))
      .rejects.toMatchObject({ 
        category: 'PROVIDER', 
        message: expect.stringContaining('high must be >= max(open, close, low)')
      });
    
    // Case 3: high < low (impossible but check)
    fetchMock.mockResolvedValue(providerResponse({
      values: [{ datetime: '2026-10-29 10:00:00', open: '1.0', high: '0.8', low: '0.9', close: '1.0' }],
    }));
    await expect(provider.getTimeSeries('EURUSD', '1h', 1))
      .rejects.toMatchObject({ 
        category: 'PROVIDER', 
        message: expect.stringContaining('high must be >= max(open, close, low)')
      });
  });

  it('validates OHLC constraints: low <= min(open, close)', async () => {
    const provider = new TwelveDataProvider();
    
    // Case 1: low > close
    fetchMock.mockResolvedValue(providerResponse({
      values: [{ datetime: '2026-10-29 10:00:00', open: '1.2', high: '1.3', low: '1.15', close: '1.1' }],
    }));
    await expect(provider.getTimeSeries('EURUSD', '1h', 1))
      .rejects.toMatchObject({ 
        category: 'PROVIDER', 
        message: expect.stringContaining('low must be <= min(open, close)')
      });
    
    // Case 2: low > open
    fetchMock.mockResolvedValue(providerResponse({
      values: [{ datetime: '2026-10-29 10:00:00', open: '1.0', high: '1.3', low: '1.05', close: '1.2' }],
    }));
    await expect(provider.getTimeSeries('EURUSD', '1h', 1))
      .rejects.toMatchObject({ 
        category: 'PROVIDER', 
        message: expect.stringContaining('low must be <= min(open, close)')
      });
  });

  it('accepts valid OHLC candles with proper constraints', async () => {
    const provider = new TwelveDataProvider();
    
    // Valid bullish candle: open < close, low <= open, high >= close
    fetchMock.mockResolvedValue(providerResponse({
      values: [{ datetime: '2026-10-29 10:00:00', open: '1.0', high: '1.2', low: '0.95', close: '1.15' }],
    }));
    const bullish = await provider.getTimeSeries('EURUSD', '1h', 1);
    expect(bullish).toHaveLength(1);
    expect(bullish[0].open.toNumber()).toBe(1.0);
    expect(bullish[0].high.toNumber()).toBe(1.2);
    expect(bullish[0].low.toNumber()).toBe(0.95);
    expect(bullish[0].close.toNumber()).toBe(1.15);
    
    // Valid bearish candle: open > close, low <= close, high >= open
    fetchMock.mockResolvedValue(providerResponse({
      values: [{ datetime: '2026-10-29 11:00:00', open: '1.2', high: '1.25', low: '1.0', close: '1.05' }],
    }));
    const bearish = await provider.getTimeSeries('EURUSD', '1h', 1);
    expect(bearish).toHaveLength(1);
    expect(bearish[0].open.toNumber()).toBe(1.2);
    expect(bearish[0].high.toNumber()).toBe(1.25);
    expect(bearish[0].low.toNumber()).toBe(1.0);
    expect(bearish[0].close.toNumber()).toBe(1.05);
    
    // Valid doji: open == close, high and low are wicks
    fetchMock.mockResolvedValue(providerResponse({
      values: [{ datetime: '2026-10-29 12:00:00', open: '1.1', high: '1.15', low: '1.05', close: '1.1' }],
    }));
    const doji = await provider.getTimeSeries('EURUSD', '1h', 1);
    expect(doji).toHaveLength(1);
    expect(doji[0].open.toNumber()).toBe(1.1);
    expect(doji[0].high.toNumber()).toBe(1.15);
    expect(doji[0].low.toNumber()).toBe(1.05);
    expect(doji[0].close.toNumber()).toBe(1.1);
  });

  it('correctly maps all supported intervals to Twelve Data format', async () => {
    const provider = new TwelveDataProvider();
    const intervalTests = [
      { input: '1m', expected: '1min' },
      { input: '1min', expected: '1min' },
      { input: '5m', expected: '5min' },
      { input: '5min', expected: '5min' },
      { input: '15m', expected: '15min' },
      { input: '15min', expected: '15min' },
      { input: '30m', expected: '30min' },
      { input: '30min', expected: '30min' },
      { input: '1h', expected: '1h' },
      { input: '4h', expected: '4h' },
      { input: '1d', expected: '1day' },
      { input: '1day', expected: '1day' },
    ];
    
    for (const test of intervalTests) {
      fetchMock.mockResolvedValue(providerResponse({
        meta: { interval: test.expected },
        values: [{ datetime: '2026-10-29 10:00:00', open: '1.0', high: '1.2', low: '0.9', close: '1.1' }],
      }));
      
      await provider.getTimeSeries('EURUSD', test.input, 1);
      const requestUrl = new URL(String(fetchMock.mock.lastCall[0]));
      expect(requestUrl.searchParams.get('interval')).toBe(test.expected);
    }
  });

  it('does not contact Twelve Data when the server key is missing', async () => {
    process.env.TWELVE_DATA_API_KEY = '  ';
    const provider = new TwelveDataProvider();

    await expect(provider.getTimeSeries('EURUSD', '1h', 1))
      .rejects.toMatchObject({ category: 'NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('categorizes invalid credentials without returning the credential in the error', async () => {
    fetchMock.mockResolvedValue(providerResponse({ status: 'error', code: 401, message: 'Invalid API key' }));

    const provider = new TwelveDataProvider();
    await expect(provider.getTimeSeries('EURUSD', '1h', 1))
      .rejects.toMatchObject({
        category: 'INVALID_CREDENTIALS',
        message: 'Twelve Data rejected the API key.',
      });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('categorizes provider timeouts and rate limits with retry metadata', async () => {
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    fetchMock.mockRejectedValueOnce(timeout);
    await expect(new TwelveDataProvider().getTimeSeries('EURUSD', '1h', 1))
      .rejects.toMatchObject({ category: 'NETWORK', message: 'Twelve Data request timed out.' });

    fetchMock.mockResolvedValueOnce(providerResponse({ status: 'error', code: 429 }, 429, '30'));
    await expect(new TwelveDataProvider().getTimeSeries('EURUSD', '1h', 1))
      .rejects.toMatchObject({ category: 'RATE_LIMITED', retryAfterMs: 30000 });
  });

  it('rejects unsupported symbols and timeframes before making requests', async () => {
    const provider = new TwelveDataProvider();

    await expect(provider.getTimeSeries('BAD SYMBOL', '1h', 1))
      .rejects.toBeInstanceOf(TwelveDataApiError);
    await expect(provider.getTimeSeries('EURUSD', '10m', 1))
      .rejects.toMatchObject({ category: 'UNSUPPORTED_INTERVAL' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
