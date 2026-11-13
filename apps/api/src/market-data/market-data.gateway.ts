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
import { compactForexSymbol, displayForexSymbol, marketRoomName } from './forex-symbols';
import { ForexCandleUpdate } from './forex-feed.interface';

const socketCorsOrigins = process.env.CORS_ORIGINS
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean) || ['http://localhost:3000'];

interface ClientSubscription {
  userId: string;
  symbols: Set<string>;
}

@WebSocketGateway({
  namespace: '/trading',
  cors: { origin: socketCorsOrigins, credentials: true },
  maxHttpBufferSize: 1e6,
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class MarketDataGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MarketDataGateway.name);
  private readonly clientSubscriptions = new Map<string, ClientSubscription>();
  private readonly symbolSubscribers = new Map<string, Set<string>>();

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
  ): Promise<{ success: boolean; subscribed: string[]; errors?: string[]; restriction?: string | null; connectionState: string }> {
    try {
      const user = await this.wsAuth.authenticateSocket(client);
      const symbols = data.symbols || [];
      if (symbols.length === 0) {
        return { success: false, subscribed: [], errors: ['No symbols provided'], connectionState: this.twelveDataWs.getFeedState() };
      }
      if (symbols.length > 10) {
        return { success: false, subscribed: [], errors: ['Maximum 10 symbols per client'], connectionState: this.twelveDataWs.getFeedState() };
      }

      let clientSub = this.clientSubscriptions.get(client.id);
      if (!clientSub) {
        clientSub = { userId: user.userId, symbols: new Set<string>() };
        this.clientSubscriptions.set(client.id, clientSub);
      }

      const subscribed: string[] = [];
      const errors: string[] = [];

      for (const symbol of symbols) {
        try {
          const compact = compactForexSymbol(symbol);
          clientSub.symbols.add(compact);
          let subscribers = this.symbolSubscribers.get(compact);
          if (!subscribers) {
            subscribers = new Set<string>();
            this.symbolSubscribers.set(compact, subscribers);
          }
          subscribers.add(client.id);
          if (subscribers.size === 1) {
            await this.twelveDataWs.subscribe(compact);
          }
          client.join(marketRoomName(compact));
          subscribed.push(compact);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${symbol}: ${message}`);
        }
      }

      return {
        success: subscribed.length > 0,
        subscribed,
        errors: errors.length > 0 ? errors : undefined,
        restriction: this.twelveDataWs.getRestriction(),
        connectionState: this.twelveDataWs.getFeedState(),
      };
    } catch {
      return { success: false, subscribed: [], errors: ['Authentication required'], connectionState: 'ERROR' };
    }
  }

  @SubscribeMessage('market:unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ): Promise<{ success: boolean; unsubscribed: string[] }> {
    const unsubscribed: string[] = [];
    const clientSub = this.clientSubscriptions.get(client.id);
    if (!clientSub) return { success: true, unsubscribed: [] };

    for (const symbol of data.symbols || []) {
      const compact = compactForexSymbol(symbol);
      clientSub.symbols.delete(compact);
      const subscribers = this.symbolSubscribers.get(compact);
      if (subscribers) {
        subscribers.delete(client.id);
        if (subscribers.size === 0) {
          this.symbolSubscribers.delete(compact);
          await this.twelveDataWs.unsubscribe(compact);
        }
      }
      client.leave(marketRoomName(compact));
      unsubscribed.push(compact);
    }
    return { success: true, unsubscribed };
  }

  @SubscribeMessage('market:unsubscribe:all')
  handleUnsubscribeAll(@ConnectedSocket() client: Socket): { success: boolean } {
    const clientSub = this.clientSubscriptions.get(client.id);
    if (!clientSub) return { success: true };

    for (const symbol of Array.from(clientSub.symbols)) {
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
      client.leave(marketRoomName(symbol));
    }
    this.clientSubscriptions.delete(client.id);
    return { success: true };
  }

  @SubscribeMessage('market:status')
  async handleStatus() {
    const lastHeartbeat = this.twelveDataWs.getLastHeartbeat();
    const lastPriceAt = this.twelveDataWs.getLastPriceAt();
    const now = Date.now();
    
    // Calculate staleness
    let dataFreshness: 'FRESH' | 'RECENT' | 'STALE' | 'NONE' = 'NONE';
    let dataAgeSeconds = 0;
    
    if (lastPriceAt) {
      dataAgeSeconds = Math.floor((now - lastPriceAt.getTime()) / 1000);
      if (dataAgeSeconds < 60) {
        dataFreshness = 'FRESH';
      } else if (dataAgeSeconds < 120) {
        dataFreshness = 'RECENT';
      } else {
        dataFreshness = 'STALE';
      }
    }
    
    return {
      connectionState: this.twelveDataWs.getFeedState(),
      providerState: this.twelveDataWs.getConnectionState(),
      restriction: this.twelveDataWs.getRestriction(),
      lastHeartbeat: lastHeartbeat?.toISOString() || null,
      lastPriceAt: lastPriceAt?.toISOString() || null,
      dataFreshness,
      dataAgeSeconds,
      provider: 'TWELVE_DATA',
      note: 'Twelve Data timestamps are minute-rounded; dataAgeSeconds measures time since last update, not network latency',
    };
  }

  @OnEvent('market.price.update')
  handlePriceUpdate(update: TwelveDataPriceUpdate) {
    const compact = compactForexSymbol(update.symbol);
    this.server.to(marketRoomName(compact)).emit('market:price', {
      symbol: compact,
      displaySymbol: displayForexSymbol(compact),
      price: update.price,
      providerTimestamp: update.providerTimestamp.toISOString(),
      serverReceivedTimestamp: update.serverReceivedTimestamp.toISOString(),
      feedMode: 'WEBSOCKET',
      provider: 'TWELVE_DATA',
    });
  }

  @OnEvent('market.candle.update')
  handleCandleUpdate(update: ForexCandleUpdate) {
    this.server.to(marketRoomName(update.symbol)).emit('market:candle', update);
  }

  @OnEvent('market.websocket.connected')
  handleWebSocketConnected(data: { provider: string; connectedAt: Date }) {
    this.server.emit('market:connection', {
      status: 'CONNECTED',
      provider: data.provider,
      connectedAt: data.connectedAt.toISOString(),
      restriction: this.twelveDataWs.getRestriction(),
    });
  }

  @OnEvent('market.websocket.disconnected')
  handleWebSocketDisconnected(data: { provider: string; disconnectedAt: Date; code: number; reason: string }) {
    this.server.emit('market:connection', {
      status: 'DISCONNECTED',
      provider: data.provider,
      disconnectedAt: data.disconnectedAt.toISOString(),
      code: data.code,
      reason: data.reason,
      restriction: this.twelveDataWs.getRestriction(),
    });
  }

  @OnEvent('market.websocket.restricted')
  handleRestricted(data: { provider: string; restriction: string }) {
    this.server.emit('market:connection', {
      status: 'HISTORICAL_ONLY',
      provider: data.provider,
      restriction: data.restriction,
    });
  }
}
