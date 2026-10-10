import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { TradeSide } from '@prisma/client';

/**
 * Create Trade Order DTO
 * 
 * Day 8 - Secure Order Gateway
 * 
 * SECURITY: Only permitted client inputs accepted.
 * The following are NEVER trusted from client:
 * - User ID (derived from JWT)
 * - Account ownership (verified server-side)
 * - Balance, equity, PnL (backend authoritative)
 * - Entry price (derived from backend market data)
 * - Margin, free margin (calculated server-side)
 * - Rule limits, account status (verified server-side)
 * - Order/trade status (managed server-side)
 * - Risk approval/breach status (determined server-side)
 */
export class CreateTradeOrderDto {
  @IsString()
  @IsNotEmpty()
  tradingAccountId: string;

  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsEnum(TradeSide)
  @IsNotEmpty()
  side: TradeSide;

  @IsNumber()
  @IsPositive()
  @Min(0.01)
  volume: number;

  @IsNumber()
  @IsOptional()
  @IsPositive()
  stopLoss?: number;

  @IsNumber()
  @IsOptional()
  @IsPositive()
  takeProfit?: number;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
