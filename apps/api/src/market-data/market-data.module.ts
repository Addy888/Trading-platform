import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MarketPriceService } from './market-price.service';
import { SimulatedMarketEngineService } from './simulated-market-engine.service';
import { MarketDataController } from './market-data.controller';
import { MarketDataEngineService } from './market-data-engine.service';
import { InstrumentConfigService } from './instrument-config.service';
import { UnifiedMarketDataService } from './unified-market-data.service';
import { TwelveDataProvider } from './providers/twelvedata/twelve-data.provider';
import { MarketDataManagerService } from './market-data-manager.service';

@Module({
  imports: [ConfigModule],
  controllers: [MarketDataController],
  providers: [
    MarketPriceService,
    SimulatedMarketEngineService,
    MarketDataEngineService,
    InstrumentConfigService,
    UnifiedMarketDataService,
    TwelveDataProvider,
    MarketDataManagerService,
  ],
  exports: [
    MarketPriceService,
    SimulatedMarketEngineService,
    MarketDataEngineService,
    InstrumentConfigService,
    UnifiedMarketDataService,
    TwelveDataProvider,
    MarketDataManagerService,
  ],
})
export class MarketDataModule {
  constructor(
    private readonly marketPrice: MarketPriceService,
    private readonly simulatedEngine: SimulatedMarketEngineService,
  ) {
    // Set simulated market engine in market price service (legacy support)
    this.marketPrice.setSimulatedMarketEngine(this.simulatedEngine);
  }
}
