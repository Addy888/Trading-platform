import { Module } from '@nestjs/common';
import { MarketPriceService } from './market-price.service';
import { MarketDataController } from './market-data.controller';
import { MarketDataEngineService } from './market-data-engine.service';
import { InstrumentConfigService } from './instrument-config.service';
import { TwelveDataProvider } from './providers/twelve-data/twelve-data.provider';
import { TwelveDataWebSocketService } from './providers/twelve-data/twelve-data-websocket.service';
import { MarketDataManagerService } from './market-data-manager.service';
import { MarketDataGateway } from './market-data.gateway';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebSocketModule],
  controllers: [MarketDataController],
  providers: [
    TwelveDataProvider,
    TwelveDataWebSocketService,
    MarketDataManagerService,
    MarketDataEngineService,
    MarketPriceService,
    InstrumentConfigService,
    MarketDataGateway,
  ],
  exports: [
    MarketPriceService,
    MarketDataEngineService,
    InstrumentConfigService,
    TwelveDataProvider,
    TwelveDataWebSocketService,
    MarketDataManagerService,
  ],
})
export class MarketDataModule {}
