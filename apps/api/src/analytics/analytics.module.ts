import { Module } from '@nestjs/common';
import { PerformanceAnalyticsService } from './performance-analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
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
  providers: [PerformanceAnalyticsService, AdminAnalyticsService],
  controllers: [AnalyticsController, AdminAnalyticsController],
  exports: [PerformanceAnalyticsService, AdminAnalyticsService],
})
export class AnalyticsModule {}
