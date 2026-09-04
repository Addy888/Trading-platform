import { Module } from '@nestjs/common';
import { PerformanceAnalyticsService } from './performance-analytics.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { ChallengeProgressModule } from '../challenge-progress/challenge-progress.module';
import { AccountSnapshotsModule } from '../account-snapshots/account-snapshots.module';

@Module({
  imports: [
    PrismaModule,
    MarketDataModule,
    ChallengeProgressModule,
    AccountSnapshotsModule,
  ],
  providers: [PerformanceAnalyticsService],
  controllers: [AnalyticsController],
  exports: [PerformanceAnalyticsService],
})
export class AnalyticsModule {}
