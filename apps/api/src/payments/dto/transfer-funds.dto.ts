import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class TransferToTradingDto {
  @IsNotEmpty()
  @IsUUID()
  tradingAccountId: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Amount must be a valid positive number with up to 2 decimal places',
  })
  amount: string;
}

export class TransferFromTradingDto {
  @IsNotEmpty()
  @IsUUID()
  tradingAccountId: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Amount must be a valid positive number with up to 2 decimal places',
  })
  amount: string;
}
