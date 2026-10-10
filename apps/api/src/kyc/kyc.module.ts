import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { KycGateService } from './kyc-gate.service';
import { KycEventsService } from './kyc-events.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [KycController],
  providers: [KycService, KycGateService, KycEventsService],
  exports: [KycService, KycGateService],
})
export class KycModule {}
