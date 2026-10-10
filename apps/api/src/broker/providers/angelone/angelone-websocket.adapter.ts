import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket from 'ws';

/**
 * Angel One WebSocket Tick Data
 * Based on official SmartAPI WebSocket documentation
 */
export interface AngelOneTickData {
  mode: number; // 1=LTP, 2=Quote, 3=SnapQuote
  exchangeType: number; // 1=NSE, 2=NFO, 3=BSE, etc.
  token: string; // Instrument token
  sequenceNumber: number;
  exchangeTimestamp: number; // Unix timestamp in milliseconds
  lastTradedPrice?: number;
  lastTradedQuantity?: number;
  averageTradePrice?: number;
  volumeTradeForTheDay?: number;
  totalBuyQuantity?: number;
  totalSellQuantity?: number;
  openPriceOfTheDay?: number;
  highPriceOfTheDay?: number;
  lowPriceOfTheDay?: number;
  closedPrice?: number;
  bidPrice?: number;
  bidQty?: number;
  askPrice?: number;
  askQty?: number;
}

/**
 * Angel One WebSocket Adapter
 * 
 * Connects to Angel One SmartAPI WebSocket for real-time market data.
 * 
 * Official Documentation:
 * - WebSocket URL: wss://smartapisocket.angelone.in/smart-stream
 * - Authentication: Requires feedToken from login response
 * - Protocol: Binary protocol with specific message format
 * - Supported Exchanges: NSE, BSE, NFO, CDS, MCX
 * 
 * IMPORTANT LIMITATIONS:
 * - Angel One provides INDIAN market data only (NSE/BSE/MCX)
 * - Does NOT support forex pairs (EURUSD, GBPUSD, etc.)
 * - Does NOT support crypto (BTCUSD, ETHUSD)
 * - Requires instrument tokens from instrument master file
 * 
 * Architecture:
 * - Auto-reconnect with exponential backoff
 * - Heartbeat/ping-pong for connection health
 * - Validates and normalizes tick data
 * - Emits standardized market events
 */
@Injectable()
export class AngelOneWebSocketAdapter implements OnModuleDestroy {
  private readonly logger = new Logger(AngelOneWebSocketAdapter.name);
  private ws: WebSocket | null = null;
  private feedToken: string | null = null;
  private clientCode: string | null = null;
  private apiKey: string | null = null;
  
