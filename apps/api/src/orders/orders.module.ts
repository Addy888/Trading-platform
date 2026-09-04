import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController, AdminOrdersController } from './orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountSnapshotsModule } from '../account-snapshots/account-snapshots.module';

@Module({
  imports: [PrismaModule, AccountSnapshotsModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
