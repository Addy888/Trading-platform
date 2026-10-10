import { IsString, IsEnum, IsNumber, IsOptional, IsBoolean, Min, IsUUID } from 'class-validator';
import { TradeSide } from '@prisma/client';

/**
 * Order Type Enum
 */
export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP_MARKET = 'STOP_MARKET',
  STOP_LIMIT = 'STOP_LIMIT',
}

/**
 * Trading Mode
 * 
 * SIMULATED: Platform simulated engine (instant fills, no broker)
 * PAPER: Local paper trading with real market data (no broker)
 * BROKER_SANDBOX: Official broker demo environment (if available)
 * LIVE: Real broker execution with real money
 */
export enum TradingMode {
  SIMULATED = 'SIMULATED',
  PAPER = 'PAPER',
  BROKER_SANDBOX = 'BROKER_SANDBOX',
  LIVE = 'LIVE',
}

/**
 * Place Order DTO
 * 
 * Request to place a new broker order
 */
export class PlaceOrderDto {
  @IsUUID()
  tradingAccountId: string;

  @IsString()
  symbol: string;

  @IsEnum(TradeSide)
  side: TradeSide;

  @IsEnum(OrderType)
  orderType: OrderType;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  triggerPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stopLoss?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  takeProfit?: number;

  @IsEnum(TradingMode)
  tradingMode: TradingMode;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsBoolean()
  confirmLiveOrder?: boolean; // Required true for LIVE orders
}
