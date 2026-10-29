import { OandaProvider } from './oanda.provider';

const originalOandaEnvironment = {
  token: process.env.OANDA_API_TOKEN,
  accountId: process.env.OANDA_ACCOUNT_ID,
  environment: process.env.OANDA_ENVIRONMENT,
};

function makeProvider(environment = 'practice', accountId = 'test-account'): OandaProvider {
  process.env.OANDA_API_TOKEN = 'test-token';
  process.env.OANDA_ACCOUNT_ID = accountId;
  process.env.OANDA_ENVIRONMENT = environment;
  return new OandaProvider();
}

function response(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers?.[name.toLowerCase()] ?? null } as Headers,
    json: async () => body,
    clone: () => ({ json: async () => body }) as Response,
  } as Response;
}

describe('OandaProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalOandaEnvironment.token === undefined) delete process.env.OANDA_API_TOKEN;
    else process.env.OANDA_API_TOKEN = originalOandaEnvironment.token;
    if (originalOandaEnvironment.accountId === undefined) delete process.env.OANDA_ACCOUNT_ID;
    else process.env.OANDA_ACCOUNT_ID = originalOandaEnvironment.accountId;
    if (originalOandaEnvironment.environment === undefined) delete process.env.OANDA_ENVIRONMENT;
    else process.env.OANDA_ENVIRONMENT = originalOandaEnvironment.environment;
  });

  it('fetches genuine best bid/ask quotes from the configured practice endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ instruments: [{ name: 'EUR_USD' }] }))
      .mockResolvedValueOnce(response({
        prices: [{
          bids: [{ price: '1.08001' }],
          asks: [{ price: '1.08009' }],
          time: '2026-10-20T10:00:00.000000000Z',
        }],
      }));

    const quote = await makeProvider().getQuote('EURUSD');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api-fxpractice.oanda.com/v3/accounts/test-account/instruments?instruments=EUR_USD',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api-fxpractice.oanda.com/v3/accounts/test-account/pricing?instruments=EUR_USD',
    );
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(quote).toMatchObject({
      provider: 'OANDA',
      bid: '1.08001',
      ask: '1.08009',
      spread: '0.00008',
      price: '1.08005',
    });
  });

  it('selects live only when configured and rejects unknown environment names', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      response({ instruments: [{ name: 'EUR_USD' }] }),
    );

    await expect(makeProvider('live').getAvailableInstruments()).resolves.toContain('EUR_USD');
    expect(fetchMock.mock.calls[0][0]).toContain('https://api-fxtrade.oanda.com/');
    expect(() => makeProvider('invalid')).toThrow('OANDA_ENVIRONMENT must be either "practice" or "live".');
  });

  it('reports safe configuration diagnostics without returning credential values', () => {
    const provider = makeProvider('practice');
    expect(provider.getConfigurationStatus()).toEqual({
      configured: true,
      missingVariables: [],
      accountIdConfigured: true,
      accountSpecificPricingAvailable: true,
      environment: 'practice',
      apiBaseUrl: 'https://api-fxpractice.oanda.com',
    });
    expect(JSON.stringify(provider.getConfigurationStatus())).not.toContain('test-token');
    expect(JSON.stringify(provider.getConfigurationStatus())).not.toContain('test-account');
  });

  it('reports missing variable names without exposing credentials', () => {
    process.env.OANDA_API_TOKEN = '';
    process.env.OANDA_ACCOUNT_ID = '';
    const provider = new OandaProvider();
    expect(provider.getConfigurationStatus()).toMatchObject({
      configured: false,
      missingVariables: ['OANDA_API_TOKEN'],
      accountIdConfigured: false,
      accountSpecificPricingAvailable: false,
      environment: 'practice',
      apiBaseUrl: 'https://api-fxpractice.oanda.com',
    });
  });

  it('fetches candles with a token and no account ID, but does not invent bid/ask quotes', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({
      candles: [{
        complete: true,
        time: '2026-10-20T10:00:00.000000000Z',
        volume: 5,
        mid: { o: '1.1', h: '1.2', l: '1.0', c: '1.15' },
      }],
    }));
    const provider = makeProvider('practice', '');

    const candles = await provider.getTimeSeries('EUR/USD', '1m', 1);

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api-fxpractice.oanda.com/v3/instruments/EUR_USD/candles?granularity=M1&count=1&price=M',
    );
    expect(candles[0]).toMatchObject({
      volume: 5,
    });
    expect(candles[0].open.toString()).toBe('1.1');
    await expect(provider.getQuote('EURUSD')).rejects.toMatchObject({
      category: 'ACCOUNT_ID_REQUIRED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requires an account ID before calling account-specific endpoints', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const provider = makeProvider('practice', '');

    await expect(provider.getAvailableInstruments()).rejects.toMatchObject({
      category: 'ACCOUNT_ID_REQUIRED',
    });
    await expect(provider.getQuote('EURUSD')).rejects.toMatchObject({
      category: 'ACCOUNT_ID_REQUIRED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates token access through the account-independent candle endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({ candles: [] }));
    const provider = makeProvider('practice', '');

    await expect(provider.validateCredentials()).resolves.toBeUndefined();

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api-fxpractice.oanda.com/v3/instruments/EUR_USD/candles?granularity=H1&count=10',
    );
  });

  it('requests OANDA M10 candles and returns only complete validated candles', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({
        candles: [
          {
            complete: true,
            time: '2026-10-20T10:00:00.000000000Z',
            volume: 12,
            mid: { o: '1.1', h: '1.2', l: '1.0', c: '1.15' },
          },
          {
            complete: false,
            time: '2026-10-20T10:10:00.000000000Z',
            mid: { o: '1.15', h: '1.3', l: '1.1', c: '1.2' },
          },
        ],
      }));

    const candles = await makeProvider().getTimeSeries('EUR_USD', '10m', 25);

    expect(fetchMock.mock.calls[0][0]).toContain('/candles?granularity=M10&count=25&price=M');
    expect(candles).toHaveLength(1);
    expect(candles[0].open.toString()).toBe('1.1');
    expect(candles[0].high.toString()).toBe('1.2');
    expect(candles[0].volume).toBe(12);
    expect(candles[0].timestamp.toISOString()).toBe('2026-10-20T10:00:00.000Z');
  });

  it('normalizes EUR/USD H1 candles and returns them chronologically', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({
      candles: [
        {
          complete: true,
          time: '2026-10-20T12:00:00.000000000Z',
          volume: 21,
          mid: { o: '1.10120', h: '1.10300', l: '1.10000', c: '1.10250' },
        },
        {
          complete: true,
          time: '2026-10-20T11:00:00.000000000Z',
          volume: 18,
          mid: { o: '1.09900', h: '1.10200', l: '1.09850', c: '1.10120' },
        },
      ],
    }));

    const candles = await makeProvider().getTimeSeries('EUR_USD', '1h', 2);

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api-fxpractice.oanda.com/v3/instruments/EUR_USD/candles?granularity=H1&count=2&price=M',
    );
    expect(candles.map((candle) => candle.timestamp.toISOString())).toEqual([
      '2026-10-20T11:00:00.000Z',
      '2026-10-20T12:00:00.000Z',
    ]);
    expect(candles[0].open.toString()).toBe('1.099');
    expect(candles[0].high.toString()).toBe('1.102');
    expect(candles[0].low.toString()).toBe('1.0985');
    expect(candles[0].close.toString()).toBe('1.1012');
    expect(candles[0].volume).toBe(18);
  });

  it('maps every requested timeframe to its OANDA granularity', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const intervals: Array<[string, string]> = [
      ['1m', 'M1'],
      ['5m', 'M5'],
      ['10m', 'M10'],
      ['15m', 'M15'],
      ['30m', 'M30'],
      ['1h', 'H1'],
      ['4h', 'H4'],
      ['1d', 'D'],
    ];
    for (const [, granularity] of intervals) {
      fetchMock.mockResolvedValueOnce(response({
        candles: [{
          complete: true,
          time: '2026-10-20T10:00:00.000000000Z',
          mid: { o: '1.1', h: '1.2', l: '1.0', c: '1.15' },
        }],
      }));
    }

    const provider = makeProvider();
    for (const [interval] of intervals) {
      await provider.getTimeSeries('EURUSD', interval, 10);
    }

    const candleUrls = fetchMock.mock.calls.map(([url]) => String(url));
    intervals.forEach(([, granularity], index) => {
      expect(candleUrls[index]).toContain(`granularity=${granularity}&count=10&price=M`);
    });
  });

  it('reports account-unsupported instruments rather than returning fallback data', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({ instruments: [] }));
    await expect(makeProvider().getQuote('EURUSD')).rejects.toMatchObject({
      category: 'INSTRUMENT_UNAVAILABLE',
    });
  });

  it('classifies invalid authentication and rate limiting without exposing credentials', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({
      errorMessage: 'Insufficient authorization to perform request.',
    }, 401));
    await expect(makeProvider().validateCredentials()).rejects.toMatchObject({
      category: 'INVALID_CREDENTIALS',
      httpStatus: 401,
      message: expect.stringContaining('Insufficient authorization to perform request.'),
    });

    jest.restoreAllMocks();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({}, 429, { 'retry-after': '2' }));
    await expect(makeProvider().validateCredentials()).rejects.toMatchObject({
      category: 'RATE_LIMITED',
      retryAfterMs: 2000,
    });
  });

  it('classifies denied and unknown accounts separately from invalid authentication', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({}, 403));
    await expect(makeProvider().getAvailableInstruments()).rejects.toMatchObject({
      category: 'ACCOUNT_ACCESS',
    });

    jest.restoreAllMocks();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({}, 404));
    await expect(makeProvider().getAvailableInstruments()).rejects.toMatchObject({
      category: 'ACCOUNT_ACCESS',
    });
  });

  it('reports an empty complete-candle response instead of manufacturing candles', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({ candles: [] }));
    await expect(makeProvider().getTimeSeries('EURUSD', '1m')).rejects.toMatchObject({
      category: 'EMPTY_CANDLES',
    });
  });

  it('classifies network failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await expect(makeProvider().validateCredentials()).rejects.toMatchObject({
      category: 'NETWORK',
    });
  });
});
