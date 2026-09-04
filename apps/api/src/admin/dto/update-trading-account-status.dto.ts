import { IsEnum } from 'class-validator';
import { TradingAccountStatus } from '@prisma/client';

export class UpdateTradingAccountStatusDto {
  @IsEnum(TradingAccountStatus)
  status: TradingAccountStatus;
}
