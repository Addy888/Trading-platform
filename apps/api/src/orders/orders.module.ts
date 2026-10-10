import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController, AdminOrdersController } from './orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountSnapshotsModule } from '../account-snapshots/account-snapshots.module';
import { TradingAccountsModule } from '../trading-accounts/trading-accounts.module';

@Module({
  imports: [PrismaModule, AccountSnapshotsModule, TradingAccountsModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
