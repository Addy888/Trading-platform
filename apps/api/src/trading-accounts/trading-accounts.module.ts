import { Module } from '@nestjs/common';
import { TradingAccountsService } from './trading-accounts.service';
import { AccountStateService } from './account-state.service';
import { RuleSnapshotService } from './rule-snapshot.service';
import { RuleSnapshotBackfillService } from './rule-snapshot-backfill.service';
import { TradingAccountsController, AdminTradingAccountsController } from './trading-accounts.controller';
import { ChallengeProgressModule } from '../challenge-progress/challenge-progress.module';

@Module({
  imports: [ChallengeProgressModule],
  controllers: [TradingAccountsController, AdminTradingAccountsController],
  providers: [TradingAccountsService, AccountStateService, RuleSnapshotService, RuleSnapshotBackfillService],
  exports: [TradingAccountsService, AccountStateService, RuleSnapshotService, RuleSnapshotBackfillService],
})
export class TradingAccountsModule {}
