import { Module } from '@nestjs/common';
import { TradingAccountsService } from './trading-accounts.service';
import { AccountStateService } from './account-state.service';
import { RuleSnapshotService } from './rule-snapshot.service';
import { TradingAccountsController, AdminTradingAccountsController } from './trading-accounts.controller';
import { ChallengeProgressModule } from '../challenge-progress/challenge-progress.module';

@Module({
  imports: [ChallengeProgressModule],
  controllers: [TradingAccountsController, AdminTradingAccountsController],
  providers: [TradingAccountsService, AccountStateService, RuleSnapshotService],
  exports: [TradingAccountsService, AccountStateService, RuleSnapshotService],
})
export class TradingAccountsModule {}
