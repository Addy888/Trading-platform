import { TradeSide } from '@prisma/client';
import { TradingMode, OrderType } from './place-order.dto';

/**
 * Broker Order Status (Normalized)
 */
export enum BrokerOrderStatus {
  PENDING_SUBMISSION = 'PENDING_SUBMISSION',
  SUBMITTED = 'SUBMITTED',
  PENDING_RECONCILIATION = 'PENDING_RECONCILIATION',
  OPEN = 'OPEN',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

/**
 * Order Response DTO
 * 
 * Response after placing or querying an order
 */
export interface OrderResponseDto {
  id: string;
  tradingAccountId: string;
  symbol: string;
  side: TradeSide;
  orderType: OrderType;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  tradingMode: TradingMode;
  status: BrokerOrderStatus;
  statusMessage?: string;
  brokerOrderId?: string;
  brokerStatus?: string;
  filledQuantity: number;
  averageFillPrice?: number;
  totalFillValue?: number;
  commission: number;
  riskValidationCode?: string;
  riskValidationMessage?: string;
  rejectionReason?: string;
  rejectionCode?: string;
  needsReconciliation: boolean;
  submittedAt?: Date;
  filledAt?: Date;
  cancelledAt?: Date;
  rejectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Order List Response DTO
 */
export interface OrderListResponseDto {
  orders: OrderResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Cancel Order Response DTO
 */
export interface CancelOrderResponseDto {
  id: string;
  status: BrokerOrderStatus;
  statusMessage?: string;
  cancelledAt?: Date;
  brokerResponse?: any;
}
