import { Module } from '@nestjs/common';
import { RuleEvaluatorService } from './rule-evaluator.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountSnapshotsModule } from '../account-snapshots/account-snapshots.module';

@Module({
  imports: [PrismaModule, AccountSnapshotsModule],
  providers: [RuleEvaluatorService],
  exports: [RuleEvaluatorService],
})
export class RuleEvaluatorModule {}
