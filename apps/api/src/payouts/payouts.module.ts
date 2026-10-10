import { Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { PayoutEligibilityService } from './payout-eligibility.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TradingAccountsModule } from '../trading-accounts/trading-accounts.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [PrismaModule, TradingAccountsModule, RiskEngineModule, KycModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutEligibilityService],
  exports: [PayoutsService, PayoutEligibilityService],
})
export class PayoutsModule {}
