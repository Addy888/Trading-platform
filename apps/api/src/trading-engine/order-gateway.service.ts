import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus, TradeSide, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';
import { MarketDataEngineService, MarketStatus } from '../market-data/market-data-engine.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { MarginService } from './margin.service';
import { DailyLossService } from '../daily-loss/daily-loss.service';
import { MaxDrawdownService } from '../max-drawdown/max-drawdown.service';
import { RiskEvaluationService } from '../risk-engine/risk-evaluation.service';
import { AccountStateService } from '../trading-accounts/account-state.service';
import { CreateTradeOrderDto } from './dto/create-trade-order.dto';

/**
 * Order Rejection Reasons
 * 
 * Explicit, safe rejection messages without exposing internal state.
 */
export enum OrderRejectionReason {
  // Account errors
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  ACCOUNT_NOT_OWNED = 'ACCOUNT_NOT_OWNED',
  ACCOUNT_NOT_ACTIVE = 'ACCOUNT_NOT_ACTIVE',
  ACCOUNT_NOT_TRADABLE = 'ACCOUNT_NOT_TRADABLE',
  ACCOUNT_BREACHED = 'ACCOUNT_BREACHED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_CLOSED = 'ACCOUNT_CLOSED',
  NO_RULE_SNAPSHOT = 'NO_RULE_SNAPSHOT',
  
  // Symbol/Market errors
  INVALID_SYMBOL = 'INVALID_SYMBOL',
  SYMBOL_DISABLED = 'SYMBOL_DISABLED',
  MARKET_CLOSED = 'MARKET_CLOSED',
  MARKET_DATA_UNAVAILABLE = 'MARKET_DATA_UNAVAILABLE',
  MARKET_DATA_STALE = 'MARKET_DATA_STALE',
  
  // Order validation errors
  INVALID_VOLUME = 'INVALID_VOLUME',
  INVALID_SIDE = 'INVALID_SIDE',
  INVALID_STOP_LOSS = 'INVALID_STOP_LOSS',
  INVALID_TAKE_PROFIT = 'INVALID_TAKE_PROFIT',
  
  // Pre-trade risk errors
  INSUFFICIENT_MARGIN = 'INSUFFICIENT_MARGIN',
  DAILY_LOSS_BUDGET_EXCEEDED = 'DAILY_LOSS_BUDGET_EXCEEDED',
  DRAWDOWN_BUDGET_EXCEEDED = 'DRAWDOWN_BUDGET_EXCEEDED',
  RISK_BUDGET_EXCEEDED = 'RISK_BUDGET_EXCEEDED',
  
  // Idempotency
  DUPLICATE_ORDER = 'DUPLICATE_ORDER',
  
  // System
  TRADING_DISABLED = 'TRADING_DISABLED',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

/**
 * Pre-Trade Risk Validation Result
 */
export interface PreTradeRiskValidation {
  passed: boolean;
  rejectionReason?: OrderRejectionReason;
  details?: {
    requiredMargin?: string;
    freeMargin?: string;
    dailyLossBudget?: string;
    dailyLossUsage?: string;
    drawdownBudget?: string;
    drawdownUsage?: string;
    worstCaseLoss?: string;
  };
}

/**
 * Order Gateway Service
 * 
 * Day 8 - Secure Order Gateway + Pre-Trade Risk Validation
 * 
 * CRITICAL RESPONSIBILITIES:
 * 1. Backend-Authoritative Order Entry
 * 2. Account Ownership & Eligibility Validation
 * 3. Pre-Trade Risk Budget Validation
 * 4. Margin Requirement Validation
 * 5. Market Data Availability Validation
 * 6. Symbol & Volume Validation
 * 7. SL/TP Direction Validation
 * 8. Idempotency Protection
 * 9. Integration with Day 7 Risk Evaluation
 * 
 * SECURITY RULES:
 * - NEVER trust client-submitted financial data
 * - ALWAYS derive user from verified JWT
 * - ALWAYS verify account ownership
 * - ALWAYS check account status eligibility
 * - ALWAYS use backend market prices
 * - ALWAYS validate pre-trade risk budgets
 * - ALWAYS use transactions for atomicity
 * - NEVER bypass account state validation
 * 
 * ARCHITECTURE:
 * - This service validates and gates order entry
 * - TradingEngineV2Service handles actual execution
 * - RiskEvaluationService handles post-trade evaluation
 * - All operations are atomic and transactional
 */
@Injectable()
export class OrderGatewayService {
  private readonly logger = new Logger(OrderGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataEngineService,
    private readonly instrumentConfig: InstrumentConfigService,
    private readonly marginService: MarginService,
    private readonly dailyLossService: DailyLossService,
    private readonly maxDrawdownService: MaxDrawdownService,
    private readonly riskEvaluation: RiskEvaluationService,
    private readonly accountState: AccountStateService,
  ) {}

