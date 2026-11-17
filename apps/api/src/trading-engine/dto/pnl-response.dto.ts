import { TradeSide } from '@prisma/client';

/**
 * Open Position P&L Response DTO
 */
export class OpenPositionPnLDto {
  tradeId: string;
  symbol: string;
  side: TradeSide;
  entryPrice: string;
  currentPrice: string;
  quantity: string;
  lotSize: number;
  contractSize: number;
  unrealizedGrossPnl: string;
  spreadImpact: string;
  commission: string;
  swap: string;
  netUnrealizedPnl: string;
  pnlPercentage: string;
  openedAt: Date;
}

/**
 * Closed Trade P&L Response DTO
 */
export class ClosedTradePnLDto {
  tradeId: string;
  symbol: string;
  side: TradeSide;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  grossPnl: string;
  commission: string;
  swap: string;
  netPnl: string;
  pnlPercentage: string;
  openedAt: Date;
  closedAt: Date;
  holdingDays: number;
}

/**
 * Account Financial Summary Response DTO
 */
export class AccountFinancialSummaryDto {
  balance: string;
  equity: string;
  usedMargin: string;
  freeMargin: string;
  unrealizedPnl: string;
  realizedPnl: string;
  todaysPnl: string;
  totalNetPnl: string;
  marginUtilization: string;
  accountStatus: string;
}

/**
 * Dashboard Analytics Response DTO
 */
export class DashboardAnalyticsDto {
  dailyPnl: string;
  weeklyPnl: string;
  monthlyPnl: string;
  totalRealizedPnl: string;
  totalUnrealizedPnl: string;
  winningTrades: number;
  losingTrades: number;
  totalTrades: number;
  winRate: string;
  avgProfitPerWinningTrade: string;
  avgLossPerLosingTrade: string;
  largestProfit: string;
  largestLoss: string;
  profitFactor: string;
}

/**
 * Closed Trade Report Entry DTO
 */
export class ClosedTradeReportEntryDto {
  positionId: string;
  instrument: string;
  direction: TradeSide;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  grossPnl: string;
  commission: string;
  swap: string;
  netPnl: string;
  openingTimestamp: Date;
  closingTimestamp: Date;
  closingReason: string;
  holdingDays: number;
}

/**
 * Closed Trade Report DTO
 */
export class ClosedTradeReportDto {
  accountId: string;
  accountNumber: string;
  reportDate: Date;
  trades: ClosedTradeReportEntryDto[];
  totalGrossPnl: string;
  totalCommission: string;
  totalSwap: string;
  totalNetPnl: string;
  winningTradesCount: number;
  losingTradesCount: number;
}

/**
 * Open Positions List Response DTO
 */
export class OpenPositionsResponseDto {
  positions: OpenPositionPnLDto[];
  totalUnrealizedPnl: string;
  totalPositionsCount: number;
}

/**
 * Closed Trades List Response DTO
 */
export class ClosedTradesResponseDto {
  trades: ClosedTradePnLDto[];
  total: number;
  page: number;
  limit: number;
  totalNetPnl: string;
}

/**
 * Query parameters for closed trades
 */
export class ClosedTradesQueryDto {
  page?: number = 1;
  limit?: number = 50;
  fromDate?: Date;
  toDate?: Date;
  symbol?: string;
  side?: TradeSide;
}
