import { Module } from '@nestjs/common';
import { MaxDrawdownService } from './max-drawdown.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MaxDrawdownService],
  exports: [MaxDrawdownService],
})
export class MaxDrawdownModule {}
