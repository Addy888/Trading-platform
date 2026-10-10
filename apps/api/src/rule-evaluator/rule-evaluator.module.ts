import { Module } from '@nestjs/common';
import { RuleEvaluatorService } from './rule-evaluator.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountSnapshotsModule } from '../account-snapshots/account-snapshots.module';
import { DailyLossModule } from '../daily-loss/daily-loss.module';
import { MaxDrawdownModule } from '../max-drawdown/max-drawdown.module';

@Module({
  imports: [PrismaModule, AccountSnapshotsModule, DailyLossModule, MaxDrawdownModule],
  providers: [RuleEvaluatorService],
  exports: [RuleEvaluatorService],
})
export class RuleEvaluatorModule {}
