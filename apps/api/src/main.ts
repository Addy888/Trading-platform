import { getBackendEnvFilePath, loadBackendEnvironment } from './config/env-loader';

loadBackendEnvironment();

async function bootstrap() {
  const [{ NestFactory }, { ValidationPipe }, { AppModule }, { OandaProvider }] = await Promise.all([
    import('@nestjs/core'),
    import('@nestjs/common'),
    import('./app.module'),
    import('./market-data/providers/oanda/oanda.provider'),
  ]);
  const app = await NestFactory.create(AppModule, { rawBody: true });
  
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
  
  const { TradingGateway } = await import('./websocket/trading.gateway');
  const { RealtimeService } = await import('./realtime/realtime.service');
  const tradingGateway = app.get(TradingGateway);
  const realtimeService = app.get(RealtimeService);
  
  realtimeService.setTradingGateway(tradingGateway);
  
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
  console.log(`🔌 WebSocket server running on ws://localhost:${port}/trading`);
  const oandaConfiguration = app.get(OandaProvider).getConfigurationStatus();
  console.log(
    `📈 OANDA market data: tokenConfigured=${oandaConfiguration.configured}, ` +
    `accountPricingConfigured=${oandaConfiguration.accountSpecificPricingAvailable}, ` +
    `environment=${oandaConfiguration.environment}, endpoint=${oandaConfiguration.apiBaseUrl}, ` +
    `backendEnvFile=${getBackendEnvFilePath()}`,
  );
  if (!oandaConfiguration.configured) {
    console.warn(`OANDA configuration missing: ${oandaConfiguration.missingVariables.join(', ')}`);
  }
  console.log(`🔒 CORS enabled for: ${corsOrigins.join(', ')}`);
  console.log(`🛡️  Rate limiting enabled (${process.env.RATE_LIMIT_MAX || 100} req/${process.env.RATE_LIMIT_TTL || 60}s)`);
}

bootstrap();
