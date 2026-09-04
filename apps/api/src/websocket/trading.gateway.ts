import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { WebSocketAuthService } from './websocket-auth.service';
import {
  SubscribeAccountDto,
  UnsubscribeAccountDto,
  ConnectionReadyEvent,
  MarketPricesEvent,
  AccountUpdateEvent,
  PositionUpdateEvent,
  TradeOpenedEvent,
  TradeClosedEvent,
  ChallengeUpdateEvent,
  AccountStatusEvent,
  SystemErrorEvent,
} from './dto/socket-events.dto';

/**
 * Trading Gateway
 * 
 * WebSocket gateway for real-time trading updates.
 * 
 * SECURITY:
 * - All connections must be authenticated via JWT
 * - Users can only subscribe to their own accounts
 * - Admins can subscribe to admin-only events
 * 
 * ROOMS:
 * - user:{userId} - User-specific room
 * - account:{accountId} - Account-specific room
 * - admins - Admin-only room
 * 
 * EVENTS:
 * Client -> Server:
 * - subscribe:account
 * - unsubscribe:account
 * 
 * Server -> Client:
 * - connection:ready
 * - market:price
 * - account:update
 * - position:update
 * - trade:opened
 * - trade:closed
 * - challenge:update
 * - account:status
 * - system:error
 */
@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/trading',
})
export class TradingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TradingGateway.name);

  constructor(
    private readonly wsAuth: WebSocketAuthService,
  ) {}

  /**
   * Gateway initialized
   */
  afterInit(server: Server) {
    this.logger.log('Trading WebSocket Gateway initialized');
  }

  /**
   * Client connected
   */
  async handleConnection(socket: Socket) {
    try {
      // Authenticate socket connection
      const user = await this.wsAuth.authenticateSocket(socket);

      // Join user-specific room
      const userRoom = `user:${user.userId}`;
      socket.join(userRoom);

      // If admin, join admin room
      if (user.role === 'ADMIN') {
        socket.join('admins');
        this.logger.log(`Admin joined admins room: ${user.email}`);
      }

      // Send connection ready event
      const readyEvent: ConnectionReadyEvent = {
        userId: user.userId,
        role: user.role,
        timestamp: new Date(),
        message: 'Simulated market connection established',
      };
      
      socket.emit('connection:ready', readyEvent);

      this.logger.log(`Client connected: ${socket.id} - ${user.email} (${user.role})`);
    } catch (error) {
      this.logger.error(`Connection authentication failed: ${(error as Error).message}`);
      
      const errorEvent: SystemErrorEvent = {
        message: 'Authentication failed',
        code: 'AUTH_FAILED',
        timestamp: new Date(),
      };
      
      socket.emit('system:error', errorEvent);
      socket.disconnect();
    }
  }

  /**
   * Client disconnected
   */
  handleDisconnect(socket: Socket) {
    const userId = this.wsAuth.getUserId(socket);
    this.logger.log(`Client disconnected: ${socket.id} - User: ${userId || 'unknown'}`);
  }

  /**
   * Subscribe to account updates
   */
  @SubscribeMessage('subscribe:account')
  async handleSubscribeAccount(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: SubscribeAccountDto,
  ) {
    try {
      const userId = this.wsAuth.getUserId(socket);
      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Verify account ownership (unless admin)
      const isAdmin = this.wsAuth.isAdmin(socket);
      if (!isAdmin) {
        const hasAccess = await this.wsAuth.verifyAccountOwnership(
          userId,
          data.accountId,
        );
        
        if (!hasAccess) {
          const errorEvent: SystemErrorEvent = {
            message: 'You do not have permission to access this account',
            code: 'FORBIDDEN',
            timestamp: new Date(),
          };
          socket.emit('system:error', errorEvent);
          return { success: false, error: 'Forbidden' };
        }
      }

      // Join account room
      const accountRoom = `account:${data.accountId}`;
      socket.join(accountRoom);

      this.logger.log(`Socket ${socket.id} subscribed to ${accountRoom}`);

      return { success: true, accountId: data.accountId };
    } catch (error) {
      this.logger.error(`Subscribe account error: ${(error as Error).message}`);
      
      const errorEvent: SystemErrorEvent = {
        message: 'Failed to subscribe to account',
        code: 'SUBSCRIBE_FAILED',
        timestamp: new Date(),
      };
      socket.emit('system:error', errorEvent);
      
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Unsubscribe from account updates
   */
  @SubscribeMessage('unsubscribe:account')
  async handleUnsubscribeAccount(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: UnsubscribeAccountDto,
  ) {
    try {
      const accountRoom = `account:${data.accountId}`;
      socket.leave(accountRoom);

      this.logger.log(`Socket ${socket.id} unsubscribed from ${accountRoom}`);

      return { success: true, accountId: data.accountId };
    } catch (error) {
      this.logger.error(`Unsubscribe account error: ${(error as Error).message}`);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Broadcast market prices to all connected clients
   */
  @OnEvent('market.prices.updated')
  handleMarketPricesUpdate(event: {
    prices: Array<{ symbol: string; price: string }>;
    timestamp: Date;
    source: string;
  }) {
    const priceEvent: MarketPricesEvent = {
      prices: event.prices.map((p) => ({
        symbol: p.symbol,
        price: p.price,
        timestamp: event.timestamp,
        source: event.source,
      })),
      timestamp: event.timestamp,
      source: event.source,
    };

    // Broadcast to all connected clients
    this.server.emit('market:price', priceEvent);
  }

  /**
   * Emit account update to account room
   */
  emitAccountUpdate(accountId: string, data: AccountUpdateEvent) {
    const room = `account:${accountId}`;
    this.server.to(room).emit('account:update', data);
  }

  /**
   * Emit position update to account room
   */
  emitPositionUpdate(accountId: string, data: PositionUpdateEvent) {
    const room = `account:${accountId}`;
    this.server.to(room).emit('position:update', data);
  }

  /**
   * Emit trade opened event
   */
  emitTradeOpened(accountId: string, data: TradeOpenedEvent) {
    const room = `account:${accountId}`;
    this.server.to(room).emit('trade:opened', data);
    
    // Also emit to admin room
    this.server.to('admins').emit('admin:trade:opened', data);
  }

  /**
   * Emit trade closed event
   */
  emitTradeClosed(accountId: string, data: TradeClosedEvent) {
    const room = `account:${accountId}`;
    this.server.to(room).emit('trade:closed', data);
    
    // Also emit to admin room
    this.server.to('admins').emit('admin:trade:closed', data);
  }

  /**
   * Emit challenge update to account room
   */
  emitChallengeUpdate(accountId: string, data: ChallengeUpdateEvent) {
    const room = `account:${accountId}`;
    this.server.to(room).emit('challenge:update', data);
  }

  /**
   * Emit account status change
   */
  emitAccountStatus(accountId: string, data: AccountStatusEvent) {
    const room = `account:${accountId}`;
    this.server.to(room).emit('account:status', data);
    
    // Also emit to admin room
    this.server.to('admins').emit('admin:account:status', data);
  }

  /**
   * Listen to notification.created event and emit to user
   */
  @OnEvent('notification.created')
  handleNotificationCreated(notification: any) {
    try {
      // Emit to user room
      const userRoom = `user:${notification.userId}`;
      this.server.to(userRoom).emit('notification:new', {
        id: notification.id,
        type: notification.type,
        priority: notification.priority,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      });

      this.logger.debug(`Notification emitted to ${userRoom}: ${notification.id}`);
    } catch (error) {
      this.logger.error(
        `Error emitting notification: ${(error as Error).message}`,
      );
    }
  }
}
