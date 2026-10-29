import { IsNotEmpty, IsString, IsEnum, Matches, MinLength } from 'class-validator';
import { LedgerDirection } from '@prisma/client';

export class AdminAdjustmentDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Amount must be a valid positive number with up to 2 decimal places',
  })
  amount: string;

  @IsNotEmpty()
  @IsEnum(LedgerDirection, {
    message: 'Direction must be CREDIT or DEBIT',
  })
  direction: LedgerDirection;

  @IsNotEmpty()
  @IsString()
  @MinLength(5, {
    message: 'Audit reason must be at least 5 characters long',
  })
  reason: string;
}
