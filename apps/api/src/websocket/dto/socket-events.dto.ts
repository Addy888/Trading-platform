/**
 * WebSocket Event DTOs
 * 
 * Type definitions for all WebSocket events.
 * These ensure type safety across the real-time communication layer.
 */

/**
 * Market Price Update
 */
export interface MarketPriceEvent {
  symbol: string;
  price: string;
  timestamp: Date;
  source: string;
}

export interface MarketPricesEvent {
  prices: MarketPriceEvent[];
  timestamp: Date;
  source: string;
}

/**
 * Account Update
 */
export interface AccountUpdateEvent {
  accountId: string;
  accountNumber: string;
  currentBalance: string;
  equity: string;
  unrealizedPnl: string;
  totalPnl: string;
  status: string;
  updatedAt: Date;
}

/**
 * Position Update
 */
export interface PositionUpdateEvent {
  tradeId: string;
  accountId: string;
  symbol: string;
  side: string;
  volume: string;
  entryPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
  updatedAt: Date;
}

/**
 * Trade Events
 */
export interface TradeOpenedEvent {
  tradeId: string;
  accountId: string;
  accountNumber: string;
  symbol: string;
  side: string;
  volume: string;
  entryPrice: string;
  stopLoss?: string;
  takeProfit?: string;
  openedAt: Date;
}

export interface TradeClosedEvent {
  tradeId: string;
  accountId: string;
  accountNumber: string;
  symbol: string;
  side: string;
  volume: string;
  entryPrice: string;
  exitPrice: string;
  realizedPnl: string;
  closedAt: Date;
}

/**
 * Challenge Progress Update
 */
export interface ChallengeUpdateEvent {
  accountId: string;
  profitTarget?: {
    target: string;
    current: string;
    percentage: number;
    achieved: boolean;
  };
  dailyLoss?: {
    limit: string;
    current: string;
    percentage: number;
    breached: boolean;
  };
  maxDrawdown?: {
    limit: string;
    current: string;
    percentage: number;
    breached: boolean;
  };
  minTradingDays?: {
    required: number;
    current: number;
    achieved: boolean;
  };
  updatedAt: Date;
}

/**
 * Account Status Change
 */
export interface AccountStatusEvent {
  accountId: string;
  accountNumber: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
  timestamp: Date;
}

/**
 * System Error
 */
export interface SystemErrorEvent {
  message: string;
  code?: string;
  timestamp: Date;
}

/**
 * Connection Ready
 */
export interface ConnectionReadyEvent {
  userId: string;
  role: string;
  timestamp: Date;
  message: string;
}

/**
 * Subscribe/Unsubscribe Requests
 */
export interface SubscribeAccountDto {
  accountId: string;
}

export interface UnsubscribeAccountDto {
  accountId: string;
}