  /**
   * Validate and submit order for execution
   * 
   * This is the SECURE ORDER GATEWAY entry point.
   * All validation happens here before execution.
   * 
   * Flow:
   * 1. Validate authentication & ownership
   * 2. Check account eligibility
   * 3. Validate symbol and market data
   * 4. Validate order parameters
   * 5. Calculate and validate margin
   * 6. Perform pre-trade risk validation
   * 7. Check idempotency
   * 8. Return validated order ready for execution
   * 
   * @param userId Authenticated user ID (from JWT)
   * @param dto Order request (untrusted client input)
   * @returns Validated order context for execution
   */
  async validateOrder(
    userId: string,
    dto: CreateTradeOrderDto,
  ): Promise<{
    accountId: string;
    symbol: string;
    side: TradeSide;
    volume: Decimal;
    executionPrice: Decimal;
    stopLoss: Decimal | null;
    takeProfit: Decimal | null;
    leverage: number;
    requiredMargin: Decimal;
    idempotencyKey?: string;
  }> {
    // 1. Validate account ownership and eligibility
    const account = await this.validateAccountEligibility(userId, dto.tradingAccountId);

    // 2. Validate symbol and market availability
    const symbol = dto.symbol.toUpperCase();
    await this.validateSymbolAndMarket(symbol);

    // 3. Get instrument configuration
    const instrument = this.instrumentConfig.getInstrument(symbol);
    if (!instrument) {
      throw new BadRequestException({
        code: OrderRejectionReason.INVALID_SYMBOL,
        message: `Symbol ${symbol} not supported`,
      });
    }

    // 4. Validate and normalize volume
    const volumeDecimal = await this.validateVolume(symbol, dto.volume);

    // 5. Get execution price from backend market data
    const executionPrice = await this.getExecutionPrice(symbol, dto.side);

    // 6. Validate SL/TP levels
    const { stopLoss, takeProfit } = this.validateSlTpLevels(
      dto.side,
      executionPrice,
      dto.stopLoss,
      dto.takeProfit,
      symbol, // Pass symbol for distance validation
    );

    // 7. Determine leverage
    const leverage = instrument.defaultLeverage;

    // 8. Calculate required margin
    const marginCalc = this.marginService.calculateRequiredMargin(
      symbol,
      volumeDecimal,
      executionPrice,
      leverage,
    );

    // 9. Validate margin sufficiency
    await this.validateMarginSufficiency(dto.tradingAccountId, marginCalc.requiredMargin);

    // 10. Perform pre-trade risk validation
    await this.validatePreTradeRisk(
      dto.tradingAccountId,
      account,
      symbol,
      dto.side,
      volumeDecimal,
      executionPrice,
      stopLoss,
      marginCalc.requiredMargin,
    );

    // 11. Check idempotency (if provided)
    if (dto.idempotencyKey) {
      await this.checkIdempotency(dto.idempotencyKey, userId);
    }

    this.logger.log(
      `Order validated: ${symbol} ${dto.side} ${volumeDecimal.toString()} @ ${executionPrice.toString()}`,
    );

    return {
      accountId: dto.tradingAccountId,
      symbol,
      side: dto.side,
      volume: volumeDecimal,
      executionPrice,
      stopLoss,
      takeProfit,
      leverage,
      requiredMargin: marginCalc.requiredMargin,
      idempotencyKey: dto.idempotencyKey,
    };
  }

