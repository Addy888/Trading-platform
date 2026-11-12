import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { WebSocketAuthService } from '../websocket/websocket-auth.service';
import { TwelveDataWebSocketService, TwelveDataPriceUpdate } from './providers/twelve-data/twelve-data-websocket.service';

interface ClientSubscription {
  userId: string;
  symbols: Set<string>;
}

@WebSocketGateway({ namespace: '/trading', cors: { origin: '*' } })
export class MarketDataGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MarketDataGateway.name);
  private readonly clientSubscriptions = new Map<string, ClientSubscription>();
  private readonly symbolSubscribers = new Map<string, Set<string>>(); // symbol -> Set<clientId>

  constructor(
    private readonly twelveDataWs: TwelveDataWebSocketService,
    private readonly wsAuth: WebSocketAuthService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.handleUnsubscribeAll(client);
  }

  @SubscribeMessage('market:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ): Promise<{ success: boolean; subscribed: string[]; errors?: string[] }> {
    // Authenticate the client - authenticateSocket throws if invalid
    try {
      const user = await this.wsAuth.authenticateSocket(client);
      
      const symbols = data.symbols || [];
      
      if (symbols.length === 0) {
        return { success: false, subscribed: [], errors: ['No symbols provided'] };
      }

      // Limit subscriptions per client
      const maxSymbolsPerClient = 10;
      if (symbols.length > maxSymbolsPerClient) {
        return {
          success: false,
          subscribed: [],
          errors: [`Maximum ${maxSymbolsPerClient} symbols per client`],
        };
      }

      // Get or create client subscription
      let clientSub = this.clientSubscriptions.get(client.id);
      if (!clientSub) {
        clientSub = {
          userId: user.userId,
          symbols: new Set<string>(),
        };
        this.clientSubscriptions.set(client.id, clientSub);
      }

      const subscribed: string[] = [];
      const errors: string[] = [];

      for (const symbol of symbols) {
        try {
          const normalizedSymbol = symbol.trim().toUpperCase();
          
          // Add to client's subscriptions
          clientSub.symbols.add(normalizedSymbol);

          // Track which clients are subscribed to this symbol
          let subscribers = this.symbolSubscribers.get(normalizedSymbol);
          if (!subscribers) {
            subscribers = new Set<string>();
            this.symbolSubscribers.set(normalizedSymbol, subscribers);
          }
          subscribers.add(client.id);

          // Subscribe to Twelve Data WebSocket if this is the first client for this symbol
          if (subscribers.size === 1) {
            await this.twelveDataWs.subscribe(normalizedSymbol);
          }

          subscribed.push(normalizedSymbol);
          this.logger.debug(`Client ${client.id} subscribed to ${normalizedSymbol}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${symbol}: ${message}`);
          this.logger.error(`Failed to subscribe ${client.id} to ${symbol}`, message);
        }
      }

      // Join Socket.IO room for each symbol
      for (const symbol of subscribed) {
        client.join(`market:${symbol}`);
      }

      return {
        success: subscribed.length > 0,
        subscribed,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return { success: false, subscribed: [], errors: ['Authentication required'] };
    }
  }

  @SubscribeMessage('market:unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ): Promise<{ success: boolean; unsubscribed: string[] }> {
    const symbols = data.symbols || [];
    const unsubscribed: string[] = [];

    const clientSub = this.clientSubscriptions.get(client.id);
    if (!clientSub) {
      return { success: true, unsubscribed: [] };
    }

    for (const symbol of symbols) {
      const normalizedSymbol = symbol.trim().toUpperCase();
      
      // Remove from client's subscriptions
      clientSub.symbols.delete(normalizedSymbol);

      // Remove client from symbol's subscribers
      const subscribers = this.symbolSubscribers.get(normalizedSymbol);
      if (subscribers) {
        subscribers.delete(client.id);

        // Unsubscribe from Twelve Data if no more clients need this symbol
        if (subscribers.size === 0) {
          this.symbolSubscribers.delete(normalizedSymbol);
          await this.twelveDataWs.unsubscribe(normalizedSymbol);
        }
      }

      // Leave Socket.IO room
      client.leave(`market:${normalizedSymbol}`);
      unsubscribed.push(normalizedSymbol);
    }

    return { success: true, unsubscribed };
  }

  @SubscribeMessage('market:unsubscribe:all')
  handleUnsubscribeAll(@ConnectedSocket() client: Socket): { success: boolean } {
    const clientSub = this.clientSubscriptions.get(client.id);
    if (!clientSub) {
      return { success: true };
    }

    // Unsubscribe from all symbols
    const symbols = Array.from(clientSub.symbols);
    for (const symbol of symbols) {
      const subscribers = this.symbolSubscribers.get(symbol);
      if (subscribers) {
        subscribers.delete(client.id);

        if (subscribers.size === 0) {
          this.symbolSubscribers.delete(symbol);
          this.twelveDataWs.unsubscribe(symbol).catch((error) => {
            this.logger.error(`Failed to unsubscribe from ${symbol}`, error);
          });
        }
      }

      client.leave(`market:${symbol}`);
    }

    this.clientSubscriptions.delete(client.id);
    return { success: true };
  }

  @SubscribeMessage('market:status')
  async handleStatus(@ConnectedSocket() client: Socket): Promise<{
    connectionState: string;
    subscriptions: string[];
    lastHeartbeat: string | null;
    authenticated: boolean;
  }> {
    const clientSub = this.clientSubscriptions.get(client.id);
    const connectionState = this.twelveDataWs.getConnectionState();
    const lastHeartbeat = this.twelveDataWs.getLastHeartbeat();
    const authenticated = !!this.wsAuth.getUserId(client);

    return {
      connectionState,
      subscriptions: clientSub ? Array.from(clientSub.symbols) : [],
      lastHeartbeat: lastHeartbeat?.toISOString() || null,
      authenticated,
    };
  }

  /**
   * Listen for price updates from Twelve Data WebSocket and broadcast to subscribed clients
   */
  @OnEvent('market.price.update')
  handlePriceUpdate(update: TwelveDataPriceUpdate) {
    const { symbol, price, providerTimestamp, serverReceivedTimestamp } = update;

    // Broadcast to all clients subscribed to this symbol
    this.server.to(`market:${symbol}`).emit('market:price', {
      symbol,
      price,
      providerTimestamp: providerTimestamp.toISOString(),
      serverReceivedTimestamp: serverReceivedTimestamp.toISOString(),
      feedMode: 'WEBSOCKET',
      provider: 'TWELVE_DATA',
    });

    // Log broadcast
    const subscriberCount = this.symbolSubscribers.get(symbol)?.size || 0;
    this.logger.debug(`📡 Broadcasted ${symbol} price to ${subscriberCount} clients`);
  }

  @OnEvent('market.websocket.connected')
  handleWebSocketConnected(data: { provider: string; connectedAt: Date }) {
    this.server.emit('market:connection', {
      status: 'CONNECTED',
      provider: data.provider,
      connectedAt: data.connectedAt.toISOString(),
    });
    this.logger.log('Broadcasting WebSocket connected status to all clients');
  }

  @OnEvent('market.websocket.disconnected')
  handleWebSocketDisconnected(data: { provider: string; disconnectedAt: Date; code: number; reason: string }) {
    this.server.emit('market:connection', {
      status: 'DISCONNECTED',
      provider: data.provider,
      disconnectedAt: data.disconnectedAt.toISOString(),
      code: data.code,
      reason: data.reason,
    });
    this.logger.log('Broadcasting WebSocket disconnected status to all clients');
  }
}
