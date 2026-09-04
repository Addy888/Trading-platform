import { Module } from '@nestjs/common';
import { MarketPriceService } from './market-price.service';
import { SimulatedMarketEngineService } from './simulated-market-engine.service';
import { MarketDataController } from './market-data.controller';

@Module({
  controllers: [MarketDataController],
  providers: [MarketPriceService, SimulatedMarketEngineService],
  exports: [MarketPriceService, SimulatedMarketEngineService],
})
export class MarketDataModule {}
