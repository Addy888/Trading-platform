import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import WebSocket from 'ws';

/**
 * Twelve Data Provider Service
 * 
 * Integrates with Twelve Data API for real market data.
 * Official Documentation: https://twelvedata.com/docs
 * 
 * Capabilities:
 * - Latest quote (REST)
 * - Historical time-series/OHLC (REST)
 * - WebSocket streaming (requires paid subscription)
 * 
 * Day 4: Real Market Data Integration
 */

export interface TwelveDataQuote {
  symbol: string;
  name?: string;
  exchange?: string;
  mic_code?: string;
  currency?: string;
  datetime?: string;
  timestamp?: number;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  average_volume?: string;
  is_market_open?: boolean;
  fifty_two_week?: {
    low: string;
    high: string;
    low_change: string;
    high_change: string;
    low_change_percent: string;
    high_change_percent: string;
    range: string;
  };
}

export interface TwelveDataTimeSeriesResponse {
  meta: {
    symbol: string;
    interval: string;
    currency?: string;
    exchange_timezone?: string;
    exchange?: string;
    mic_code?: string;
    type?: string;
  };
  values: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
  }>;
  status: string;
}

export interface TwelveDataCandle {
  timestamp: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume?: number;
}

export enum TwelveDataConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR',
}

@Injectable()
export class TwelveDataProvider implements OnModuleDestroy {
  private readonly logger = new Logger(TwelveDataProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.twelvedata.com';
  private readonly wsUrl = 'wss://ws.twelvedata.com/v1/quotes/price';
  
  // WebSocket connection
  private ws: WebSocket | null = null;
  private wsStatus: TwelveDataConnectionStatus = TwelveDataConnectionStatus.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectBackoffMs = 1000;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastHeartbeat: Date | null = null;
  
  // Subscription management
  private subscribedSymbols: Set<string> = new Set();
  private lastQuoteTime: Map<string, Date> = new Map();
  
  // Quote caching (to respect rate limits)
  private quoteCache: Map<string, { data: TwelveDataQuote; timestamp: number }> = new Map();
  private readonly quoteCacheTTL = 30000; // 30 seconds TTL
  
  // Concurrent request deduplication
  private pendingQuoteRequests: Map<string, Promise<TwelveDataQuote>> = new Map();
  
  // Statistics
  private stats = {
    restRequests: 0,
    restErrors: 0,
    wsMessages: 0,
    wsErrors: 0,
    lastSuccessfulUpdate: null as Date | null,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.apiKey = this.configService.get<string>('TWELVE_DATA_API_KEY', '');
    
    if (!this.apiKey) {
      this.logger.warn('⚠️  TWELVE_DATA_API_KEY not configured. Market data unavailable.');
    } else {
      this.logger.log('✓ Twelve Data provider initialized with caching (TTL: 30s)');
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
    this.quoteCache.clear();
    this.pendingQuoteRequests.clear();
  }

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get provider status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      wsStatus: this.wsStatus,
      subscribedSymbols: Array.from(this.subscribedSymbols),
      lastHeartbeat: this.lastHeartbeat,
      stats: this.stats,
      cacheSize: this.quoteCache.size,
    };
  }

  /**
   * Get latest quote for a symbol (REST API) with caching
   * 
   * Endpoint: GET /quote
   * Documentation: https://twelvedata.com/docs#quote
   * 
   * Caching Strategy:
   * - Cache quotes for 30 seconds to respect rate limits (8 req/min)
   * - Deduplicate concurrent requests for same symbol
   * - Return cached data if fresh enough
   */
  async getQuote(symbol: string): Promise<TwelveDataQuote> {
    if (!this.isConfigured()) {
      throw new Error('Twelve Data API key not configured');
    }

    // Check cache first
    const cached = this.quoteCache.get(symbol);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.quoteCacheTTL) {
      this.stats.cacheHits++;
      this.logger.debug(`Cache HIT for ${symbol} (age: ${Math.round((now - cached.timestamp) / 1000)}s)`);
      return cached.data;
    }

    this.stats.cacheMisses++;

    // Check if there's already a pending request for this symbol
    const pendingRequest = this.pendingQuoteRequests.get(symbol);
    if (pendingRequest) {
      this.logger.debug(`Reusing pending request for ${symbol}`);
      return pendingRequest;
    }

    // Create new request
    const requestPromise = this.fetchQuoteFromAPI(symbol);
    
    // Store pending request to deduplicate concurrent calls
    this.pendingQuoteRequests.set(symbol, requestPromise);
    
