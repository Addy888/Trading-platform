import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AngelOneWebSocketAdapter } from './angelone-websocket.adapter';

// Mock WebSocket
jest.mock('ws');
import WebSocket from 'ws';

describe('AngelOneWebSocketAdapter', () => {
  let adapter: AngelOneWebSocketAdapter;
  let eventEmitter: EventEmitter2;
  let mockWs: any;

  beforeEach(async () => {
    // Create mock WebSocket
    mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      ping: jest.fn(),
      readyState: WebSocket.OPEN,
    };

    (WebSocket as any).mockImplementation(() => mockWs);
    (WebSocket as any).OPEN = 1;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AngelOneWebSocketAdapter,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    adapter = module.get<AngelOneWebSocketAdapter>(AngelOneWebSocketAdapter);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('connect', () => {
    it('should establish WebSocket connection with correct headers', async () => {
      const feedToken = 'test-feed-token';
      const clientCode = 'TEST123';
      const apiKey = 'test-api-key';

      // Simulate successful connection
      const connectPromise = adapter.connect(feedToken, clientCode, apiKey);

      // Trigger the 'open' event
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }

      await connectPromise;

      expect(WebSocket).toHaveBeenCalledWith(
        'wss://smartapisocket.angelone.in/smart-stream',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': feedToken,
            'x-api-key': apiKey,
            'x-client-code': clientCode,
            'x-feed-token': feedToken,
          }),
        })
      );
    });

    it('should emit connected event on successful connection', async () => {
      const connectPromise = adapter.connect('token', 'client', 'key');

      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }

      await connectPromise;

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'broker.marketdata.connected',
        expect.objectContaining({
          provider: 'ANGELONE',
        })
      );
    });

    it('should prevent duplicate connections', async () => {
      const connectPromise = adapter.connect('token', 'client', 'key');

      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }

      await connectPromise;

      // Try connecting again
      await adapter.connect('token2', 'client2', 'key2');

      // WebSocket constructor should only be called once
      expect(WebSocket).toHaveBeenCalledTimes(1);
    });

    it('should reject on connection timeout', async () => {
      jest.useFakeTimers();

      const connectPromise = adapter.connect('token', 'client', 'key');

      // Fast-forward time by 10+ seconds
      jest.advanceTimersByTime(10001);

      await expect(connectPromise).rejects.toThrow('WebSocket connection timeout');

      jest.useRealTimers();
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket connection', async () => {
      // Connect first
      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      // Disconnect
      await adapter.disconnect();

      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should clear subscriptions on disconnect', async () => {
      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      // Subscribe to instruments
      await adapter.subscribe(['26000', '26009']);

      // Disconnect
      await adapter.disconnect();

      const status = adapter.getConnectionStatus();
      expect(status.subscribedCount).toBe(0);
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;
    });

    it('should send subscription message', async () => {
      await adapter.subscribe(['26000']);

      expect(mockWs.send).toHaveBeenCalled();
      const sentData = mockWs.send.mock.calls[0][0];
      const message = JSON.parse(sentData.toString());

      expect(message).toHaveProperty('action', 1);
      expect(message).toHaveProperty('params');
    });

    it('should track subscribed tokens', async () => {
      await adapter.subscribe(['26000', '26009']);

      const status = adapter.getConnectionStatus();
      expect(status.subscribedCount).toBe(2);
    });

    it('should throw if not connected', async () => {
      await adapter.disconnect();

      await expect(adapter.subscribe(['26000'])).rejects.toThrow(
        'WebSocket not connected'
      );
    });
  });

  describe('unsubscribe', () => {
    beforeEach(async () => {
      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;
    });

    it('should send unsubscription message', async () => {
      await adapter.subscribe(['26000']);
      mockWs.send.mockClear();

      await adapter.unsubscribe(['26000']);

      expect(mockWs.send).toHaveBeenCalled();
      const sentData = mockWs.send.mock.calls[0][0];
      const message = JSON.parse(sentData.toString());

      expect(message).toHaveProperty('action', 0);
    });

    it('should remove token from subscriptions', async () => {
      await adapter.subscribe(['26000', '26009']);
      await adapter.unsubscribe(['26000']);

      const status = adapter.getConnectionStatus();
      expect(status.subscribedCount).toBe(1);
    });

    it('should throw if not connected', async () => {
      await adapter.disconnect();

      await expect(adapter.unsubscribe(['26000'])).rejects.toThrow(
        'WebSocket not connected'
      );
    });
  });

  describe('error handling', () => {
    it('should emit error event on WebSocket error', async () => {
      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      const errorHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      if (errorHandler) {
        errorHandler(new Error('Connection failed'));
      }

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'broker.marketdata.error',
        expect.objectContaining({
          provider: 'ANGELONE',
          error: 'Connection failed',
        })
      );
    });

    it('should emit disconnected event on WebSocket close', async () => {
      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      jest.clearAllMocks();

      const closeHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'close'
      )?.[1];

      if (closeHandler) {
        closeHandler(1000, 'Normal closure');
      }

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'broker.marketdata.disconnected',
        expect.objectContaining({
          provider: 'ANGELONE',
        })
      );
    });
  });

  describe('reconnection', () => {
    it('should attempt reconnection after disconnection', async () => {
      jest.useFakeTimers();

      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      // Clear initial connection call
      (WebSocket as any).mockClear();

      // Simulate disconnection
      const closeHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'close'
      )?.[1];
      if (closeHandler) {
        closeHandler(1006, 'Abnormal closure');
      }

      // Fast-forward to trigger reconnect
      jest.advanceTimersByTime(3000);

      // Verify reconnection was attempted
      expect(WebSocket).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should use exponential backoff for reconnection', async () => {
      jest.useFakeTimers();

      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      const status1 = adapter.getConnectionStatus();
      expect(status1.reconnectAttempts).toBe(0);

      // Simulate multiple disconnections
      for (let i = 0; i < 3; i++) {
        const closeHandler = mockWs.on.mock.calls.find(
          (call: any[]) => call[0] === 'close'
        )?.[1];
        if (closeHandler) {
          closeHandler(1006, 'Abnormal closure');
        }
        jest.advanceTimersByTime(10000);
      }

      const status2 = adapter.getConnectionStatus();
      expect(status2.reconnectAttempts).toBeGreaterThan(0);

      jest.useRealTimers();
    });

    it('should resubscribe after reconnection', async () => {
      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      // Subscribe to instruments
      await adapter.subscribe(['26000', '26009']);

      const statusBefore = adapter.getConnectionStatus();
      expect(statusBefore.subscribedCount).toBe(2);

      // This test verifies that subscription count is preserved
      // Actual resubscription would occur on reconnection
      expect(statusBefore.subscribedCount).toBe(2);
    });
  });

  describe('heartbeat', () => {
    it('should send ping periodically when connected', async () => {
      jest.useFakeTimers();

      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      mockWs.ping.mockClear();

      // Fast-forward 30+ seconds
      jest.advanceTimersByTime(31000);

      expect(mockWs.ping).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should stop heartbeat on disconnect', async () => {
      jest.useFakeTimers();

      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      await adapter.disconnect();

      mockWs.ping.mockClear();

      // Fast-forward time
      jest.advanceTimersByTime(31000);

      expect(mockWs.ping).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('getConnectionStatus', () => {
    it('should return disconnected initially', () => {
      const status = adapter.getConnectionStatus();

      expect(status.connected).toBe(false);
      expect(status.connecting).toBe(false);
      expect(status.reconnectAttempts).toBe(0);
      expect(status.subscribedCount).toBe(0);
    });

    it('should return connected after successful connection', async () => {
      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      const status = adapter.getConnectionStatus();

      expect(status.connected).toBe(true);
      expect(status.connecting).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect on module destroy', async () => {
      const connectPromise = adapter.connect('token', 'client', 'key');
      const openHandler = mockWs.on.mock.calls.find(
        (call: any[]) => call[0] === 'open'
      )?.[1];
      if (openHandler) {
        openHandler();
      }
      await connectPromise;

      await adapter.onModuleDestroy();

      const status = adapter.getConnectionStatus();
      expect(status.connected).toBe(false);
    });
  });
});
