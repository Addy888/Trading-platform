import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TradingGateway } from './trading.gateway';
import { WebSocketAuthService } from './websocket-auth.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * WebSocket Module
 * 
 * Provides real-time WebSocket communication for the trading platform.
 * 
 * Includes:
 * - Trading Gateway (main WebSocket server)
 * - WebSocket Authentication Service
 * - JWT integration for secure connections
 */
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m' as any },
    }),
  ],
  providers: [TradingGateway, WebSocketAuthService],
  exports: [TradingGateway, WebSocketAuthService],
})
export class WebSocketModule {}
