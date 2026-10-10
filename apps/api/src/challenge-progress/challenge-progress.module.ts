import { Module } from '@nestjs/common';
import { ChallengeProgressService } from './challenge-progress.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DailyLossModule } from '../daily-loss/daily-loss.module';
import { MaxDrawdownModule } from '../max-drawdown/max-drawdown.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';

@Module({
  imports: [PrismaModule, DailyLossModule, MaxDrawdownModule, RiskEngineModule],
  providers: [ChallengeProgressService],
  exports: [ChallengeProgressService],
})
export class ChallengeProgressModule {}
