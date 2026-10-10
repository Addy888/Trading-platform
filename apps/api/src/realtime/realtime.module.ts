import { Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { ChallengeProgressModule } from '../challenge-progress/challenge-progress.module';
import { TradingEngineModule } from '../trading-engine/trading-engine.module';

/**
 * Realtime Module
 * 
 * Handles real-time updates triggered by market price changes.
 * 
 * Responsibilities:
 * - Listen to market price updates
 * - Calculate affected accounts
 * - Recalculate unrealized PnL and equity
 * - Trigger challenge progress updates
 * 
 * Note: Risk evaluation is NOT performed on market ticks to avoid excessive DB writes.
 */
@Module({
  imports: [
    PrismaModule,
    MarketDataModule,
    TradingEngineModule,
    RiskEngineModule,
    ChallengeProgressModule,
  ],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
