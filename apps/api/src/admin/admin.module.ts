import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminTradingAccountsController } from './admin-trading-accounts.controller';
import { AdminTradingAccountsService } from './admin-trading-accounts.service';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminPaymentsService } from './admin-payments.service';
import { AdminPayoutsController } from './admin-payouts.controller';
import { AdminPayoutsService } from './admin-payouts.service';
import { AdminKYCController } from './admin-kyc.controller';
import { AdminKYCService } from './admin-kyc.service';

@Module({
  controllers: [
    AdminController,
    AdminTradingAccountsController,
    AdminPaymentsController,
    AdminPayoutsController,
    AdminKYCController,
  ],
  providers: [
    AdminService,
    AdminTradingAccountsService,
    AdminPaymentsService,
    AdminPayoutsService,
    AdminKYCService,
  ],
  exports: [
    AdminService,
    AdminTradingAccountsService,
    AdminPaymentsService,
    AdminPayoutsService,
    AdminKYCService,
  ],
})
export class AdminModule {}
