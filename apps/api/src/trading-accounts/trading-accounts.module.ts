import { Module } from '@nestjs/common';
import { TradingAccountsService } from './trading-accounts.service';
import { TradingAccountsController, AdminTradingAccountsController } from './trading-accounts.controller';
import { ChallengeProgressModule } from '../challenge-progress/challenge-progress.module';

@Module({
  imports: [ChallengeProgressModule],
  controllers: [TradingAccountsController, AdminTradingAccountsController],
  providers: [TradingAccountsService],
  exports: [TradingAccountsService],
})
export class TradingAccountsModule {}
