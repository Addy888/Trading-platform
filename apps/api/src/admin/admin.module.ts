import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminTradingAccountsController } from './admin-trading-accounts.controller';
import { AdminTradingAccountsService } from './admin-trading-accounts.service';

@Module({
  controllers: [
    AdminController,
    AdminTradingAccountsController,
  ],
  providers: [
    AdminService,
    AdminTradingAccountsService,
  ],
  exports: [AdminService, AdminTradingAccountsService],
})
export class AdminModule {}
