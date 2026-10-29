import { HttpException } from '@nestjs/common';
import { MarketDataManagerService, ProviderStatus } from './market-data-manager.service';
import { OandaApiError, OandaProvider } from './providers/oanda/oanda.provider';

function makeManager(provider: Partial<OandaProvider>) {
  const oanda = {
    isConfigured: jest.fn().mockReturnValue(true),
    getEnvironment: jest.fn().mockReturnValue('practice'),
    getConfigurationStatus: jest.fn().mockReturnValue({
      configured: true,
      missingVariables: [],
      accountIdConfigured: true,
      accountSpecificPricingAvailable: true,
      environment: 'practice',
      apiBaseUrl: 'https://api-fxpractice.oanda.com',
    }),
    validateCredentials: jest.fn().mockResolvedValue(undefined),
    ...provider,
  } as unknown as OandaProvider;
  return { service: new MarketDataManagerService(oanda), oanda };
}

describe('MarketDataManagerService', () => {
  it('deduplicates concurrent quote requests and caches successful responses', async () => {
    const quote = { bid: '1.08', ask: '1.09', provider: 'OANDA' };
    const getQuote = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(quote), 5)),
    );
    const { service } = makeManager({ getQuote });

    const results = await Promise.all([
      service.getQuote('EURUSD'),
      service.getQuote('EURUSD'),
      service.getQuote('EURUSD'),
    ]);
    await service.getQuote('EURUSD');

    expect(results).toEqual([quote, quote, quote]);
    expect(getQuote).toHaveBeenCalledTimes(1);
    expect(service.getProviderStatus().providers.OANDA.quoteStatus).toBe(ProviderStatus.AVAILABLE);
  });

  it('stops retrying invalid credentials after the initial validation failure', async () => {
    const getQuote = jest.fn();
    const { service, oanda } = makeManager({
      validateCredentials: jest.fn().mockRejectedValue(
        new OandaApiError('INVALID_CREDENTIALS', 'OANDA rejected the token.'),
      ),
      getQuote,
    });

    await service.onModuleInit();
    await expect(service.getQuote('EURUSD')).rejects.toBeInstanceOf(HttpException);

    expect(service.getProviderStatus().providers.OANDA.status).toBe(ProviderStatus.INVALID_CREDENTIALS);
    expect(service.getProviderStatus().providers.OANDA.quoteStatus).toBe(ProviderStatus.INVALID_CREDENTIALS);
    expect(oanda.validateCredentials).toHaveBeenCalledTimes(1);
    expect(getQuote).not.toHaveBeenCalled();
  });

  it('reports missing configuration without attempting OANDA requests', async () => {
    const getQuote = jest.fn();
    const { service, oanda } = makeManager({
      isConfigured: jest.fn().mockReturnValue(false),
      getConfigurationStatus: jest.fn().mockReturnValue({
        configured: false,
        missingVariables: ['OANDA_API_TOKEN'],
        accountIdConfigured: false,
        accountSpecificPricingAvailable: false,
        environment: 'practice',
        apiBaseUrl: 'https://api-fxpractice.oanda.com',
      }),
      getQuote,
    });

    const status = service.getProviderStatus();
    await expect(service.getQuote('EURUSD')).rejects.toMatchObject({
      response: { category: 'NOT_CONFIGURED', retryable: false },
    });

    expect(status).toMatchObject({
      errorCategory: 'NOT_CONFIGURED',
      configuration: { configured: false, missingVariables: ['OANDA_API_TOKEN'] },
    });
    expect(getQuote).not.toHaveBeenCalled();
    expect(oanda.getConfigurationStatus).toHaveBeenCalled();
  });

  it('exposes provider outages as retryable health categories', async () => {
    const { service } = makeManager({
      validateCredentials: jest.fn().mockRejectedValue(
        new OandaApiError('NETWORK', 'Unable to reach the selected OANDA environment.'),
      ),
    });

    await service.onModuleInit();

    expect(service.getProviderStatus()).toMatchObject({
      errorCategory: 'NETWORK',
      providers: { OANDA: { status: ProviderStatus.ERROR, errorCategory: 'NETWORK' } },
    });
  });

  it('applies the OANDA retry-after cooldown after rate limiting', async () => {
    const getQuote = jest.fn().mockRejectedValue(
      new OandaApiError('RATE_LIMITED', 'OANDA rate limited the request.', 60000),
    );
    const { service } = makeManager({ getQuote });

    await expect(service.getQuote('EURUSD')).rejects.toBeInstanceOf(HttpException);
    await expect(service.getQuote('GBPUSD')).rejects.toBeInstanceOf(HttpException);

    expect(getQuote).toHaveBeenCalledTimes(1);
    expect(service.getProviderStatus().providers.OANDA.quoteStatus).toBe(ProviderStatus.RATE_LIMITED);
  });

  it('keeps missing account-specific pricing separate from healthy candles', async () => {
    const getQuote = jest.fn();
    const getTimeSeries = jest.fn().mockResolvedValue([{ close: '1.1' }]);
    const { service } = makeManager({
      getConfigurationStatus: jest.fn().mockReturnValue({
        configured: true,
        missingVariables: [],
        accountIdConfigured: false,
        accountSpecificPricingAvailable: false,
        environment: 'practice',
        apiBaseUrl: 'https://api-fxpractice.oanda.com',
      }),
      getQuote,
      getTimeSeries,
    });

    await expect(service.getCandles('EURUSD', '1h', 2)).resolves.toHaveLength(1);
    await expect(service.getQuote('EURUSD')).rejects.toMatchObject({
      response: { category: 'ACCOUNT_ID_REQUIRED' },
    });

    expect(service.getProviderStatus().providers.OANDA).toMatchObject({
      candleStatus: ProviderStatus.AVAILABLE,
      candleErrorCategory: null,
      quoteStatus: ProviderStatus.ACCOUNT_ID_REQUIRED,
      quoteErrorCategory: 'ACCOUNT_ID_REQUIRED',
    });
    expect(getQuote).not.toHaveBeenCalled();
  });

  it('does not replace candle status with quote account failures', async () => {
    const { service } = makeManager({
      getQuote: jest.fn().mockRejectedValue(
        new OandaApiError('ACCOUNT_ACCESS', 'OANDA denied account pricing.'),
      ),
      getTimeSeries: jest.fn().mockResolvedValue([{ close: '1.1' }]),
    });

    await expect(service.getQuote('EURUSD')).rejects.toBeInstanceOf(HttpException);
    await expect(service.getCandles('EURUSD', '1h', 2)).resolves.toHaveLength(1);
    expect(service.getProviderStatus().providers.OANDA).toMatchObject({
      candleStatus: ProviderStatus.AVAILABLE,
      quoteStatus: ProviderStatus.ACCOUNT_ACCESS_DENIED,
      quoteErrorCategory: 'ACCOUNT_ACCESS',
    });
  });
});
