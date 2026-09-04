import { PartialType } from '@nestjs/mapped-types';
import { CreateTradingRuleDto } from './create-trading-rule.dto';

export class UpdateTradingRuleDto extends PartialType(CreateTradingRuleDto) {}