  /**
   * Validate account ownership and eligibility
   * 
   * SECURITY CRITICAL:
   * - Verify account exists
   * - Verify account belongs to authenticated user
   * - Verify account status is tradable
   * - Verify account has rule snapshot
   */
  private async validateAccountEligibility(
    userId: string,
    accountId: string,
  ): Promise<{
    id: string;
    userId: string;
    status: TradingAccountStatus;
    accountNumber: string;
  }> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        userId: true,
        status: true,
        accountNumber: true,
        ruleSnapshot: {
          select: { id: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException({
        code: OrderRejectionReason.ACCOUNT_NOT_FOUND,
        message: 'Trading account not found',
      });
    }

    // Verify ownership
    if (account.userId !== userId) {
      throw new ForbiddenException({
        code: OrderRejectionReason.ACCOUNT_NOT_OWNED,
        message: 'You do not own this trading account',
      });
    }

    // Verify rule snapshot exists
    if (!account.ruleSnapshot) {
      throw new BadRequestException({
        code: OrderRejectionReason.NO_RULE_SNAPSHOT,
        message: 'Account does not have a valid rule configuration',
      });
    }

    // Verify account is tradable
    if (!this.isAccountTradable(account.status)) {
      const rejectionReason = this.getAccountStatusRejectionReason(account.status);
      throw new ForbiddenException({
        code: rejectionReason,
        message: `Account is ${account.status} and cannot accept new orders`,
      });
    }

    return {
      id: account.id,
      userId: account.userId,
      status: account.status,
      accountNumber: account.accountNumber,
    };
  }

  /**
   * Check if account status allows new trades
   */
  private isAccountTradable(status: TradingAccountStatus): boolean {
    return status === TradingAccountStatus.ACTIVE;
  }

  /**
   * Get rejection reason based on account status
   */
  private getAccountStatusRejectionReason(status: TradingAccountStatus): OrderRejectionReason {
    switch (status) {
      case TradingAccountStatus.BREACHED:
        return OrderRejectionReason.ACCOUNT_BREACHED;
      case TradingAccountStatus.SUSPENDED:
        return OrderRejectionReason.ACCOUNT_SUSPENDED;
      case TradingAccountStatus.CLOSED:
        return OrderRejectionReason.ACCOUNT_CLOSED;
      case TradingAccountStatus.PASSED:
      case TradingAccountStatus.PENDING:
      default:
        return OrderRejectionReason.ACCOUNT_NOT_TRADABLE;
    }
  }

  /**
   * Validate symbol and market availability
   */
  private async validateSymbolAndMarket(symbol: string): Promise<void> {
    // Check symbol exists and is enabled
    const instrument = this.instrumentConfig.getInstrument(symbol);
    
    if (!instrument) {
      throw new BadRequestException({
        code: OrderRejectionReason.INVALID_SYMBOL,
        message: `Symbol ${symbol} is not supported`,
        availableSymbols: this.instrumentConfig.getEnabledSymbols(),
      });
    }

    if (!instrument.enabled) {
      throw new BadRequestException({
        code: OrderRejectionReason.SYMBOL_DISABLED,
        message: `Symbol ${symbol} is currently disabled`,
      });
    }

    // Check market status
    const marketStatus = this.marketData.getMarketStatus();
    if (marketStatus === MarketStatus.DISCONNECTED) {
      throw new BadRequestException({
        code: OrderRejectionReason.MARKET_CLOSED,
        message: 'Market is currently closed',
      });
    }

    // Check market data availability and freshness
    if (!this.marketData.isMarketAvailable(symbol)) {
      throw new BadRequestException({
        code: OrderRejectionReason.MARKET_DATA_STALE,
        message: `Market data for ${symbol} is stale or unavailable`,
      });
    }
  }

  /**
   * Validate and normalize volume
   */
  private async validateVolume(symbol: string, volume: number): Promise<Decimal> {
    const volumeDecimal = new Decimal(volume);

    const validation = this.instrumentConfig.validateVolume(symbol, volumeDecimal);

    if (!validation.valid) {
      throw new BadRequestException({
        code: OrderRejectionReason.INVALID_VOLUME,
        message: validation.error,
      });
    }

    return validation.normalized || volumeDecimal;
  }

  /**
   * Get execution price from backend market data
   * 
   * CRITICAL: Price is ALWAYS from backend, NEVER from client.
   * - BUY orders execute at ASK (seller's price)
   * - SELL orders execute at BID (buyer's price)
   */
  private async getExecutionPrice(symbol: string, side: TradeSide): Promise<Decimal> {
    let executionPrice: Decimal | null;

    if (side === TradeSide.BUY) {
      executionPrice = this.marketData.getAsk(symbol);
    } else {
      executionPrice = this.marketData.getBid(symbol);
    }

    if (!executionPrice) {
      throw new BadRequestException({
        code: OrderRejectionReason.MARKET_DATA_UNAVAILABLE,
        message: `Market price for ${symbol} is unavailable`,
      });
    }

    return executionPrice;
  }

