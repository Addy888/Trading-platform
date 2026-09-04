import { Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { ChallengeProgressModule } from '../challenge-progress/challenge-progress.module';

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
 */
@Module({
  imports: [
    PrismaModule,
    MarketDataModule,
    ChallengeProgressModule,
  ],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
