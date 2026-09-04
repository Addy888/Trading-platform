import { Module } from '@nestjs/common';
import { ChallengeProgressService } from './challenge-progress.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ChallengeProgressService],
  exports: [ChallengeProgressService],
})
export class ChallengeProgressModule {}