    try {
      const data = await requestPromise;
      
      // Cache the result
      this.quoteCache.set(symbol, { data, timestamp: Date.now() });
      
      return data;
    } finally {
      // Remove from pending requests
      this.pendingQuoteRequests.delete(symbol);
    }
  }

  /**
   * Fetch quote from API (internal method)
   */
  private async fetchQuoteFromAPI(symbol: string): Promise<TwelveDataQuote> {
    this.stats.restRequests++;

    try {
      const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Check for API errors
      if (data.status === 'error') {
        throw new Error(data.message || 'Unknown API error');
      }

      // Check for rate limit
      if (data.code === 429) {
        this.logger.warn('⚠️  Rate limit exceeded - please reduce request frequency');
        throw new Error('Rate limit exceeded');
      }

      this.stats.lastSuccessfulUpdate = new Date();
      this.logger.debug(`Fetched fresh quote for ${symbol}: ${data.close}`);
      return data;
    } catch (error) {
      this.stats.restErrors++;
      this.logger.error(`Failed to fetch quote for ${symbol}: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get historical time series data (REST API)
   * 
   * Endpoint: GET /time_series
   * Documentation: https://twelvedata.com/docs#time-series
   * 
   * @param symbol - Symbol to fetch (e.g., 'EUR/USD', 'AAPL', 'BTC/USD')
   * @param interval - Interval (1min, 5min, 15min, 30min, 1h, 4h, 1day, 1week, 1month)
   * @param outputsize - Number of candles to return (default: 30, max: 5000)
   */
  async getTimeSeries(
    symbol: string,
    interval: string = '1h',
    outputsize: number = 100,
  ): Promise<TwelveDataCandle[]> {
    if (!this.isConfigured()) {
      throw new Error('Twelve Data API key not configured');
    }

    this.stats.restRequests++;

    try {
      const url = `${this.baseUrl}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15000), // 15s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: TwelveDataTimeSeriesResponse = await response.json();

      // Check for API errors
      if ((data as any).status === 'error') {
        throw new Error((data as any).message || 'Unknown API error');
      }

      // Check for rate limit
      if ((data as any).code === 429) {
        this.logger.warn('Rate limit exceeded');
        throw new Error('Rate limit exceeded');
      }

      if (!data.values || data.values.length === 0) {
        this.logger.warn(`No time series data for ${symbol}`);
        return [];
      }

      // Normalize candles
      const candles: TwelveDataCandle[] = data.values.map((bar) => ({
        timestamp: new Date(bar.datetime),
        open: new Decimal(bar.open),
        high: new Decimal(bar.high),
        low: new Decimal(bar.low),
        close: new Decimal(bar.close),
        volume: bar.volume ? parseInt(bar.volume, 10) : undefined,
      }));

      // Sort chronologically (oldest first)
      candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      this.stats.lastSuccessfulUpdate = new Date();
      return candles;
    } catch (error) {
      this.stats.restErrors++;
      this.logger.error(`Failed to fetch time series for ${symbol}: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Connect to WebSocket for real-time streaming
   * 
   * NOTE: WebSocket access requires a paid subscription
   * Documentation: https://twelvedata.com/docs#websocket
   */
  async connectWebSocket(): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Twelve Data API key not configured');
    }

    if (this.ws && this.wsStatus === TwelveDataConnectionStatus.CONNECTED) {
      this.logger.log('WebSocket already connected');
      return;
    }

    this.wsStatus = TwelveDataConnectionStatus.CONNECTING;
    this.logger.log('Connecting to Twelve Data WebSocket...');

    try {
      this.ws = new WebSocket(`${this.wsUrl}?apikey=${this.apiKey}`);

      this.ws.on('open', () => {
        this.wsStatus = TwelveDataConnectionStatus.CONNECTED;
        this.reconnectAttempts = 0;
        this.logger.log('✓ Twelve Data WebSocket connected');
        
        this.startHeartbeat();
        this.resubscribeAll();
        
        this.eventEmitter.emit('market.provider.connected', {
          provider: 'TWELVEDATA',
          timestamp: new Date(),
        });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          this.logger.error(`Failed to parse WebSocket message: ${(error as Error).message}`);
          this.stats.wsErrors++;
        }
      });

      this.ws.on('error', (error: Error) => {
        this.logger.error(`WebSocket error: ${error.message}`);
        this.wsStatus = TwelveDataConnectionStatus.ERROR;
        this.stats.wsErrors++;
        
        this.eventEmitter.emit('market.provider.error', {
          provider: 'TWELVEDATA',
          error: error.message,
          timestamp: new Date(),
        });
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.logger.warn(`WebSocket closed: ${code} - ${reason.toString()}`);
        this.wsStatus = TwelveDataConnectionStatus.DISCONNECTED;
        this.stopHeartbeat();
        
        this.eventEmitter.emit('market.provider.disconnected', {
          provider: 'TWELVEDATA',
          code,
          reason: reason.toString(),
          timestamp: new Date(),
        });
        
        // Attempt reconnection
        this.scheduleReconnect();
      });
    } catch (error) {
      this.wsStatus = TwelveDataConnectionStatus.ERROR;
      this.logger.error(`Failed to connect WebSocket: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Disconnect WebSocket
   */
  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.wsStatus = TwelveDataConnectionStatus.DISCONNECTED;
    this.subscribedSymbols.clear();
    this.logger.log('Twelve Data WebSocket disconnected');
  }

  /**
   * Subscribe to a symbol for real-time updates
   */
  async subscribe(symbol: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Twelve Data API key not configured');
    }

    if (this.wsStatus !== TwelveDataConnectionStatus.CONNECTED) {
      // If not connected, store subscription for later
      this.subscribedSymbols.add(symbol);
      
      // Try to connect if not connecting/reconnecting
      if (this.wsStatus === TwelveDataConnectionStatus.DISCONNECTED) {
        await this.connectWebSocket();
      }
      
      return;
    }

    if (this.subscribedSymbols.has(symbol)) {
      this.logger.debug(`Already subscribed to ${symbol}`);
      return;
    }

    const subscribeMessage = {
      action: 'subscribe',
      params: {
        symbols: symbol,
      },
    };

    this.ws?.send(JSON.stringify(subscribeMessage));
    this.subscribedSymbols.add(symbol);
    this.logger.log(`Subscribed to ${symbol}`);
  }

  /**
   * Unsubscribe from a symbol
   */
  async unsubscribe(symbol: string): Promise<void> {
    if (!this.subscribedSymbols.has(symbol)) {
      return;
    }

    if (this.ws && this.wsStatus === TwelveDataConnectionStatus.CONNECTED) {
      const unsubscribeMessage = {
        action: 'unsubscribe',
        params: {
          symbols: symbol,
        },
      };

      this.ws.send(JSON.stringify(unsubscribeMessage));
    }

    this.subscribedSymbols.delete(symbol);
    this.lastQuoteTime.delete(symbol);
    this.logger.log(`Unsubscribed from ${symbol}`);
  }

  /**
   * Resubscribe to all symbols after reconnection
   */
  private resubscribeAll(): void {
    if (this.subscribedSymbols.size === 0) {
      return;
    }

    const symbols = Array.from(this.subscribedSymbols);
    this.logger.log(`Resubscribing to ${symbols.length} symbols`);

    const subscribeMessage = {
      action: 'subscribe',
      params: {
        symbols: symbols.join(','),
      },
    };

    this.ws?.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleWebSocketMessage(message: any): void {
    this.stats.wsMessages++;

    // Handle heartbeat/ping
    if (message.event === 'heartbeat' || message.type === 'ping') {
      this.lastHeartbeat = new Date();
      
      // Respond with pong if required
      if (message.type === 'ping') {
        this.ws?.send(JSON.stringify({ type: 'pong' }));
      }
      return;
    }

    // Handle subscription confirmation
    if (message.event === 'subscribe-status') {
      this.logger.log(`Subscription status: ${JSON.stringify(message)}`);
      return;
    }

    // Handle price update
    if (message.event === 'price' || message.type === 'quote') {
      this.handlePriceUpdate(message);
      return;
    }

    // Handle errors
    if (message.status === 'error' || message.event === 'error') {
      this.logger.error(`WebSocket error: ${message.message || JSON.stringify(message)}`);
      this.stats.wsErrors++;
      return;
    }

    this.logger.debug(`Unknown WebSocket message: ${JSON.stringify(message)}`);
  }

  /**
   * Handle price update from WebSocket
   */
  private handlePriceUpdate(message: any): void {
    try {
      const symbol = message.symbol;
      if (!symbol) {
        return;
      }

      const price = message.price;
      if (!price || !Number.isFinite(parseFloat(price))) {
        this.logger.warn(`Invalid price for ${symbol}: ${price}`);
        return;
      }

      this.lastQuoteTime.set(symbol, new Date());
      this.stats.lastSuccessfulUpdate = new Date();

      // Emit price update event
      this.eventEmitter.emit('market.provider.tick', {
        provider: 'TWELVEDATA',
        symbol,
        price: new Decimal(price),
        timestamp: message.timestamp ? new Date(message.timestamp * 1000) : new Date(),
        receivedAt: new Date(),
      });
    } catch (error) {
      this.logger.error(`Failed to handle price update: ${(error as Error).message}`);
      this.stats.wsErrors++;
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (!this.lastHeartbeat) {
        return;
      }

      const timeSinceHeartbeat = Date.now() - this.lastHeartbeat.getTime();
      
      // Consider connection dead if no heartbeat for 60s
      if (timeSinceHeartbeat > 60000) {
        this.logger.warn('No heartbeat received, connection may be dead');
        this.ws?.close();
      }
    }, 30000); // Check every 30s
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.lastHeartbeat = null;
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      this.wsStatus = TwelveDataConnectionStatus.ERROR;
      return;
    }

    this.wsStatus = TwelveDataConnectionStatus.RECONNECTING;
    this.reconnectAttempts++;

    const backoffMs = Math.min(
      this.reconnectBackoffMs * Math.pow(2, this.reconnectAttempts),
      30000, // Max 30s
    );

    // Add jitter (±25%)
    const jitter = backoffMs * 0.25 * (Math.random() - 0.5);
    const delayMs = Math.floor(backoffMs + jitter);

    this.logger.log(`Reconnecting in ${delayMs}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connectWebSocket().catch((error) => {
        this.logger.error(`Reconnection failed: ${error.message}`);
      });
    }, delayMs);
  }
}
