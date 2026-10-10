import { Module } from '@nestjs/common';
import { DailyLossService } from './daily-loss.service';
import { DailyResetSchedulerService } from './daily-reset-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DailyLossService, DailyResetSchedulerService],
  exports: [DailyLossService, DailyResetSchedulerService],
})
export class DailyLossModule {}
