import { PartialType } from '@nestjs/mapped-types';
import { CreateRuleSetDto } from './create-rule-set.dto';

export class UpdateRuleSetDto extends PartialType(CreateRuleSetDto) {}
