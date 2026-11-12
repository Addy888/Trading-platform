import { HttpException } from '@nestjs/common';
import { MarketDataManagerService, ProviderStatus } from './market-data-manager.service';
import { TwelveDataApiError, TwelveDataProvider } from './providers/twelve-data/twelve-data.provider';

function createService(provider: Partial<TwelveDataProvider> = {}) {
  const twelve = {
    isConfigured: jest.fn().mockReturnValue(true),
    getConfigurationStatus: jest.fn().mockReturnValue({ configured: true, missingVariables: [], apiBaseUrl: 'https://api.twelvedata.com', streamingConfigured: false, streamingMode: 'POLLING' }),
    getSupportedSymbols: jest.fn().mockReturnValue(['EURUSD']),
    validateCredentials: jest.fn().mockResolvedValue(undefined),
    getQuote: jest.fn().mockResolvedValue({ symbol: 'EURUSD', price: '1.08', timestamp: '2026-10-29T00:00:00.000Z' }),
    getTimeSeries: jest.fn().mockResolvedValue([{ timestamp: new Date('2026-10-29T00:00:00Z'), open: '1.0', high: '1.1', low: '0.9', close: '1.08' }]),
    ...provider,
  } as unknown as TwelveDataProvider;
  return { service: new MarketDataManagerService(twelve), twelve };
}

describe('MarketDataManagerService', () => {
  it('deduplicates concurrent latest-price requests and exposes polling status', async () => {
    const { service, twelve } = createService();
    await Promise.all([service.getQuote('EURUSD'), service.getQuote('EURUSD')]);
    expect(twelve.getQuote).toHaveBeenCalledTimes(1);
    const status = service.getProviderStatus();
    expect(status.providers.TWELVE_DATA).toMatchObject({
      quoteStatus: ProviderStatus.AVAILABLE,
      quoteLastSuccessAt: expect.any(String),
      streamingMode: 'POLLING',
    });
    expect(status.configuration.pollingIntervalMs).toBeGreaterThanOrEqual(900000);
    expect(status.configuration.staleThresholdMs).toBeGreaterThanOrEqual(status.configuration.pollingIntervalMs);
  });
  it('keeps quote cache entries scoped to the requested exchange', async () => {
    const getQuote = jest.fn()
      .mockResolvedValueOnce({ symbol: 'ABC', price: '10', timestamp: '2026-10-29T00:00:00.000Z' })
      .mockResolvedValueOnce({ symbol: 'ABC', price: '11', timestamp: '2026-10-29T00:00:00.000Z' });
    const { service } = createService({ getQuote });

    const nasdaq = await service.getQuote('ABC', 'NASDAQ');
    const nyse = await service.getQuote('ABC', 'NYSE');

    expect(nasdaq.price).toBe('10');
    expect(nyse.price).toBe('11');
    expect(getQuote).toHaveBeenNthCalledWith(1, 'ABC', 'NASDAQ');
    expect(getQuote).toHaveBeenNthCalledWith(2, 'ABC', 'NYSE');
  });
  it('never calls a provider when the API key is missing', async () => {
    const { service, twelve } = createService({ isConfigured: jest.fn().mockReturnValue(false), getQuote: jest.fn() });
    await expect(service.getQuote('EURUSD')).rejects.toBeInstanceOf(HttpException);
    expect(twelve.getQuote).not.toHaveBeenCalled();
    expect(service.getProviderStatus().providers.TWELVE_DATA.status).toBe(ProviderStatus.DISABLED);
  });
  it('returns a retryable rate-limit response and honours the cooldown', async () => {
    const getQuote = jest.fn().mockRejectedValue(new TwelveDataApiError('RATE_LIMITED', 'Rate limited', 60000));
    const { service } = createService({ getQuote });
    await expect(service.getQuote('EURUSD')).rejects.toBeInstanceOf(HttpException);
    await expect(service.getQuote('GBPUSD')).rejects.toBeInstanceOf(HttpException);
    expect(getQuote).toHaveBeenCalledTimes(1);
  });
  it('records invalid credentials from a real validation attempt', async () => {
    const { service } = createService({ validateCredentials: jest.fn().mockRejectedValue(new TwelveDataApiError('INVALID_CREDENTIALS', 'Rejected')) });
    await service.onModuleInit();
    expect(service.getProviderStatus().providers.TWELVE_DATA.status).toBe(ProviderStatus.INVALID_CREDENTIALS);
  });
});
