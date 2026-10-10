import { IsOptional, IsBoolean } from 'class-validator';

/**
 * Day 4: Portfolio DTOs
 * 
 * Request/response types for portfolio sync endpoints
 */

/**
 * Sync portfolio request
 * Optional: triggers manual sync
 */
export class SyncPortfolioDto {
  // Empty - no body needed
}

/**
 * Query parameters for getPositions
 */
export class GetPositionsQueryDto {
  @IsOptional()
  @IsBoolean()
  onlyOpen?: boolean = true;
}

/**
 * Portfolio sync response
 */
export interface PortfolioSyncResponseDto {
  success: boolean;
  syncId: string;
  positionsCount: number;
  holdingsCount: number;
  funds: FundsDto;
  syncedAt: Date;
  duration: number;
}

/**
 * Sync status response
 */
export interface SyncStatusResponseDto {
  connected: boolean;
  connectionStatus?: string;
  lastSync: {
    syncId: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    positionsCount: number | null;
    holdingsCount: number | null;
    errorMessage: string | null;
  } | null;
  status: string;
  inProgress: boolean;
}

/**
 * Broker position response
 */
export interface BrokerPositionDto {
  id: string;
  exchange: string;
  symbol: string;
  symbolToken: string;
  tradingSymbol: string;
  productType: string;
  instrumentType: string | null;
  netQuantity: string; // Decimal as string for JSON
  buyQuantity: string;
  sellQuantity: string;
  netAveragePrice: string | null;
  buyAveragePrice: string | null;
  sellAveragePrice: string | null;
  lastTradedPrice: string | null;
  closePrice: string | null;
  realizedPnl: string;
  unrealizedPnl: string;
  totalPnl: string;
  pnlPercentage: string | null;
  totalBuyValue: string | null;
  totalSellValue: string | null;
  netValue: string | null;
  multiplier: number;
  lotSize: number;
  positionType: string;
  lastSyncedAt: Date;
}

/**
 * Broker holding response
 */
export interface BrokerHoldingDto {
  id: string;
  exchange: string;
  symbol: string;
  symbolToken: string;
  tradingSymbol: string;
  isin: string | null;
  quantity: string;
  t1Quantity: string;
  realizedQuantity: string;
  authorizedQuantity: string;
  collateralQuantity: string;
  averagePrice: string | null;
  lastTradedPrice: string | null;
  closePrice: string | null;
  profitAndLoss: string;
  pnlPercentage: string | null;
  currentValue: string | null;
  investedValue: string | null;
  collateralType: string | null;
  haircut: string | null;
  lastSyncedAt: Date;
}

/**
 * Funds/margin response
 */
export interface FundsDto {
  netAvailableFunds: string;
  availableCash: string;
  availableMargin: string;
  collateral: string;
  m2mUnrealized: string;
  m2mRealized: string;
  utilizedMargin: string;
}

/**
 * Combined portfolio response
 */
export interface PortfolioResponseDto {
  positions: BrokerPositionDto[];
  holdings: BrokerHoldingDto[];
  funds: FundsDto | null;
  lastSyncedAt: Date | null;
}