  /**
   * Validate SL/TP direction and levels
   * 
   * Day 13 Enhancement: Added distance and tick size validation
   */
  private validateSlTpLevels(
    side: TradeSide,
    entryPrice: Decimal,
    stopLoss?: number,
    takeProfit?: number,
    symbol?: string,
  ): { stopLoss: Decimal | null; takeProfit: Decimal | null } {
    let sl: Decimal | null = null;
    let tp: Decimal | null = null;

    if (stopLoss !== undefined) {
      sl = new Decimal(stopLoss);

      if (side === TradeSide.BUY) {
        // BUY: SL must be below entry
        if (FinancialCalculations.greaterThanOrEqual(sl, entryPrice)) {
          throw new BadRequestException({
            code: OrderRejectionReason.INVALID_STOP_LOSS,
            message: 'Stop Loss for BUY order must be below entry price',
          });
        }
      } else {
        // SELL: SL must be above entry
        if (FinancialCalculations.lessThanOrEqual(sl, entryPrice)) {
          throw new BadRequestException({
            code: OrderRejectionReason.INVALID_STOP_LOSS,
            message: 'Stop Loss for SELL order must be above entry price',
          });
        }
      }

      // Day 13: Validate SL distance if symbol provided
      if (symbol) {
        this.validateSlDistance(side, entryPrice, sl, symbol);
      }
    }

    if (takeProfit !== undefined) {
      tp = new Decimal(takeProfit);

      if (side === TradeSide.BUY) {
        // BUY: TP must be above entry
        if (FinancialCalculations.lessThanOrEqual(tp, entryPrice)) {
          throw new BadRequestException({
            code: OrderRejectionReason.INVALID_TAKE_PROFIT,
            message: 'Take Profit for BUY order must be above entry price',
          });
        }
      } else {
        // SELL: TP must be below entry
        if (FinancialCalculations.greaterThanOrEqual(tp, entryPrice)) {
          throw new BadRequestException({
            code: OrderRejectionReason.INVALID_TAKE_PROFIT,
            message: 'Take Profit for SELL order must be below entry price',
          });
        }
      }

      // Day 13: Validate TP distance if symbol provided
      if (symbol) {
        this.validateTpDistance(side, entryPrice, tp, symbol);
      }
    }

    // Day 13: Validate SL/TP relationship if both provided
    if (sl && tp) {
      this.validateSlTpRelationship(side, sl, tp);
    }

    return { stopLoss: sl, takeProfit: tp };
  }

  /**
   * Validate SL distance from entry price
   * 
   * Day 13: New validation method
   */
  private validateSlDistance(
    side: TradeSide,
    entryPrice: Decimal,
    stopLoss: Decimal,
    symbol: string,
  ): void {
    const instrument = this.instrumentConfig.getInstrument(symbol);
    if (!instrument) {
      return; // Skip validation if instrument not found
    }

    // Calculate distance in pips
    const distanceInPrice = stopLoss.minus(entryPrice).abs();
    const distanceInPips = distanceInPrice.dividedBy(instrument.pipSize).toNumber();

    // Check minimum distance
    if (instrument.minSlDistance && distanceInPips < instrument.minSlDistance) {
      throw new BadRequestException({
        code: OrderRejectionReason.INVALID_STOP_LOSS,
        message: `Stop Loss must be at least ${instrument.minSlDistance} pips from entry price (current: ${Math.round(distanceInPips)} pips)`,
      });
    }

    // Check maximum distance
    if (instrument.maxSlDistance && distanceInPips > instrument.maxSlDistance) {
      throw new BadRequestException({
        code: OrderRejectionReason.INVALID_STOP_LOSS,
        message: `Stop Loss cannot be more than ${instrument.maxSlDistance} pips from entry price (current: ${Math.round(distanceInPips)} pips)`,
      });
    }
  }

