import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { TradingRulesModule } from './trading-rules/trading-rules.module';
import { RuleSetsModule } from './rule-sets/rule-sets.module';
import { ChallengePlansModule } from './challenge-plans/challenge-plans.module';
import { OrdersModule } from './orders/orders.module';
import { TradingAccountsModule } from './trading-accounts/trading-accounts.module';
import { MarketDataModule } from './market-data/market-data.module';
import { RuleEvaluatorModule } from './rule-evaluator/rule-evaluator.module';
import { TradingEngineModule } from './trading-engine/trading-engine.module';
import { AccountSnapshotsModule } from './account-snapshots/account-snapshots.module';
import { ChallengeProgressModule } from './challenge-progress/challenge-progress.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { WebSocketModule } from './websocket/websocket.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';
import { EmailModule } from './email/email.module';
import { KycModule } from './kyc/kyc.module';
import { PayoutsModule } from './payouts/payouts.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AdminModule,
    TradingRulesModule,
    RuleSetsModule,
    ChallengePlansModule,
    OrdersModule,
    TradingAccountsModule,
    MarketDataModule,
    RuleEvaluatorModule,
    TradingEngineModule,
    AccountSnapshotsModule,
    ChallengeProgressModule,
    AnalyticsModule,
    DashboardModule,
    WebSocketModule,
    RealtimeModule,
    NotificationsModule,
    NotificationPreferencesModule,
    EmailModule,
    KycModule,
    PayoutsModule,
    SettingsModule,
  ],
})
export class AppModule {}
