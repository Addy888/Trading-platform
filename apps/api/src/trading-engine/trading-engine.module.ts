import { Module } from '@nestjs/common';
import { TradingEngineService } from './trading-engine.service';
import { TradingEngineV2Service } from './trading-engine-v2.service';
import { MarginService } from './margin.service';
import { SlTpMonitorService } from './sl-tp-monitor.service';
import { TradingEngineController } from './trading-engine.controller';
import { TradingEngineV2Controller } from './trading-engine-v2.controller';
import { AdminTradingController } from './admin-trading.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { RuleEvaluatorModule } from '../rule-evaluator/rule-evaluator.module';
import { AccountSnapshotsModule } from '../account-snapshots/account-snapshots.module';

@Module({
  imports: [
    PrismaModule,
    MarketDataModule,
    RuleEvaluatorModule,
    AccountSnapshotsModule,
  ],
  controllers: [
    TradingEngineController,
    TradingEngineV2Controller,
    AdminTradingController,
  ],
  providers: [
    TradingEngineService,
    TradingEngineV2Service,
    MarginService,
    SlTpMonitorService,
  ],
  exports: [
    TradingEngineService,
    TradingEngineV2Service,
    MarginService,
    SlTpMonitorService,
  ],
})
export class TradingEngineModule {}
