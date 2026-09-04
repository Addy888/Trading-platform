import { IsEnum } from 'class-validator';
import { ChallengeStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(ChallengeStatus)
  status: ChallengeStatus;
}
