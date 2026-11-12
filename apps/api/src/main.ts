import { getBackendEnvFilePath, loadBackendEnvironment } from './config/env-loader';

loadBackendEnvironment();

async function bootstrap() {
  const [{ NestFactory }, { ValidationPipe }, { AppModule }, { TwelveDataProvider }] = await Promise.all([
    import('@nestjs/core'), import('@nestjs/common'), import('./app.module'), import('./market-data/providers/twelve-data/twelve-data.provider'),
  ]);
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim()) || ['http://localhost:3000'];
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const { TradingGateway } = await import('./websocket/trading.gateway');
  const { RealtimeService } = await import('./realtime/realtime.service');
  app.get(RealtimeService).setTradingGateway(app.get(TradingGateway));
  const port = process.env.PORT || 3001;
  await app.listen(port);
  const configuration = app.get(TwelveDataProvider).getConfigurationStatus();
  console.log(`Backend running on http://localhost:${port}`);
  console.log(`WebSocket server running on ws://localhost:${port}/trading`);
  console.log(`Twelve Data: keyConfigured=${configuration.configured}, streamingMode=${configuration.streamingMode}, endpoint=${configuration.apiBaseUrl}, backendEnvFile=${getBackendEnvFilePath()}`);
  if (!configuration.configured) console.warn(`Twelve Data configuration missing: ${configuration.missingVariables.join(', ')}`);
  console.log(`CORS enabled for: ${corsOrigins.join(', ')}`);
  console.log(`Rate limiting enabled (${process.env.RATE_LIMIT_MAX || 100} req/${process.env.RATE_LIMIT_TTL || 60}s)`);
}

bootstrap();