  private isConnected = false;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelayMs = 1000;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  private subscribedTokens: Set<string> = new Set();
  private readonly wsUrl = 'wss://smartapisocket.angelone.in/smart-stream';

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Connect to Angel One WebSocket
   * @param feedToken - Feed token from login response
   * @param clientCode - Client code (user ID)
   * @param apiKey - API key
   */
  async connect(feedToken: string, clientCode: string, apiKey: string): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      this.logger.warn('WebSocket already connected or connecting');
      return;
    }

    this.feedToken = feedToken;
    this.clientCode = clientCode;
    this.apiKey = apiKey;
    this.isConnecting = true;

    try {
      await this.establishConnection();
    } catch (error) {
      this.logger.error(`Failed to connect: ${(error as Error).message}`);
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Establish WebSocket connection
   */
  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.logger.log('Connecting to Angel One WebSocket...');

        this.ws = new WebSocket(this.wsUrl, {
          headers: {
            'Authorization': this.feedToken!,
            'x-api-key': this.apiKey!,
            'x-client-code': this.clientCode!,
            'x-feed-token': this.feedToken!,
          },
        });

        this.ws.on('open', () => {
          this.logger.log('✓ Angel One WebSocket connected');
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          this.startHeartbeat();
          this.resubscribeAll();
          
          this.eventEmitter.emit('broker.marketdata.connected', {
            provider: 'ANGELONE',
            timestamp: new Date(),
          });

          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          this.logger.error(`WebSocket error: ${error.message}`);
          this.eventEmitter.emit('broker.marketdata.error', {
            provider: 'ANGELONE',
            error: error.message,
            timestamp: new Date(),
          });
        });

        this.ws.on('close', (code, reason) => {
          this.logger.warn(`WebSocket closed: ${code} - ${reason}`);
          this.handleDisconnection();
        });

        // Timeout if connection takes too long
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket connection timeout'));
            this.ws?.close();
          }
        }, 10000);

      } catch (error) {
        this.logger.error(`Connection establishment failed: ${(error as Error).message}`);
        reject(error);
      }
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(): void {
    this.isConnected = false;
    this.isConnecting = false;
    this.stopHeartbeat();

    this.eventEmitter.emit('broker.marketdata.disconnected', {
      provider: 'ANGELONE',
      timestamp: new Date(),
    });

    // Attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.logger.error('Max reconnect attempts reached. Manual reconnection required.');
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    
    // Exponential backoff with jitter
    const backoffMs = Math.min(
      this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );
    const jitterMs = Math.random() * 1000;
    const delayMs = backoffMs + jitterMs;

    this.logger.log(
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delayMs / 1000)}s`
    );

    this.reconnectTimeout = setTimeout(() => {
      if (this.feedToken && this.clientCode && this.apiKey) {
        this.connect(this.feedToken, this.clientCode, this.apiKey)
          .catch((error) => {
            this.logger.error(`Reconnect failed: ${error.message}`);
          });
      }
    }, delayMs);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Send ping every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.isConnected) {
        try {
          this.ws.ping();
        } catch (error) {
          this.logger.error(`Heartbeat failed: ${(error as Error).message}`);
        }
      }
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle incoming WebSocket message
   * Note: Angel One uses binary protocol
   */
  private handleMessage(data: Buffer): void {
    try {
      // Parse binary message according to Angel One protocol
      // This is a simplified parser - actual implementation would need
      // full binary protocol parsing based on Angel One docs
      
      const tick = this.parseBinaryTick(data);
      if (tick) {
        this.eventEmitter.emit('broker.marketdata.tick', {
          provider: 'ANGELONE',
          tick,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.logger.error(`Failed to parse message: ${(error as Error).message}`);
    }
  }

  /**
   * Parse binary tick data
   * Note: This is a placeholder - actual implementation requires
   * full Angel One binary protocol parsing
   */
  private parseBinaryTick(data: Buffer): AngelOneTickData | null {
    // TODO: Implement full binary protocol parsing
    // Angel One uses a specific binary format documented in their API
    // For now, return null as we don't have the complete protocol spec
    
    this.logger.debug(`Received ${data.length} bytes of market data`);
    return null;
  }

  /**
   * Subscribe to instrument tokens
   * @param tokens - Array of instrument tokens
   * @param mode - 1=LTP, 2=Quote, 3=SnapQuote
   */
  async subscribe(tokens: string[], mode: 1 | 2 | 3 = 2): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket not connected');
    }

    // Build subscription message according to Angel One protocol
    const subscriptionMessage = this.buildSubscriptionMessage(tokens, mode, 'subscribe');
    
    this.ws.send(subscriptionMessage);
    
    tokens.forEach(token => this.subscribedTokens.add(token));
    
    this.logger.log(`Subscribed to ${tokens.length} instruments`);
  }

  /**
   * Unsubscribe from instrument tokens
   */
  async unsubscribe(tokens: string[]): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket not connected');
    }

    const unsubscriptionMessage = this.buildSubscriptionMessage(tokens, 1, 'unsubscribe');
    
    this.ws.send(unsubscriptionMessage);
    
    tokens.forEach(token => this.subscribedTokens.delete(token));
    
    this.logger.log(`Unsubscribed from ${tokens.length} instruments`);
  }

  /**
   * Build subscription/unsubscription message
   * According to Angel One binary protocol
   */
  private buildSubscriptionMessage(
    tokens: string[],
    mode: number,
    action: 'subscribe' | 'unsubscribe'
  ): Buffer {
    // TODO: Implement actual Angel One binary protocol message format
    // This is a placeholder that would need the complete protocol spec
    
    // Angel One uses a JSON message for subscription, not binary
    const message = {
      action: action === 'subscribe' ? 1 : 0,
      params: {
        mode,
        tokenList: tokens.map(token => ({
          exchangeType: 1, // NSE by default
          tokens: [token],
        })),
      },
    };

    return Buffer.from(JSON.stringify(message));
  }

  /**
   * Resubscribe to all previously subscribed instruments after reconnection
   */
  private async resubscribeAll(): Promise<void> {
    if (this.subscribedTokens.size === 0) {
      return;
    }

    const tokens = Array.from(this.subscribedTokens);
    this.logger.log(`Resubscribing to ${tokens.length} instruments`);
    
    try {
      await this.subscribe(tokens);
    } catch (error) {
      this.logger.error(`Resubscription failed: ${(error as Error).message}`);
    }
  }

  /**
   * Disconnect from WebSocket
   */
  async disconnect(): Promise<void> {
    this.logger.log('Disconnecting from Angel One WebSocket...');
    
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.subscribedTokens.clear();
    
    this.logger.log('✓ Disconnected from Angel One WebSocket');
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    connected: boolean;
    connecting: boolean;
    reconnectAttempts: number;
    subscribedCount: number;
  } {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      subscribedCount: this.subscribedTokens.size,
    };
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy() {
    await this.disconnect();
  }
}
