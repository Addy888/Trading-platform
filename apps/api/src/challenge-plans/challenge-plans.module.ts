import { Module } from '@nestjs/common';
import { ChallengePlansService } from './challenge-plans.service';
import { AdminChallengePlansController, PublicChallengePlansController } from './challenge-plans.controller';

@Module({
  controllers: [AdminChallengePlansController, PublicChallengePlansController],
  providers: [ChallengePlansService],
  exports: [ChallengePlansService],
})
export class ChallengePlansModule {}
