import { IsString, IsNotEmpty, IsEnum, IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';
import { RuleType } from '@prisma/client';

export class CreateTradingRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(RuleType)
  @IsNotEmpty()
  type: RuleType;

  @IsNumber()
  @Min(0)
  value: number;

  @IsBoolean()
  isPercentage: boolean;
}
