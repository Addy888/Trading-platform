import { Module } from '@nestjs/common';
import { MarketPriceService } from './market-price.service';
import { SimulatedMarketEngineService } from './simulated-market-engine.service';
import { MarketDataController } from './market-data.controller';
import { MarketDataEngineService } from './market-data-engine.service';
import { InstrumentConfigService } from './instrument-config.service';

@Module({
  controllers: [MarketDataController],
  providers: [
    MarketPriceService,
    SimulatedMarketEngineService,
    MarketDataEngineService,
    InstrumentConfigService,
  ],
  exports: [
    MarketPriceService,
    SimulatedMarketEngineService,
    MarketDataEngineService,
    InstrumentConfigService,
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
