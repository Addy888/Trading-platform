import { IsNotEmpty, IsString, IsOptional, Matches, IsUrl } from 'class-validator';

export class InitiateDepositDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Amount must be a valid positive number with at most 2 decimal places',
  })
  amount: string;

  @IsNotEmpty()
  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;
}