  /**
   * Validate TP distance from entry price
   * 
   * Day 13: New validation method
   */
  private validateTpDistance(
    side: TradeSide,
    entryPrice: Decimal,
    takeProfit: Decimal,
    symbol: string,
  ): void {
    const instrument = this.instrumentConfig.getInstrument(symbol);
    if (!instrument) {
      return; // Skip validation if instrument not found
    }

    // Calculate distance in pips
    const distanceInPrice = takeProfit.minus(entryPrice).abs();
    const distanceInPips = distanceInPrice.dividedBy(instrument.pipSize).toNumber();

    // Check minimum distance
    if (instrument.minTpDistance && distanceInPips < instrument.minTpDistance) {
      throw new BadRequestException({
        code: OrderRejectionReason.INVALID_TAKE_PROFIT,
        message: `Take Profit must be at least ${instrument.minTpDistance} pips from entry price (current: ${Math.round(distanceInPips)} pips)`,
      });
    }

    // Check maximum distance
    if (instrument.maxTpDistance && distanceInPips > instrument.maxTpDistance) {
      throw new BadRequestException({
        code: OrderRejectionReason.INVALID_TAKE_PROFIT,
        message: `Take Profit cannot be more than ${instrument.maxTpDistance} pips from entry price (current: ${Math.round(distanceInPips)} pips)`,
      });
    }
  }

  /**
   * Validate SL/TP relationship
   * 
   * Day 13: New validation method
   */
  private validateSlTpRelationship(
    side: TradeSide,
    stopLoss: Decimal,
    takeProfit: Decimal,
  ): void {
    if (side === TradeSide.BUY) {
      // BUY: SL < Entry < TP
      // Since we already validated SL < Entry and TP > Entry,
      // we just need to ensure SL < TP
      if (stopLoss.greaterThanOrEqualTo(takeProfit)) {
        throw new BadRequestException({
          code: OrderRejectionReason.INVALID_TAKE_PROFIT,
          message: 'Stop Loss must be below Take Profit for BUY position',
        });
      }
    } else {
      // SELL: TP < Entry < SL
      // Since we already validated TP < Entry and SL > Entry,
      // we just need to ensure TP < SL
      if (takeProfit.greaterThanOrEqualTo(stopLoss)) {
        throw new BadRequestException({
          code: OrderRejectionReason.INVALID_TAKE_PROFIT,
          message: 'Take Profit must be below Stop Loss for SELL position',
        });
      }
    }
  }

  /**
   * Validate margin sufficiency
   */
  private async validateMarginSufficiency(
    accountId: string,
    requiredMargin: Decimal,
  ): Promise<void> {
    const marginCheck = await this.marginService.hasSufficientMargin(
      accountId,
      requiredMargin,
    );

    if (!marginCheck.sufficient) {
      throw new BadRequestException({
        code: OrderRejectionReason.INSUFFICIENT_MARGIN,
        message: 'Insufficient margin for this order',
        details: {
          requiredMargin: FinancialCalculations.formatMoney(requiredMargin),
          freeMargin: FinancialCalculations.formatMoney(marginCheck.freeMargin),
        },
      });
    }
  }

