import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MarketDataManagerService, ProviderType, ProviderStatus } from '../src/market-data/market-data-manager.service';
import { TwelveDataProvider } from '../src/market-data/providers/twelvedata/twelve-data.provider';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('MarketDataManagerService', () => {
  let service: MarketDataManagerService;
  let twelveData: TwelveDataProvider;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataManagerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                MARKET_DATA_PROVIDER: 'TWELVE_DATA',
                MARKET_DATA_QUOTE_CACHE_TTL: '30000',
                MARKET_DATA_CANDLE_CACHE_TTL: '300000',
                MARKET_DATA_POLLING_INTERVAL: '20000',
                MARKET_DATA_QUOTA_RESET_HOUR: '0',
              };
              return config[key] || defaultValue;
            }),
          },
        },
        {
          provide: TwelveDataProvider,
          useValue: {
            isConfigured: jest.fn(() => true),
            getQuote: jest.fn(),
            getTimeSeries: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MarketDataManagerService>(MarketDataManagerService);
    twelveData = module.get<TwelveDataProvider>(TwelveDataProvider);
    configService = module.get<ConfigService>(ConfigService);

    await service.onModuleInit();
  });

  afterEach(() => {
    service.clearCaches();
  });

  describe('Quote Caching', () => {
    it('should cache quotes and return cached data within TTL', async () => {
      const mockQuote = {
        symbol: 'EURUSD',
        close: '1.0850',
        datetime: '2026-10-10T12:00:00Z',
      };

      jest.spyOn(twelveData, 'getQuote').mockResolvedValue(mockQuote);

      // First call - should fetch from provider
      const quote1 = await service.getQuote('EURUSD', 'LIVE');
      expect(twelveData.getQuote).toHaveBeenCalledTimes(1);
      expect(quote1.cached).toBe(false);

      // Second call within TTL - should return cached
      const quote2 = await service.getQuote('EURUSD', 'LIVE');
      expect(twelveData.getQuote).toHaveBeenCalledTimes(1); // Still 1
      expect(quote2.cached).toBe(true);
      expect(quote2.cacheAge).toBeDefined();
    });

    it('should refetch quote after cache TTL expires', async () => {
      const mockQuote = {
        symbol: 'EURUSD',
        close: '1.0850',
        datetime: '2026-10-10T12:00:00Z',
      };

      jest.spyOn(twelveData, 'getQuote').mockResolvedValue(mockQuote);

      // First call
      await service.getQuote('EURUSD', 'LIVE');
      expect(twelveData.getQuote).toHaveBeenCalledTimes(1);

      // Wait for cache to expire (mock by clearing cache)
      service.clearCaches();

      // Second call after expiry - should refetch
      await service.getQuote('EURUSD', 'LIVE');
      expect(twelveData.getQuote).toHaveBeenCalledTimes(2);
    });
  });

  describe('Request Deduplication', () => {
    it('should deduplicate concurrent requests for same symbol', async () => {
      const mockQuote = {
        symbol: 'EURUSD',
        close: '1.0850',
        datetime: '2026-10-10T12:00:00Z',
      };

      let resolveQuote: any;
      const quotePromise = new Promise((resolve) => {
        resolveQuote = resolve;
      });

      jest.spyOn(twelveData, 'getQuote').mockReturnValue(quotePromise as any);

      // Make 3 concurrent requests for same symbol
      const request1 = service.getQuote('EURUSD', 'LIVE');
      const request2 = service.getQuote('EURUSD', 'LIVE');
      const request3 = service.getQuote('EURUSD', 'LIVE');

      // Provider should only be called once
      expect(twelveData.getQuote).toHaveBeenCalledTimes(1);

      // Resolve the mock
      resolveQuote(mockQuote);

      // All should receive same result
      const [result1, result2, result3] = await Promise.all([request1, request2, request3]);
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });
  });

  describe('Quota Exhaustion Handling', () => {
    it('should detect quota exhaustion and enter cooldown', async () => {
      const quotaError = new Error('HTTP 429: You have run out of API credits for the day');

      jest.spyOn(twelveData, 'getQuote').mockRejectedValue(quotaError);

      // First request triggers quota exhaustion
      await expect(service.getQuote('EURUSD', 'LIVE')).rejects.toThrow();

      const status = service.getProviderStatus();
      expect(status.providers.TWELVE_DATA.status).toBe('QUOTA_EXHAUSTED');
      expect(status.providers.TWELVE_DATA.quotaResetTime).toBeDefined();
      expect(status.pollingActive).toBe(false); // Polling should stop
    });

    it('should reject requests during quota exhaustion cooldown', async () => {
      const quotaError = new Error('You have run out of API credits for the day');

      jest.spyOn(twelveData, 'getQuote').mockRejectedValue(quotaError);

      // Trigger quota exhaustion
      await expect(service.getQuote('EURUSD', 'LIVE')).rejects.toThrow();

      // Clear the mock to prove it's not called again
      jest.clearAllMocks();

      // Second request should fail immediately without calling provider
      await expect(service.getQuote('GBPUSD', 'LIVE')).rejects.toThrow('quota exhausted');
      expect(twelveData.getQuote).not.toHaveBeenCalled();
    });

    it('should calculate correct quota reset time', async () => {
      const quotaError = new Error('run out of API credits');

      jest.spyOn(twelveData, 'getQuote').mockRejectedValue(quotaError);

      await expect(service.getQuote('EURUSD', 'LIVE')).rejects.toThrow();

      const status = service.getProviderStatus();
      const resetTime = new Date(status.providers.TWELVE_DATA.quotaResetTime!);
      
      // Should be set to midnight UTC (or next midnight if already past)
      expect(resetTime.getUTCHours()).toBe(0);
      expect(resetTime.getUTCMinutes()).toBe(0);
      expect(resetTime.getUTCSeconds()).toBe(0);

      // Should be in the future
      expect(resetTime.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('LIVE vs SIMULATED Mode', () => {
    it('should never call provider in SIMULATED mode', async () => {
      jest.spyOn(twelveData, 'getQuote');

      const quote = await service.getQuote('EURUSD', 'SIMULATED');

      expect(twelveData.getQuote).not.toHaveBeenCalled();
      expect(quote.simulated).toBe(true);
    });

    it('should call provider in LIVE mode', async () => {
      const mockQuote = {
        symbol: 'EURUSD',
        close: '1.0850',
        datetime: '2026-10-10T12:00:00Z',
      };

      jest.spyOn(twelveData, 'getQuote').mockResolvedValue(mockQuote);

      const quote = await service.getQuote('EURUSD', 'LIVE');

      expect(twelveData.getQuote).toHaveBeenCalled();
      expect(quote.provider).toBe('TWELVE_DATA');
    });

    it('should never mix LIVE and SIMULATED data', async () => {
      const mockQuote = {
        symbol: 'EURUSD',
        close: '1.0850',
        datetime: '2026-10-10T12:00:00Z',
      };

      jest.spyOn(twelveData, 'getQuote').mockResolvedValue(mockQuote);

      // Get LIVE quote
      const liveQuote = await service.getQuote('EURUSD', 'LIVE');
      expect(liveQuote.provider).toBe('TWELVE_DATA');
      expect(liveQuote.simulated).toBeUndefined();

      // Get SIMULATED quote for same symbol
      const simQuote = await service.getQuote('EURUSD', 'SIMULATED');
      expect(simQuote.simulated).toBe(true);
      expect(simQuote.provider).toBeUndefined();
    });
  });

  describe('Candle Caching', () => {
    it('should cache candles separately from quotes', async () => {
      const mockCandles = [
        {
          timestamp: new Date('2026-10-10T12:00:00Z'),
          open: expect.any(Object),
          high: expect.any(Object),
          low: expect.any(Object),
          close: expect.any(Object),
        },
      ];

      jest.spyOn(twelveData, 'getTimeSeries').mockResolvedValue(mockCandles as any);

      // Fetch candles
      const candles1 = await service.getCandles('EURUSD', '1h', 100, 'LIVE');
      expect(twelveData.getTimeSeries).toHaveBeenCalledTimes(1);

      // Fetch again - should be cached
      const candles2 = await service.getCandles('EURUSD', '1h', 100, 'LIVE');
      expect(twelveData.getTimeSeries).toHaveBeenCalledTimes(1); // Still 1

      expect(candles1).toEqual(candles2);
    });

    it('should cache candles with different keys for different intervals', async () => {
      const mockCandles = [];

      jest.spyOn(twelveData, 'getTimeSeries').mockResolvedValue(mockCandles);

      // Fetch 1h candles
      await service.getCandles('EURUSD', '1h', 100, 'LIVE');
      expect(twelveData.getTimeSeries).toHaveBeenCalledTimes(1);

      // Fetch 4h candles for same symbol - should be separate cache entry
      await service.getCandles('EURUSD', '4h', 100, 'LIVE');
      expect(twelveData.getTimeSeries).toHaveBeenCalledTimes(2);
    });
  });

  describe('Provider Status', () => {
    it('should track provider request count', async () => {
      const mockQuote = {
        symbol: 'EURUSD',
        close: '1.0850',
        datetime: '2026-10-10T12:00:00Z',
      };

      jest.spyOn(twelveData, 'getQuote').mockResolvedValue(mockQuote);

      // Clear cache between calls to force provider requests
      await service.getQuote('EURUSD', 'LIVE');
      service.clearCaches();
      await service.getQuote('GBPUSD', 'LIVE');
      service.clearCaches();
      await service.getQuote('USDJPY', 'LIVE');

      const status = service.getProviderStatus();
      expect(status.providers.TWELVE_DATA.requestCount).toBe(3);
    });

    it('should track cache hits', async () => {
      const mockQuote = {
        symbol: 'EURUSD',
        close: '1.0850',
        datetime: '2026-10-10T12:00:00Z',
      };

      jest.spyOn(twelveData, 'getQuote').mockResolvedValue(mockQuote);

      // First call - miss
      await service.getQuote('EURUSD', 'LIVE');

      // Next 3 calls - hits
      await service.getQuote('EURUSD', 'LIVE');
      await service.getQuote('EURUSD', 'LIVE');
      await service.getQuote('EURUSD', 'LIVE');

      const status = service.getProviderStatus();
      expect(status.providers.TWELVE_DATA.cacheHits).toBe(3);
    });

    it('should report correct cache sizes', async () => {
      const mockQuote = {
        symbol: 'EUR/USD',
        close: '1.0850',
        datetime: '2026-10-10T12:00:00Z',
      };

      jest.spyOn(twelveData, 'getQuote').mockResolvedValue(mockQuote);
      jest.spyOn(twelveData, 'getTimeSeries').mockResolvedValue([]);

      await service.getQuote('EURUSD', 'LIVE');
      await service.getQuote('GBPUSD', 'LIVE');
      await service.getCandles('EURUSD', '1h', 100, 'LIVE');

      const status = service.getProviderStatus();
      expect(status.quoteCacheSize).toBe(2);
      expect(status.candleCacheSize).toBe(1);
    });
  });

  describe('Manual Provider Reset', () => {
    it('should allow manual reset of provider status', async () => {
      const quotaError = new Error('quota exhausted');

      jest.spyOn(twelveData, 'getQuote').mockRejectedValue(quotaError);

      // Trigger quota exhaustion
      await expect(service.getQuote('EURUSD', 'LIVE')).rejects.toThrow();

      let status = service.getProviderStatus();
      expect(status.providers.TWELVE_DATA.status).toBe('QUOTA_EXHAUSTED');

      // Manually reset
      service.resetProviderStatus(ProviderType.TWELVE_DATA);

      status = service.getProviderStatus();
      expect(status.providers.TWELVE_DATA.status).toBe('AVAILABLE');
      expect(status.providers.TWELVE_DATA.quotaResetTime).toBeNull();
    });
  });
});
