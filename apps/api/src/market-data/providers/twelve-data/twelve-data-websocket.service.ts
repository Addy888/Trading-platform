import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import WebSocket from 'ws';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface TwelveDataPriceUpdate {
  symbol: string;
  price: number;
  providerTimestamp: Date;
  serverReceivedTimestamp: Date;
}

type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
type SubscriptionStatus = 'PENDING' | 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'FAILED';

interface SubscriptionState {
  symbol: string;
  status: SubscriptionStatus;
  subscribedAt: Date | null;
  lastUpdate: Date | null;
}

interface TwelveDataMessage {
  event: string;
  symbol?: string;
  price?: number | string;
  timestamp?: number;
  status?: string;
  message?: string;
}

@Injectable()
export class TwelveDataWebSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TwelveDataWebSocketService.name);
  private readonly apiKey = (process.env.TWELVE_DATA_API_KEY || '').trim();
  private readonly wsUrl = 'wss://ws.twelvedata.com/v1/quotes/price';
  
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'DISCONNECTED';
  private subscriptions = new Map<string, SubscriptionState>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastHeartbeat: Date | null = null;
  private isManualDisconnect = false;
  private connectionGeneration = 0; // Track connection identity
  private cancelledGenerations = new Set<number>(); // Track cancelled connections

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async onModuleInit() {
    if (this.isConfigured()) {
      this.logger.log('Twelve Data WebSocket service initialized');
      // Don't auto-connect - wait for first subscription
    } else {
      this.logger.warn('Twelve Data WebSocket disabled: TWELVE_DATA_API_KEY not configured');
    }
  }

  async onModuleDestroy() {
    this.isManualDisconnect = true;
    this.disconnect();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getSubscriptions(): Map<string, SubscriptionState> {
    return new Map(this.subscriptions);
  }

  getLastHeartbeat(): Date | null {
    return this.lastHeartbeat;
  }

  /**
   * Subscribe to real-time price updates for a symbol
   */
  async subscribe(symbol: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Twelve Data WebSocket not configured');
    }

    const normalizedSymbol = this.normalizeSymbol(symbol);
    
    // Check if already subscribed or pending
    const existing = this.subscriptions.get(normalizedSymbol);
    if (existing && (existing.status === 'SUBSCRIBED' || existing.status === 'PENDING')) {
      this.logger.debug(`Already subscribed to ${normalizedSymbol}`);
      return;
    }

    // Mark as pending
    this.subscriptions.set(normalizedSymbol, {
      symbol: normalizedSymbol,
      status: 'PENDING',
      subscribedAt: null,
      lastUpdate: null,
    });

    // Connect if not connected
    if (this.connectionState === 'DISCONNECTED') {
      await this.connect();
    }

    // Send subscribe message if connected
    if (this.connectionState === 'CONNECTED' && this.ws) {
      this.sendSubscribe(normalizedSymbol);
    }
  }

  /**
   * Unsubscribe from symbol updates
   */
  async unsubscribe(symbol: string): Promise<void> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const subscription = this.subscriptions.get(normalizedSymbol);
    
    if (!subscription || subscription.status === 'UNSUBSCRIBED') {
      return;
    }

    // Send unsubscribe only if connected
    if (this.connectionState === 'CONNECTED' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe(normalizedSymbol);
    }

    // Remove subscription
    this.subscriptions.delete(normalizedSymbol);
    this.logger.debug(`Unsubscribed from ${normalizedSymbol}, remaining: ${this.subscriptions.size}`);

    // Disconnect if no more subscriptions
    if (this.subscriptions.size === 0) {
      this.logger.log('No more subscriptions, disconnecting from provider');
      this.disconnect();
    }
  }

  /**
   * Unsubscribe from all symbols
   */
  async unsubscribeAll(): Promise<void> {
    if (this.connectionState === 'CONNECTED' && this.ws) {
      this.ws.send(JSON.stringify({ action: 'reset' }));
    }
    this.subscriptions.clear();
    this.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.connectionState === 'CONNECTING' || this.connectionState === 'CONNECTED') {
      return;
    }

    this.connectionState = 'CONNECTING';
    this.connectionGeneration++; // Increment generation for this connection
    const thisGeneration = this.connectionGeneration;
    this.logger.log(`Connecting to Twelve Data WebSocket (gen ${thisGeneration})...`);

    try {
      const url = `${this.wsUrl}?apikey=${this.apiKey}`;
      this.ws = new WebSocket(url);
      
      const currentWs = this.ws; // Capture reference to detect stale callbacks

      // ✅ CRITICAL: Attach error listener IMMEDIATELY to prevent unhandled errors
      currentWs.on('error', (error: Error) => {
        // Only handle if this is still the active connection AND not cancelled
        if (this.ws === currentWs && !this.cancelledGenerations.has(thisGeneration)) {
          this.handleError(error);
        } else {
          // Suppress errors for cancelled or stale connections
          const sanitized = error.message.replace(/apikey=[^&\s]*/gi, 'apikey=***');
          this.logger.debug(`Suppressed error for gen ${thisGeneration}: ${sanitized}`);
        }
      });

      currentWs.on('open', () => {
        // Check if this connection was cancelled before it opened
        if (this.cancelledGenerations.has(thisGeneration)) {
          this.logger.log(`Connection gen ${thisGeneration} opened but was cancelled, closing now`);
          // Now it's OPEN, so we can safely close it
          try {
            currentWs.close();
          } catch (err) {
            this.logger.debug('Error closing cancelled connection:', (err as Error).message);
          }
          return;
        }
        
        // Only handle if this is still the active connection
        if (this.ws === currentWs) {
          this.handleOpen();
        }
      });
      
      currentWs.on('message', (data: WebSocket.Data) => {
        // Only handle if this is still the active connection AND not cancelled
        if (this.ws === currentWs && !this.cancelledGenerations.has(thisGeneration)) {
          this.handleMessage(data);
        }
      });
      
      currentWs.on('close', (code: number, reason: Buffer) => {
        // Always handle close to clean up, even if cancelled
        if (this.ws === currentWs) {
          this.handleClose(code, reason);
        }
        // Clean up cancelled generation tracking
        this.cancelledGenerations.delete(thisGeneration);
      });
      
      currentWs.on('ping', () => {
        // Only handle if this is still the active connection AND not cancelled
        if (this.ws === currentWs && !this.cancelledGenerations.has(thisGeneration)) {
          this.handlePing();
        }
      });

    } catch (error) {
      this.logger.error('Failed to create WebSocket connection', (error as Error).message);
      this.connectionState = 'ERROR';
      this.ws = null;
      this.cancelledGenerations.delete(thisGeneration);
      this.scheduleReconnect();
    }
  }

  private disconnect(): void {
    this.isManualDisconnect = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.ws) {
      const currentWs = this.ws;
      const currentGen = this.connectionGeneration;
      
      // Clear reference immediately to prevent reuse
      this.ws = null;
      
      // Check the socket state
      if (currentWs.readyState === WebSocket.CONNECTING) {
        // ✅ CRITICAL FIX: Do NOT call close() or terminate() on CONNECTING socket
        // Mark this generation as cancelled so its handlers ignore events
        this.cancelledGenerations.add(currentGen);
        this.logger.log(`Connection gen ${currentGen} is CONNECTING, marked as cancelled (will close when opened)`);
        
        // The socket will eventually open or error, and our handlers will close it safely
        // No need to do anything else here - let the connection lifecycle complete naturally
      } else if (currentWs.readyState === WebSocket.OPEN) {
        // Socket is OPEN, safe to close normally
        try {
          currentWs.removeAllListeners();
          currentWs.close();
          this.logger.debug(`Closed OPEN socket gen ${currentGen}`);
        } catch (error) {
          this.logger.debug('Error closing OPEN socket:', (error as Error).message);
        }
      } else if (currentWs.readyState === WebSocket.CLOSING) {
        // Already closing, just remove listeners
        currentWs.removeAllListeners();
        this.logger.debug(`Socket gen ${currentGen} already CLOSING`);
      } else {
        // CLOSED state, just remove listeners
        currentWs.removeAllListeners();
        this.logger.debug(`Socket gen ${currentGen} already CLOSED`);
      }
    }

    this.connectionState = 'DISCONNECTED';
    this.logger.log('Disconnected from Twelve Data WebSocket');
  }

  private handleOpen(): void {
    this.connectionState = 'CONNECTED';
    this.reconnectAttempts = 0;
    this.isManualDisconnect = false;
    this.logger.log('✅ Connected to Twelve Data WebSocket');

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring();

    // Subscribe to all pending symbols
    for (const [symbol, subscription] of this.subscriptions.entries()) {
      if (subscription.status === 'PENDING') {
        this.sendSubscribe(symbol);
      }
    }

    // Emit connection event
    this.eventEmitter.emit('market.websocket.connected', {
      provider: 'TWELVE_DATA',
      connectedAt: new Date(),
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: TwelveDataMessage = JSON.parse(data.toString());

      // Handle different message types
      if (message.event === 'subscribe-status') {
        this.handleSubscribeStatus(message);
      } else if (message.event === 'price') {
        this.handlePriceUpdate(message);
      } else if (message.event === 'heartbeat') {
        this.handleHeartbeatMessage();
      } else {
        this.logger.debug(`Unknown message event: ${message.event}`, message);
      }
    } catch (error) {
      this.logger.error('Failed to parse WebSocket message', error);
    }
  }

  private handleSubscribeStatus(message: TwelveDataMessage): void {
    const symbol = message.symbol;
    const status = message.status;

    if (!symbol) return;

    const subscription = this.subscriptions.get(symbol);
    if (!subscription) return;

    if (status === 'ok') {
      subscription.status = 'SUBSCRIBED';
      subscription.subscribedAt = new Date();
      this.logger.log(`✅ Subscribed to ${symbol}`);
    } else {
      subscription.status = 'FAILED';
      this.logger.warn(`❌ Subscription failed for ${symbol}: ${message.message || 'Unknown error'}`);
    }
  }

  private handlePriceUpdate(message: TwelveDataMessage): void {
    const symbol = message.symbol;
    const price = message.price;
    const timestamp = message.timestamp;

    if (!symbol || price === undefined || !timestamp) {
      this.logger.warn('Incomplete price update', message);
      return;
    }

    const subscription = this.subscriptions.get(symbol);
    if (!subscription) {
      this.logger.warn(`Received price for unsubscribed symbol: ${symbol}`);
      return;
    }

    // Parse price
    const parsedPrice = typeof price === 'number' ? price : parseFloat(String(price));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      this.logger.warn(`Invalid price for ${symbol}: ${price}`);
      return;
    }

    // Parse timestamp (Twelve Data sends Unix timestamp in seconds)
    const providerTimestamp = new Date(timestamp * 1000);
    const serverReceivedTimestamp = new Date();

    // Update subscription
    subscription.lastUpdate = serverReceivedTimestamp;

    // Create update object
    const update: TwelveDataPriceUpdate = {
      symbol,
      price: parsedPrice,
      providerTimestamp,
      serverReceivedTimestamp,
    };

    // Log the update
    const latency = serverReceivedTimestamp.getTime() - providerTimestamp.getTime();
    this.logger.debug(`📊 ${symbol}: $${parsedPrice.toFixed(5)} (latency: ${latency}ms)`);

    // Emit event for other services to consume
    this.eventEmitter.emit('market.price.update', update);
  }

  private handleHeartbeatMessage(): void {
    this.lastHeartbeat = new Date();
    this.logger.debug('💓 Heartbeat received');
  }

  private handlePing(): void {
    // WebSocket library automatically sends pong
    this.lastHeartbeat = new Date();
  }

  private handleError(error: Error): void {
    // Sanitize error message - never log API keys
    const sanitizedMessage = error.message.replace(/apikey=[^&\s]*/gi, 'apikey=***');
    this.logger.error('WebSocket error:', sanitizedMessage);
    
    // Don't update state if already disconnecting/disconnected
    if (this.connectionState !== 'DISCONNECTED') {
      this.connectionState = 'ERROR';
    }
    
    // Prevent unhandled error crashes - error will be handled by close event
  }

  private handleClose(code: number, reason: Buffer): void {
    const reasonText = reason.toString() || 'No reason provided';
    this.logger.warn(`WebSocket closed: code=${code}, reason=${reasonText}`);

    // Clear reference and timers
    this.ws = null;
    this.connectionState = 'DISCONNECTED';

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Emit disconnection event
    this.eventEmitter.emit('market.websocket.disconnected', {
      provider: 'TWELVE_DATA',
      disconnectedAt: new Date(),
      code,
      reason: reasonText,
    });

    // Mark all subscriptions as pending for reconnect
    for (const subscription of this.subscriptions.values()) {
      if (subscription.status === 'SUBSCRIBED') {
        subscription.status = 'PENDING';
        subscription.subscribedAt = null;
      }
    }

    // Reconnect only if:
    // 1. Not a manual disconnect
    // 2. We have active subscriptions
    // 3. Not already scheduling a reconnect
    if (!this.isManualDisconnect && this.subscriptions.size > 0 && !this.reconnectTimer) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isManualDisconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      this.connectionState = 'ERROR';
      return;
    }

    this.reconnectAttempts++;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, up to 60s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
    
    this.logger.log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeatMonitoring(): void {
    // Check for stale connection every 30 seconds
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const lastBeat = this.lastHeartbeat?.getTime() || 0;
      const timeSinceLastBeat = now - lastBeat;

      // If no heartbeat for 60 seconds, consider connection dead
      if (this.lastHeartbeat && timeSinceLastBeat > 60000) {
        this.logger.warn('No heartbeat received for 60s, reconnecting...');
        this.ws?.close();
      }
    }, 30000);
  }

  private sendSubscribe(symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn(`Cannot subscribe to ${symbol}: WebSocket not connected`);
      return;
    }

    const message = {
      action: 'subscribe',
      params: {
        symbols: symbol,
      },
    };

    this.ws.send(JSON.stringify(message));
    this.logger.debug(`Sent subscribe request for ${symbol}`);
  }

  private sendUnsubscribe(symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      action: 'unsubscribe',
      params: {
        symbols: symbol,
      },
    };

    this.ws.send(JSON.stringify(message));
    this.logger.debug(`Sent unsubscribe request for ${symbol}`);
  }

  private normalizeSymbol(symbol: string): string {
    // Convert common formats to Twelve Data format
    // EURUSD -> EUR/USD
    const symbolMap: Record<string, string> = {
      'EURUSD': 'EUR/USD',
      'GBPUSD': 'GBP/USD',
      'USDJPY': 'USD/JPY',
      'AUDUSD': 'AUD/USD',
      'USDCAD': 'USD/CAD',
      'BTCUSD': 'BTC/USD',
      'ETHUSD': 'ETH/USD',
      'XAUUSD': 'XAU/USD',
      'XAGUSD': 'XAG/USD',
    };

    const compact = symbol.trim().toUpperCase().replace(/[\/_]/g, '');
    return symbolMap[compact] || symbol.trim();
  }
}
