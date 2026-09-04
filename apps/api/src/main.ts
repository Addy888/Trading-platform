import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Set global API prefix
  app.setGlobalPrefix('api');
  
  // Enable CORS for frontend AND WebSocket
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  
  // Get services for initialization
  const { MarketPriceService } = await import('./market-data/market-price.service');
  const { SimulatedMarketEngineService } = await import('./market-data/simulated-market-engine.service');
  const { TradingGateway } = await import('./websocket/trading.gateway');
  const { RealtimeService } = await import('./realtime/realtime.service');
  
  const marketPriceService = app.get(MarketPriceService);
  const simulatedMarketEngine = app.get(SimulatedMarketEngineService);
  const tradingGateway = app.get(TradingGateway);
  const realtimeService = app.get(RealtimeService);
  
  // Wire up circular dependencies
  marketPriceService.setSimulatedMarketEngine(simulatedMarketEngine);
  realtimeService.setTradingGateway(tradingGateway);
  
  await app.listen(3001);
  console.log('🚀 Backend running on http://localhost:3001');
  console.log('🔌 WebSocket server running on ws://localhost:3001/trading');
  console.log('📈 Simulated market engine enabled');
}

bootstrap();
