import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { TradeSide } from '@prisma/client';

export class OpenTradeDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsEnum(TradeSide)
  @IsNotEmpty()
  side: TradeSide;

  @IsNumber()
  @IsPositive()
  volume: number;

  @IsNumber()
  @IsOptional()
  @IsPositive()
  stopLoss?: number;

  @IsNumber()
  @IsOptional()
  @IsPositive()
  takeProfit?: number;
}
