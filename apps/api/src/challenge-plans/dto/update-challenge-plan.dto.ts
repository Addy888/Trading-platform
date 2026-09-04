import { PartialType } from '@nestjs/mapped-types';
import { CreateChallengePlanDto } from './create-challenge-plan.dto';

export class UpdateChallengePlanDto extends PartialType(CreateChallengePlanDto) {}
