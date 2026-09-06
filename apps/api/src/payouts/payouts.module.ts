import { Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TradingAccountsModule } from '../trading-accounts/trading-accounts.module';

@Module({
  imports: [PrismaModule, TradingAccountsModule],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
