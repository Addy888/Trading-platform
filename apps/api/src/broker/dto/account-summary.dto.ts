import { IsString, IsOptional, IsNumber } from 'class-validator';

export class AccountSummaryDto {
  @IsString()
  provider: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsNumber()
  availableFunds?: number;

  @IsOptional()
  @IsNumber()
  usedMargin?: number;

  @IsOptional()
  @IsNumber()
  totalFunds?: number;

  @IsOptional()
  exchanges?: string[];
}
