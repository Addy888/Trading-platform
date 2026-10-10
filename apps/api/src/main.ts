import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Set global API prefix
  app.setGlobalPrefix('api');
  
  // Enable CORS with environment-based origins
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim()) || ['http://localhost:3000'];
  app.enableCors({
    origin: corsOrigins,
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
  
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
  console.log(`🔌 WebSocket server running on ws://localhost:${port}/trading`);
  console.log('📈 Simulated market engine enabled');
  console.log(`🔒 CORS enabled for: ${corsOrigins.join(', ')}`);
  console.log(`🛡️  Rate limiting enabled (${process.env.RATE_LIMIT_MAX || 100} req/${process.env.RATE_LIMIT_TTL || 60}s)`);
}

bootstrap();
