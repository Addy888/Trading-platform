import { Module } from '@nestjs/common';
import { TradingEngineService } from './trading-engine.service';
import { TradingEngineController } from './trading-engine.controller';
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
  controllers: [TradingEngineController, AdminTradingController],
  providers: [TradingEngineService],
  exports: [TradingEngineService],
})
export class TradingEngineModule {}
