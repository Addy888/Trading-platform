import { EventEmitter2 } from '@nestjs/event-emitter';
import { TwelveDataWebSocketService } from './twelve-data-websocket.service';

describe('TwelveDataWebSocketService lifecycle', () => {
  const originalKey = process.env.TWELVE_DATA_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.TWELVE_DATA_API_KEY;
    else process.env.TWELVE_DATA_API_KEY = originalKey;
  });

  it('does not connect when the API key is missing', () => {
    process.env.TWELVE_DATA_API_KEY = '';
    const service = new TwelveDataWebSocketService(new EventEmitter2());
    expect(service.isConfigured()).toBe(false);
    expect(service.getConnectionState()).toBe('DISCONNECTED');
  });

  it('normalizes compact and slashed Forex symbols to the provider format', () => {
    process.env.TWELVE_DATA_API_KEY = 'test-key';
    const service = new TwelveDataWebSocketService(new EventEmitter2());
    expect((service as unknown as { normalizeSymbol(symbol: string): string }).normalizeSymbol('EURUSD')).toBe('EUR/USD');
    expect((service as unknown as { normalizeSymbol(symbol: string): string }).normalizeSymbol('eur/usd')).toBe('EUR/USD');
  });

  it('records subscription-plan restrictions from subscribe-status failures', () => {
    process.env.TWELVE_DATA_API_KEY = 'test-key';
    const service = new TwelveDataWebSocketService(new EventEmitter2());
    (service as unknown as { handleSubscribeStatus(message: unknown): void }).handleSubscribeStatus({
      event: 'subscribe-status',
      status: 'error',
      message: 'This session is not allowed to use WebSocket on the current plan.',
      fails: [{ symbol: 'EUR/USD', message: 'upgrade required' }],
    });
    expect(service.getRestriction()).toContain('current plan');
    expect(service.getConnectionState()).toBe('DISCONNECTED');
  });
});
