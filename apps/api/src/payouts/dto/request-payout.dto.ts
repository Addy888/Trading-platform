import { IsString, IsNumber, IsOptional, Min, IsEnum } from 'class-validator';

export class RequestPayoutDto {
  @IsString()
  tradingAccountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
