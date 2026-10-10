import { Module } from '@nestjs/common';
import { RiskCalculationService } from './risk-calculation.service';
import { RiskEvaluationService } from './risk-evaluation.service';
import { RiskEventsService } from './risk-events.service';
import { RiskWarningService } from './risk-warning.service';
import { ConsistencyService } from './consistency.service';
import { AggregateExposureService } from './aggregate-exposure.service';
import { MinTradingDaysService } from './min-trading-days.service';
import { InactivityService } from './inactivity.service';
import { InactivitySchedulerService } from './inactivity-scheduler.service';
import { InactivityEventsService } from './inactivity-events.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DailyLossModule } from '../daily-loss/daily-loss.module';
import { MaxDrawdownModule } from '../max-drawdown/max-drawdown.module';
import { AccountSnapshotsModule } from '../account-snapshots/account-snapshots.module';

@Module({
  imports: [
    PrismaModule,
    DailyLossModule,
    MaxDrawdownModule,
    AccountSnapshotsModule,
  ],
  providers: [
    RiskCalculationService,
    RiskEvaluationService,
    RiskEventsService,
    RiskWarningService,
    ConsistencyService,
    AggregateExposureService,
    MinTradingDaysService,
    InactivityService,
    InactivitySchedulerService,
    InactivityEventsService,
  ],
  exports: [
    RiskCalculationService,
    RiskEvaluationService,
    RiskEventsService,
    RiskWarningService,
    ConsistencyService,
    AggregateExposureService,
    MinTradingDaysService,
    InactivityService,
    InactivitySchedulerService,
    InactivityEventsService,
  ],
})
export class RiskEngineModule {}
