import { Module } from '@nestjs/common';
import { MarketPriceService } from './market-price.service';
import { MarketDataController } from './market-data.controller';
import { MarketDataEngineService } from './market-data-engine.service';
import { InstrumentConfigService } from './instrument-config.service';
import { OandaProvider } from './providers/oanda/oanda.provider';
import { MarketDataManagerService } from './market-data-manager.service';

@Module({
  controllers: [MarketDataController],
  providers: [
    OandaProvider,
    MarketDataManagerService,
    MarketDataEngineService,
    MarketPriceService,
    InstrumentConfigService,
  ],
  exports: [
    MarketPriceService,
    MarketDataEngineService,
    InstrumentConfigService,
    OandaProvider,
    MarketDataManagerService,
  ],
})
export class MarketDataModule {}