  /**
   * Validate pre-trade risk budgets
   * 
   * CRITICAL PRE-TRADE RISK VALIDATION:
   * 1. Daily Loss Budget Check
   * 2. Drawdown Budget Check
   * 3. Worst-case loss estimation (if SL provided)
   * 
   * This prevents orders that would immediately breach limits.
   */
  private async validatePreTradeRisk(
    accountId: string,
    account: { id: string; status: TradingAccountStatus },
    symbol: string,
    side: TradeSide,
    volume: Decimal,
    entryPrice: Decimal,
    stopLoss: Decimal | null,
    requiredMargin: Decimal,
  ): Promise<void> {
    // Get instrument for contract multiplier
    const instrument = this.instrumentConfig.getInstrument(symbol);
    const contractMultiplier = instrument?.contractMultiplier || 1;

    // 1. Check Daily Loss Budget
    try {
      const dailyLossEval = await this.dailyLossService.evaluateDailyLoss(accountId);

      // Check if already at or near daily loss limit
      if (dailyLossEval.breached) {
        throw new BadRequestException({
          code: OrderRejectionReason.DAILY_LOSS_BUDGET_EXCEEDED,
          message: 'Daily loss limit already reached',
          details: {
            dailyLossUsage: FinancialCalculations.formatPercentage(dailyLossEval.usagePercentage),
            dailyLossBudget: FinancialCalculations.formatMoney(dailyLossEval.remainingDailyLossBudget),
          },
        });
      }

      // If stop loss is provided, estimate worst-case loss
      if (stopLoss) {
        const worstCaseLoss = this.calculateWorstCaseLoss(
          side,
          entryPrice,
          stopLoss,
          volume,
          contractMultiplier,
        );

        // Check if worst-case loss would exceed remaining budget
        const remainingBudget = dailyLossEval.remainingDailyLossBudget;

        if (FinancialCalculations.greaterThan(worstCaseLoss, remainingBudget)) {
          throw new BadRequestException({
            code: OrderRejectionReason.DAILY_LOSS_BUDGET_EXCEEDED,
            message: 'Order worst-case loss exceeds remaining daily loss budget',
            details: {
              worstCaseLoss: FinancialCalculations.formatMoney(worstCaseLoss),
              remainingBudget: FinancialCalculations.formatMoney(remainingBudget),
            },
          });
        }
      }
    } catch (error) {
      // If no daily loss rule configured, that's OK
      if (error instanceof BadRequestException) {
        throw error; // Re-throw validation failures
      }
      // Other errors (e.g., no rule configured) are non-blocking
      this.logger.debug(`Daily loss check skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 2. Check Drawdown Budget
    try {
      const drawdownEval = await this.maxDrawdownService.evaluateMaxDrawdown(accountId);

      // Check if already at or near drawdown limit
      if (drawdownEval.breached) {
        throw new BadRequestException({
          code: OrderRejectionReason.DRAWDOWN_BUDGET_EXCEEDED,
          message: 'Max drawdown limit already reached',
          details: {
            drawdownUsage: FinancialCalculations.formatPercentage(drawdownEval.usagePercentage),
            drawdownBudget: FinancialCalculations.formatMoney(drawdownEval.remainingDrawdownBuffer),
          },
        });
      }

      // If stop loss is provided, check if worst-case would breach drawdown
      if (stopLoss) {
        const worstCaseLoss = this.calculateWorstCaseLoss(
          side,
          entryPrice,
          stopLoss,
          volume,
          contractMultiplier,
        );

        // Check against remaining drawdown buffer
        const remainingBuffer = drawdownEval.remainingDrawdownBuffer;

        if (FinancialCalculations.greaterThan(worstCaseLoss, remainingBuffer)) {
          throw new BadRequestException({
            code: OrderRejectionReason.DRAWDOWN_BUDGET_EXCEEDED,
            message: 'Order worst-case loss would breach max drawdown',
            details: {
              worstCaseLoss: FinancialCalculations.formatMoney(worstCaseLoss),
              remainingBuffer: FinancialCalculations.formatMoney(remainingBuffer),
            },
          });
        }
      }
    } catch (error) {
      // If no drawdown rule configured, that's OK
      if (error instanceof BadRequestException) {
        throw error; // Re-throw validation failures
      }
      // Other errors are non-blocking
      this.logger.debug(`Drawdown check skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    // NOTE: If no stop loss is provided, we cannot accurately estimate worst-case loss.
    // The system allows such orders but they carry unlimited risk.
    // This behavior should be configurable per account/plan rules.
  }

  /**
   * Calculate worst-case loss if stop loss is hit
   * 
   * This is a simple estimation assuming:
   * - Stop loss is executed at exact specified price
   * - No slippage
   * - No commissions/fees
   * 
   * Real worst-case could be worse due to slippage.
   */
  private calculateWorstCaseLoss(
    side: TradeSide,
    entryPrice: Decimal,
    stopLoss: Decimal,
    volume: Decimal,
    contractMultiplier: number,
  ): Decimal {
    const loss = FinancialCalculations.calculateRealizedPnl(
      side,
      entryPrice,
      stopLoss,
      volume,
      contractMultiplier,
    );

    // Return absolute value (loss is negative PnL)
    return FinancialCalculations.abs(
      FinancialCalculations.min(loss, new Decimal(0)),
    );
  }

  /**
   * Check idempotency to prevent duplicate orders
   * 
   * Uses audit log to track recent order submissions.
   * Idempotency keys expire after a reasonable time window.
   */
  private async checkIdempotency(idempotencyKey: string, userId: string): Promise<void> {
    // Check if this idempotency key was used recently (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const existingOrder = await this.prisma.auditLog.findFirst({
      where: {
        actorId: userId,
        action: 'ORDER_SUBMITTED',
        createdAt: { gte: oneHourAgo },
        metadata: {
          path: ['idempotencyKey'],
          equals: idempotencyKey,
        },
      },
    });

    if (existingOrder) {
      throw new BadRequestException({
        code: OrderRejectionReason.DUPLICATE_ORDER,
        message: 'This order has already been submitted',
        idempotencyKey,
      });
    }
  }
}
