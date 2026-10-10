import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnifiedMarketDataService } from './unified-market-data.service';
import { MarketDataSource, MarketConnectionStatus } from './dto/normalized-tick.dto';
import Decimal from 'decimal.js';

describe('UnifiedMarketDataService', () => {
  let service: UnifiedMarketDataService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedMarketDataService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UnifiedMarketDataService>(UnifiedMarketDataService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should initialize with SIMULATED as default source', () => {
      expect(service.getActiveSource()).toBe(MarketDataSource.SIMULATED);
    });
  });

  describe('handleSimulatedTick', () => {
    it('should normalize and cache simulated tick', () => {
      const event = {
        ticks: [
          {
            symbol: 'EURUSD',
            last: new Decimal('1.0850'),
            bid: new Decimal('1.08495'),
            ask: new Decimal('1.08505'),
            spread: new Decimal('0.0001'),
            timestamp: new Date(),
          },
        ],
        timestamp: new Date(),
        source: 'SIMULATED',
      };

      service.handleSimulatedTick(event);

      const quote = service.getQuote('EURUSD', MarketDataSource.SIMULATED);
      expect(quote.available).toBe(true);
      expect(quote.tick?.symbol).toBe('EURUSD');
      expect(quote.tick?.source).toBe(MarketDataSource.SIMULATED);
      expect(quote.tick?.lastTradedPrice).toEqual(new Decimal('1.0850'));
    });

    it('should ignore non-SIMULATED events', () => {
      const event = {
        ticks: [{ symbol: 'TEST', last: new Decimal('100'), timestamp: new Date() }],
        timestamp: new Date(),
        source: 'OTHER',
      };

      service.handleSimulatedTick(event);

      const quote = service.getQuote('TEST');
      expect(quote.available).toBe(false);
    });

    it('should handle multiple ticks in one event', () => {
      const event = {
        ticks: [
          {
            symbol: 'EURUSD',
            last: new Decimal('1.0850'),
            bid: new Decimal('1.08495'),
            ask: new Decimal('1.08505'),
            spread: new Decimal('0.0001'),
            timestamp: new Date(),
          },
          {
            symbol: 'GBPUSD',
            last: new Decimal('1.2650'),
            bid: new Decimal('1.26495'),
            ask: new Decimal('1.26505'),
            spread: new Decimal('0.0001'),
            timestamp: new Date(),
          },
        ],
        timestamp: new Date(),
        source: 'SIMULATED',
      };

      service.handleSimulatedTick(event);

      const eurQuote = service.getQuote('EURUSD', MarketDataSource.SIMULATED);
      const gbpQuote = service.getQuote('GBPUSD', MarketDataSource.SIMULATED);

      expect(eurQuote.available).toBe(true);
      expect(gbpQuote.available).toBe(true);
    });
  });

  describe('handleBrokerTick', () => {
    it('should normalize and cache Angel One tick', () => {
      const event = {
        provider: 'ANGELONE',
        tick: {
          token: '26000',
          exchangeType: 1,
          lastTradedPrice: 2800.50,
          bidPrice: 2800.45,
          askPrice: 2800.55,
          openPriceOfTheDay: 2795.00,
          highPriceOfTheDay: 2805.00,
          lowPriceOfTheDay: 2790.00,
          closedPrice: 2798.00,
          volumeTradeForTheDay: 1500000,
        },
        timestamp: new Date(),
      };

      service.handleBrokerTick(event);

      const allQuotes = service.getAllQuotes(MarketDataSource.ANGELONE_LIVE);
      expect(allQuotes.length).toBeGreaterThan(0);
    });

    it('should ignore non-ANGELONE providers', () => {
      const event = {
        provider: 'OTHER_BROKER',
        tick: {
          token: '12345',
          lastTradedPrice: 100,
        },
        timestamp: new Date(),
      };

      service.handleBrokerTick(event);

      const quotes = service.getAllQuotes(MarketDataSource.ANGELONE_LIVE);
      expect(quotes.length).toBe(0);
    });

    it('should reject tick with missing token', () => {
      const event = {
        provider: 'ANGELONE',
        tick: {
          exchangeType: 1,
          lastTradedPrice: 2800.50,
        },
        timestamp: new Date(),
      };

      // Should not throw, should log error
      service.handleBrokerTick(event);

      const quotes = service.getAllQuotes(MarketDataSource.ANGELONE_LIVE);
      expect(quotes.length).toBe(0);
    });

    it('should reject tick with negative price', () => {
      const event = {
        provider: 'ANGELONE',
        tick: {
          token: '26000',
          exchangeType: 1,
          lastTradedPrice: -100, // Invalid
        },
        timestamp: new Date(),
      };

      service.handleBrokerTick(event);

      const quotes = service.getAllQuotes(MarketDataSource.ANGELONE_LIVE);
      expect(quotes.length).toBe(0);
    });

    it('should reject tick with NaN price', () => {
      const event = {
        provider: 'ANGELONE',
        tick: {
          token: '26000',
          exchangeType: 1,
          lastTradedPrice: NaN, // Invalid
        },
        timestamp: new Date(),
      };

      service.handleBrokerTick(event);

      const quotes = service.getAllQuotes(MarketDataSource.ANGELONE_LIVE);
      expect(quotes.length).toBe(0);
    });

    it('should reject tick with Infinity price', () => {
      const event = {
        provider: 'ANGELONE',
        tick: {
          token: '26000',
          exchangeType: 1,
          lastTradedPrice: Infinity, // Invalid
        },
        timestamp: new Date(),
      };

      service.handleBrokerTick(event);

      const quotes = service.getAllQuotes(MarketDataSource.ANGELONE_LIVE);
      expect(quotes.length).toBe(0);
    });

    it('should handle tick with optional fields missing', () => {
      const event = {
        provider: 'ANGELONE',
        tick: {
          token: '26000',
          exchangeType: 1,
          lastTradedPrice: 2800.50,
          // Other fields omitted
        },
        timestamp: new Date(),
      };

      service.handleBrokerTick(event);

      const allQuotes = service.getAllQuotes(MarketDataSource.ANGELONE_LIVE);
      expect(allQuotes.length).toBeGreaterThan(0);
      expect(allQuotes[0].lastTradedPrice).toEqual(new Decimal('2800.50'));
    });
  });

  describe('getQuote', () => {
    beforeEach(() => {
      // Seed cache with test data
      const event = {
        ticks: [
          {
            symbol: 'EURUSD',
            last: new Decimal('1.0850'),
            bid: new Decimal('1.08495'),
            ask: new Decimal('1.08505'),
            spread: new Decimal('0.0001'),
            timestamp: new Date(),
          },
        ],
        timestamp: new Date(),
        source: 'SIMULATED',
      };
      service.handleSimulatedTick(event);
    });

    it('should return quote for available symbol', () => {
      const quote = service.getQuote('EURUSD', MarketDataSource.SIMULATED);

      expect(quote.available).toBe(true);
      expect(quote.symbol).toBe('EURUSD');
      expect(quote.tick?.symbol).toBe('EURUSD');
    });

    it('should return unavailable for unknown symbol', () => {
      const quote = service.getQuote('UNKNOWN', MarketDataSource.SIMULATED);

      expect(quote.available).toBe(false);
      expect(quote.reason).toBe('Instrument not found in cache');
    });

    it('should return unavailable if source mismatch', () => {
      const quote = service.getQuote('EURUSD', MarketDataSource.ANGELONE_LIVE);

      expect(quote.available).toBe(false);
      expect(quote.reason).toContain('only available in SIMULATED mode');
    });

    it('should use active source when preferredSource not specified', () => {
      service.setActiveSource(MarketDataSource.SIMULATED);
      const quote = service.getQuote('EURUSD');

      expect(quote.available).toBe(true);
      expect(quote.source).toBe(MarketDataSource.SIMULATED);
    });
  });

  describe('getAllQuotes', () => {
    beforeEach(() => {
      // Seed with SIMULATED data
      const simulatedEvent = {
        ticks: [
          {
            symbol: 'EURUSD',
            last: new Decimal('1.0850'),
            timestamp: new Date(),
          },
          {
            symbol: 'GBPUSD',
            last: new Decimal('1.2650'),
            timestamp: new Date(),
          },
        ],
        timestamp: new Date(),
        source: 'SIMULATED',
      };
      service.handleSimulatedTick(simulatedEvent);
    });

    it('should return all quotes for specified source', () => {
      const quotes = service.getAllQuotes(MarketDataSource.SIMULATED);

      expect(quotes.length).toBe(2);
      expect(quotes.map(q => q.symbol)).toContain('EURUSD');
      expect(quotes.map(q => q.symbol)).toContain('GBPUSD');
    });

    it('should return empty array for source with no data', () => {
      const quotes = service.getAllQuotes(MarketDataSource.ANGELONE_LIVE);

      expect(quotes.length).toBe(0);
    });

    it('should use active source when not specified', () => {
      service.setActiveSource(MarketDataSource.SIMULATED);
      const quotes = service.getAllQuotes();

      expect(quotes.length).toBe(2);
    });
  });

  describe('staleness detection', () => {
    it('should mark old data as stale', () => {
      // Seed with old data
      const oldTimestamp = new Date(Date.now() - 20000); // 20 seconds ago
      const event = {
        ticks: [
          {
            symbol: 'EURUSD',
            last: new Decimal('1.0850'),
            timestamp: oldTimestamp,
          },
        ],
        timestamp: oldTimestamp,
        source: 'SIMULATED',
      };

      service.handleSimulatedTick(event);

      const quote = service.getQuote('EURUSD', MarketDataSource.SIMULATED);

      // Should be unavailable due to staleness
      expect(quote.available).toBe(false);
      expect(quote.reason).toContain('stale');
    });

    it('should not mark fresh data as stale', () => {
      const event = {
        ticks: [
          {
            symbol: 'EURUSD',
            last: new Decimal('1.0850'),
            timestamp: new Date(), // Fresh
          },
        ],
        timestamp: new Date(),
        source: 'SIMULATED',
      };

      service.handleSimulatedTick(event);

      const quote = service.getQuote('EURUSD', MarketDataSource.SIMULATED);

      expect(quote.available).toBe(true);
      expect(quote.tick?.isStale).toBe(false);
    });
  });

  describe('isFreshEnoughForTrading', () => {
    it('should return true for fresh available data', () => {
      const event = {
        ticks: [
          {
            symbol: 'EURUSD',
            last: new Decimal('1.0850'),
            timestamp: new Date(),
          },
        ],
        timestamp: new Date(),
        source: 'SIMULATED',
      };

      service.handleSimulatedTick(event);

      expect(service.isFreshEnoughForTrading('EURUSD')).toBe(true);
    });

    it('should return false for unavailable symbol', () => {
      expect(service.isFreshEnoughForTrading('UNKNOWN')).toBe(false);
    });

    it('should return false for stale data', () => {
      const oldTimestamp = new Date(Date.now() - 20000);
      const event = {
        ticks: [
          {
            symbol: 'EURUSD',
            last: new Decimal('1.0850'),
            timestamp: oldTimestamp,
          },
        ],
        timestamp: oldTimestamp,
        source: 'SIMULATED',
      };

      service.handleSimulatedTick(event);

      expect(service.isFreshEnoughForTrading('EURUSD')).toBe(false);
    });
  });

  describe('setActiveSource', () => {
    it('should change active source', () => {
      expect(service.getActiveSource()).toBe(MarketDataSource.SIMULATED);

      service.setActiveSource(MarketDataSource.ANGELONE_LIVE);

      expect(service.getActiveSource()).toBe(MarketDataSource.ANGELONE_LIVE);
    });

    it('should emit source changed event', () => {
      service.setActiveSource(MarketDataSource.ANGELONE_LIVE);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'market.source.changed',
        expect.objectContaining({
          newSource: MarketDataSource.ANGELONE_LIVE,
        })
      );
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = service.getStatus();

      expect(status.source).toBe(MarketDataSource.SIMULATED);
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('subscribedInstruments');
      expect(status).toHaveProperty('supportedExchanges');
    });

    it('should include supported exchanges for SIMULATED', () => {
      service.setActiveSource(MarketDataSource.SIMULATED);
      const status = service.getStatus();

      expect(status.supportedExchanges).toContain('SIMULATED');
    });

    it('should include Indian exchanges for ANGELONE_LIVE', () => {
      service.setActiveSource(MarketDataSource.ANGELONE_LIVE);
      const status = service.getStatus();

      expect(status.supportedExchanges).toContain('NSE');
      expect(status.supportedExchanges).toContain('BSE');
    });
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const health = service.getHealth();

      expect(health).toHaveProperty('overall');
      expect(health).toHaveProperty('sources');
      expect(health).toHaveProperty('timestamp');
      expect(['HEALTHY', 'DEGRADED', 'DOWN']).toContain(health.overall);
    });

    it('should track statistics per source', () => {
      const event = {
        ticks: [
          {
            symbol: 'EURUSD',
            last: new Decimal('1.0850'),
            timestamp: new Date(),
          },
        ],
        timestamp: new Date(),
        source: 'SIMULATED',
      };

      service.handleSimulatedTick(event);

      const health = service.getHealth();

      expect(health.sources[MarketDataSource.SIMULATED]).toBeDefined();
      expect(health.sources[MarketDataSource.SIMULATED]?.tickCount).toBeGreaterThan(0);
    });
  });

  describe('connection events', () => {
    it('should handle broker connected event', () => {
      service.handleBrokerConnected({
        provider: 'ANGELONE',
        timestamp: new Date(),
      });

      const status = service.getStatus();
      // Status should reflect connection (when active source is ANGELONE_LIVE)
      expect(status).toBeDefined();
    });

    it('should handle broker disconnected event', () => {
      service.handleBrokerDisconnected({
        provider: 'ANGELONE',
        timestamp: new Date(),
      });

      // Should not crash
      expect(service).toBeDefined();
    });

    it('should handle broker error event', () => {
      service.handleBrokerError({
        provider: 'ANGELONE',
        error: 'Connection timeout',
        timestamp: new Date(),
      });

      // Should not crash
      expect(service).toBeDefined();
    });
  });
});
