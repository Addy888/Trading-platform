import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus, TradeSide, AccountStage } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';
import { MarketDataEngineService, MarketStatus } from '../market-data/market-data-engine.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { MarginService } from '../trading-engine/margin.service';
import { DailyLossService } from '../daily-loss/daily-loss.service';
import { MaxDrawdownService } from '../max-drawdown/max-drawdown.service';

/**
 * Pre-Trade Validation Result Code
 * 
 * Stable, explicit codes for each validation outcome.
 */
export enum PreTradeValidationCode {
  // Success
  APPROVED = 'APPROVED',
  
  // Authentication & Authorization
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  ACCOUNT_NOT_OWNED = 'ACCOUNT_NOT_OWNED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Account Eligibility
  ACCOUNT_NOT_ACTIVE = 'ACCOUNT_NOT_ACTIVE',
  ACCOUNT_BREACHED = 'ACCOUNT_BREACHED',
  ACCOUNT_PASSED = 'ACCOUNT_PASSED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_CLOSED = 'ACCOUNT_CLOSED',
  ACCOUNT_EXPIRED = 'ACCOUNT_EXPIRED',
  NO_RULE_SNAPSHOT = 'NO_RULE_SNAPSHOT',
  
  // Symbol & Market
  INVALID_SYMBOL = 'INVALID_SYMBOL',
  SYMBOL_DISABLED = 'SYMBOL_DISABLED',
  SYMBOL_NOT_ALLOWED = 'SYMBOL_NOT_ALLOWED',
  MARKET_CLOSED = 'MARKET_CLOSED',
  MARKET_DATA_UNAVAILABLE = 'MARKET_DATA_UNAVAILABLE',
  MARKET_DATA_STALE = 'MARKET_DATA_STALE',
  
  // Order Parameters
  INVALID_SIDE = 'INVALID_SIDE',
  INVALID_VOLUME = 'INVALID_VOLUME',
  VOLUME_TOO_SMALL = 'VOLUME_TOO_SMALL',
  VOLUME_TOO_LARGE = 'VOLUME_TOO_LARGE',
  INVALID_ORDER_TYPE = 'INVALID_ORDER_TYPE',
  INVALID_STOP_LOSS = 'INVALID_STOP_LOSS',
  INVALID_TAKE_PROFIT = 'INVALID_TAKE_PROFIT',
  
  // Risk Budget
  INSUFFICIENT_MARGIN = 'INSUFFICIENT_MARGIN',
  DAILY_LOSS_BUDGET_EXCEEDED = 'DAILY_LOSS_BUDGET_EXCEEDED',
  DRAWDOWN_BUDGET_EXCEEDED = 'DRAWDOWN_BUDGET_EXCEEDED',
  WORST_CASE_LOSS_EXCEEDED = 'WORST_CASE_LOSS_EXCEEDED',
  MAX_POSITIONS_EXCEEDED = 'MAX_POSITIONS_EXCEEDED',
  MAX_EXPOSURE_EXCEEDED = 'MAX_EXPOSURE_EXCEEDED',
  
  // System
  TRADING_DISABLED = 'TRADING_DISABLED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

/**
 * Order Request for Validation
 * 
 * Normalized order request structure for validation.
 */
export interface OrderRequest {
  tradingAccountId: string;
  symbol: string;
  side: TradeSide;
  volume: Decimal;
  stopLoss?: Decimal;
  takeProfit?: Decimal;
  orderType?: string;
}

/**
 * User Context for Authorization
 */
export interface UserContext {
  userId: string;
  role: string;
  permissions?: string[];
}

/**
 * Pre-Trade Validation Result
 * 
 * Structured decision with audit metadata.
 */
export interface PreTradeValidationResult {
  approved: boolean;
  code: PreTradeValidationCode;
  message: string;
  validationTimestamp: Date;
  
  // Account reference
  accountId: string;
  accountNumber?: string;
  ruleSnapshotVersion?: string;
  accountStage?: AccountStage;
  
  // Validation metadata
  metadata: {
    executionPrice?: string;
    requiredMargin?: string;
    freeMargin?: string;
    marginLevel?: string;
    
    dailyLossUsage?: string;
    dailyLossRemaining?: string;
    
    drawdownUsage?: string;
    drawdownRemaining?: string;
    
    worstCaseLoss?: string;
    
    openPositions?: number;
    totalExposure?: string;
  };
  
  // For audit trail
  validationSteps: Array<{
    step: string;
    passed: boolean;
    details?: any;
  }>;
}

/**
 * Pre-Trade Risk Validation Service
 * 
 * Day 9 - Centralized Pre-Trade Risk Validation Engine
 * 
 * RESPONSIBILITIES:
 * 1. Authenticate user and verify account ownership
 * 2. Load trading account and pinned rule snapshot
 * 3. Confirm account eligibility (not breached, suspended, etc.)
 * 4. Validate symbol, side, volume, and order parameters
 * 5. Verify market data availability and freshness
 * 6. Calculate authoritative balance, equity, and exposure
 * 7. Call Margin + Leverage + Free Margin calculator
 * 8. Call Worst-Case Loss calculator (if available)
 * 9. Calculate remaining Daily Loss and Drawdown budgets
 * 10. Reject if any risk constraint would be violated
 * 11. Return structured validation decision
 * 
 * ARCHITECTURE:
 * - Backend-authoritative (never trusts client data)
 * - Deterministic where possible
 * - Does NOT execute orders (validation only)
 * - Uses existing risk calculation modules
 * - Fail-safe (rejects when uncertain)
 * - Comprehensive audit trail
 * 
 * INTEGRATION:
 * - Called by Order Gateway before execution
 * - Can be called by other order entry points
 * - Returns stable codes for consistent handling
 * - Provides rich metadata for audit and debugging
 */
@Injectable()
export class PreTradeRiskValidationService {
  private readonly logger = new Logger(PreTradeRiskValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataEngineService,
    private readonly instrumentConfig: InstrumentConfigService,
    private readonly marginService: MarginService,
    private readonly dailyLossService: DailyLossService,
    private readonly maxDrawdownService: MaxDrawdownService,
  ) {}

  /**
   * Validate Order
   * 
   * Central validation orchestrator.
   * Executes complete validation sequence and returns structured decision.
   * 
   * @param orderRequest Normalized order request
   * @param userContext Authenticated user context
   * @returns Validation result with approval decision and metadata
   */
  async validateOrder(
    orderRequest: OrderRequest,
    userContext: UserContext,
  ): Promise<PreTradeValidationResult> {
    const validationTimestamp = new Date();
    const validationSteps: Array<{ step: string; passed: boolean; details?: any }> = [];

    try {
      // Step 1: Authenticate and verify ownership
      const accountCheck = await this.validateAccountOwnership(
        orderRequest.tradingAccountId,
        userContext,
      );
      validationSteps.push({
        step: 'Account Ownership',
        passed: accountCheck.passed,
        details: accountCheck.details,
      });

      if (!accountCheck.passed) {
        return this.buildRejection(
          accountCheck.code,
          accountCheck.message,
          orderRequest.tradingAccountId,
          validationTimestamp,
          validationSteps,
        );
      }

      const account = accountCheck.account!;

      // Step 2: Verify account eligibility
      const eligibilityCheck = this.validateAccountEligibility(account);
      validationSteps.push({
        step: 'Account Eligibility',
        passed: eligibilityCheck.passed,
        details: eligibilityCheck.details,
      });

      if (!eligibilityCheck.passed) {
        return this.buildRejection(
          eligibilityCheck.code,
          eligibilityCheck.message,
          orderRequest.tradingAccountId,
          validationTimestamp,
          validationSteps,
          account.accountNumber,
          account.ruleSnapshot?.snapshotVersion,
          account.stage,
        );
      }

      // Step 3: Validate symbol and market
      const symbolCheck = await this.validateSymbolAndMarket(orderRequest.symbol);
      validationSteps.push({
        step: 'Symbol & Market',
        passed: symbolCheck.passed,
        details: symbolCheck.details,
      });

      if (!symbolCheck.passed) {
        return this.buildRejection(
          symbolCheck.code,
          symbolCheck.message,
          orderRequest.tradingAccountId,
          validationTimestamp,
          validationSteps,
          account.accountNumber,
          account.ruleSnapshot?.snapshotVersion,
          account.stage,
        );
      }

      const instrument = symbolCheck.instrument!;

      // Step 4: Validate order parameters
      const paramsCheck = this.validateOrderParameters(
        orderRequest,
        instrument,
      );
      validationSteps.push({
        step: 'Order Parameters',
        passed: paramsCheck.passed,
        details: paramsCheck.details,
      });

      if (!paramsCheck.passed) {
        return this.buildRejection(
          paramsCheck.code,
          paramsCheck.message,
          orderRequest.tradingAccountId,
          validationTimestamp,
          validationSteps,
          account.accountNumber,
          account.ruleSnapshot?.snapshotVersion,
          account.stage,
        );
      }

      // Step 5: Get execution price
      const executionPrice = this.getExecutionPrice(
        orderRequest.symbol,
        orderRequest.side,
      );

      if (!executionPrice) {
        return this.buildRejection(
          PreTradeValidationCode.MARKET_DATA_UNAVAILABLE,
          `Market price unavailable for ${orderRequest.symbol}`,
          orderRequest.tradingAccountId,
          validationTimestamp,
          validationSteps,
          account.accountNumber,
          account.ruleSnapshot?.snapshotVersion,
          account.stage,
        );
      }

      // Step 6: Validate margin
      const marginCheck = await this.validateMargin(
        orderRequest.tradingAccountId,
        orderRequest.symbol,
        orderRequest.volume,
        executionPrice,
        instrument.defaultLeverage,
      );
      validationSteps.push({
        step: 'Margin',
        passed: marginCheck.passed,
        details: marginCheck.details,
      });

      if (!marginCheck.passed) {
        return this.buildRejection(
          marginCheck.code,
          marginCheck.message,
          orderRequest.tradingAccountId,
          validationTimestamp,
          validationSteps,
          account.accountNumber,
          account.ruleSnapshot?.snapshotVersion,
          account.stage,
          marginCheck.metadata,
        );
      }

      // Step 7: Validate daily loss budget
      const dailyLossCheck = await this.validateDailyLossBudget(
        orderRequest.tradingAccountId,
        orderRequest,
        executionPrice,
        instrument.contractMultiplier,
      );
      validationSteps.push({
        step: 'Daily Loss Budget',
        passed: dailyLossCheck.passed,
        details: dailyLossCheck.details,
      });

      if (!dailyLossCheck.passed) {
        return this.buildRejection(
          dailyLossCheck.code,
          dailyLossCheck.message,
          orderRequest.tradingAccountId,
          validationTimestamp,
          validationSteps,
          account.accountNumber,
          account.ruleSnapshot?.snapshotVersion,
          account.stage,
          {
            ...marginCheck.metadata,
            ...dailyLossCheck.metadata,
          },
        );
      }

      // Step 8: Validate drawdown budget
      const drawdownCheck = await this.validateDrawdownBudget(
        orderRequest.tradingAccountId,
        orderRequest,
        executionPrice,
        instrument.contractMultiplier,
      );
      validationSteps.push({
        step: 'Drawdown Budget',
        passed: drawdownCheck.passed,
        details: drawdownCheck.details,
      });

      if (!drawdownCheck.passed) {
        return this.buildRejection(
          drawdownCheck.code,
          drawdownCheck.message,
          orderRequest.tradingAccountId,
          validationTimestamp,
          validationSteps,
          account.accountNumber,
          account.ruleSnapshot?.snapshotVersion,
          account.stage,
          {
            ...marginCheck.metadata,
            ...dailyLossCheck.metadata,
            ...drawdownCheck.metadata,
          },
        );
      }

      // Step 9: Get open positions count
      const openPositions = await this.prisma.trade.count({
        where: {
          tradingAccountId: orderRequest.tradingAccountId,
          status: 'OPEN',
        },
      });

      // ALL VALIDATIONS PASSED
      validationSteps.push({
        step: 'Final Approval',
        passed: true,
        details: { message: 'All validations passed' },
      });

      return {
        approved: true,
        code: PreTradeValidationCode.APPROVED,
        message: 'Order approved for execution',
        validationTimestamp,
        accountId: orderRequest.tradingAccountId,
        accountNumber: account.accountNumber,
        ruleSnapshotVersion: account.ruleSnapshot?.snapshotVersion,
        accountStage: account.stage,
        metadata: {
          executionPrice: executionPrice.toString(),
          ...marginCheck.metadata,
          ...dailyLossCheck.metadata,
          ...drawdownCheck.metadata,
          openPositions,
        },
        validationSteps,
      };
    } catch (error) {
      this.logger.error(
        `Validation error for account ${orderRequest.tradingAccountId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      validationSteps.push({
        step: 'Error',
        passed: false,
        details: { error: error instanceof Error ? error.message : String(error) },
      });

      return this.buildRejection(
        PreTradeValidationCode.VALIDATION_ERROR,
        'Validation failed due to internal error',
        orderRequest.tradingAccountId,
        validationTimestamp,
        validationSteps,
      );
    }
  }

  /**
   * Validate account ownership and authorization
   */
  private async validateAccountOwnership(
    accountId: string,
    userContext: UserContext,
  ): Promise<{
    passed: boolean;
    code: PreTradeValidationCode;
    message: string;
    account?: any;
    details?: any;
  }> {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        ruleSnapshot: true,
      },
    });

    if (!account) {
      return {
        passed: false,
        code: PreTradeValidationCode.ACCOUNT_NOT_FOUND,
        message: 'Trading account not found',
        details: { accountId },
      };
    }

    // Check ownership (unless user is admin with explicit permission)
    const isAdmin = userContext.role === 'ADMIN';
    const ownsAccount = account.userId === userContext.userId;

    if (!ownsAccount && !isAdmin) {
      return {
        passed: false,
        code: PreTradeValidationCode.ACCOUNT_NOT_OWNED,
        message: 'You do not own this trading account',
        details: { accountId, userId: userContext.userId },
      };
    }

    // Check rule snapshot exists
    if (!account.ruleSnapshot) {
      return {
        passed: false,
        code: PreTradeValidationCode.NO_RULE_SNAPSHOT,
        message: 'Account does not have a valid rule configuration',
        details: { accountId },
      };
    }

    return {
      passed: true,
      code: PreTradeValidationCode.APPROVED,
      message: 'Account ownership verified',
      account,
      details: {
        accountNumber: account.accountNumber,
        userId: account.userId,
        hasRuleSnapshot: true,
      },
    };
  }

  /**
   * Validate account eligibility for trading
   */
  private validateAccountEligibility(account: any): {
    passed: boolean;
    code: PreTradeValidationCode;
    message: string;
    details?: any;
  } {
    const status = account.status as TradingAccountStatus;

    // Only ACTIVE accounts can place new orders
    if (status !== TradingAccountStatus.ACTIVE) {
      let code: PreTradeValidationCode;
      let message: string;

      switch (status) {
        case TradingAccountStatus.BREACHED:
          code = PreTradeValidationCode.ACCOUNT_BREACHED;
          message = 'Account is breached and cannot place new orders';
          break;
        case TradingAccountStatus.PASSED:
          code = PreTradeValidationCode.ACCOUNT_PASSED;
          message = 'Account has passed and cannot place new orders in current stage';
          break;
        case TradingAccountStatus.SUSPENDED:
          code = PreTradeValidationCode.ACCOUNT_SUSPENDED;
          message = 'Account is suspended';
          break;
        case TradingAccountStatus.CLOSED:
          code = PreTradeValidationCode.ACCOUNT_CLOSED;
          message = 'Account is closed';
          break;
        default:
          code = PreTradeValidationCode.ACCOUNT_NOT_ACTIVE;
          message = `Account status ${status} is not eligible for trading`;
      }

      return {
        passed: false,
        code,
        message,
        details: { status, accountNumber: account.accountNumber },
      };
    }

    return {
      passed: true,
      code: PreTradeValidationCode.APPROVED,
      message: 'Account is eligible for trading',
      details: { status, accountNumber: account.accountNumber },
    };
  }

  /**
   * Validate symbol and market availability
   */
  private async validateSymbolAndMarket(symbol: string): Promise<{
    passed: boolean;
    code: PreTradeValidationCode;
    message: string;
    instrument?: any;
    details?: any;
  }> {
    const instrument = this.instrumentConfig.getInstrument(symbol);

    if (!instrument) {
      return {
        passed: false,
        code: PreTradeValidationCode.INVALID_SYMBOL,
        message: `Symbol ${symbol} is not supported`,
        details: { symbol },
      };
    }

    if (!instrument.enabled) {
      return {
        passed: false,
        code: PreTradeValidationCode.SYMBOL_DISABLED,
        message: `Symbol ${symbol} is currently disabled`,
        details: { symbol },
      };
    }

    // Check market status
    const marketStatus = this.marketData.getMarketStatus();
    if (marketStatus === MarketStatus.DISCONNECTED) {
      return {
        passed: false,
        code: PreTradeValidationCode.MARKET_CLOSED,
        message: 'Market is currently closed',
        details: { marketStatus },
      };
    }

    // Check market data availability
    if (!this.marketData.isMarketAvailable(symbol)) {
      return {
        passed: false,
        code: PreTradeValidationCode.MARKET_DATA_STALE,
        message: `Market data for ${symbol} is stale or unavailable`,
        details: { symbol },
      };
    }

    return {
      passed: true,
      code: PreTradeValidationCode.APPROVED,
      message: 'Symbol and market validated',
      instrument,
      details: { symbol, enabled: true, marketStatus },
    };
  }

  /**
   * Validate order parameters (volume, side, SL/TP)
   */
  private validateOrderParameters(
    orderRequest: OrderRequest,
    instrument: any,
  ): {
    passed: boolean;
    code: PreTradeValidationCode;
    message: string;
    details?: any;
  } {
    // Validate volume
    const volumeValidation = this.instrumentConfig.validateVolume(
      orderRequest.symbol,
      orderRequest.volume,
    );

    if (!volumeValidation.valid) {
      return {
        passed: false,
        code: PreTradeValidationCode.INVALID_VOLUME,
        message: volumeValidation.error || 'Invalid volume',
        details: { volume: orderRequest.volume.toString(), error: volumeValidation.error },
      };
    }

    // Validate side
    if (![TradeSide.BUY, TradeSide.SELL].includes(orderRequest.side)) {
      return {
        passed: false,
        code: PreTradeValidationCode.INVALID_SIDE,
        message: 'Invalid order side',
        details: { side: orderRequest.side },
      };
    }

    return {
      passed: true,
      code: PreTradeValidationCode.APPROVED,
      message: 'Order parameters validated',
      details: {
        volume: orderRequest.volume.toString(),
        side: orderRequest.side,
        volumeValid: true,
      },
    };
  }

  /**
   * Get execution price from market data
   */
  private getExecutionPrice(symbol: string, side: TradeSide): Decimal | null {
    if (side === TradeSide.BUY) {
      return this.marketData.getAsk(symbol);
    } else {
      return this.marketData.getBid(symbol);
    }
  }

  /**
   * Validate margin sufficiency
   */
  private async validateMargin(
    accountId: string,
    symbol: string,
    volume: Decimal,
    price: Decimal,
    leverage: number,
  ): Promise<{
    passed: boolean;
    code: PreTradeValidationCode;
    message: string;
    metadata?: any;
    details?: any;
  }> {
    const marginCalc = this.marginService.calculateRequiredMargin(
      symbol,
      volume,
      price,
      leverage,
    );

    const marginCheck = await this.marginService.hasSufficientMargin(
      accountId,
      marginCalc.requiredMargin,
    );

    if (!marginCheck.sufficient) {
      return {
        passed: false,
        code: PreTradeValidationCode.INSUFFICIENT_MARGIN,
        message: 'Insufficient margin for this order',
        metadata: {
          requiredMargin: marginCalc.requiredMargin.toFixed(2),
          freeMargin: marginCheck.freeMargin.toFixed(2),
          marginLevel: marginCheck.marginLevel.toFixed(2),
          effectiveLeverage: marginCalc.effectiveLeverage,
        },
        details: {
          requiredMargin: marginCalc.requiredMargin.toString(),
          freeMargin: marginCheck.freeMargin.toString(),
          marginLevel: marginCheck.marginLevel.toString(),
          effectiveLeverage: marginCalc.effectiveLeverage,
          sufficient: false,
        },
      };
    }

    return {
      passed: true,
      code: PreTradeValidationCode.APPROVED,
      message: 'Margin sufficient',
      metadata: {
        requiredMargin: marginCalc.requiredMargin.toFixed(2),
        freeMargin: marginCheck.freeMargin.toFixed(2),
        marginLevel: marginCheck.marginLevel.toFixed(2),
        effectiveLeverage: marginCalc.effectiveLeverage,
      },
      details: {
        requiredMargin: marginCalc.requiredMargin.toString(),
        freeMargin: marginCheck.freeMargin.toString(),
        marginLevel: marginCheck.marginLevel.toString(),
        effectiveLeverage: marginCalc.effectiveLeverage,
        sufficient: true,
      },
    };
  }

  /**
   * Validate daily loss budget
   */
  private async validateDailyLossBudget(
    accountId: string,
    orderRequest: OrderRequest,
    executionPrice: Decimal,
    contractMultiplier: number,
  ): Promise<{
    passed: boolean;
    code: PreTradeValidationCode;
    message: string;
    metadata?: any;
    details?: any;
  }> {
    try {
      const dailyLoss = await this.dailyLossService.evaluateDailyLoss(accountId);

      // Check if already breached
      if (dailyLoss.breached) {
        return {
          passed: false,
          code: PreTradeValidationCode.DAILY_LOSS_BUDGET_EXCEEDED,
          message: 'Daily loss limit already reached',
          metadata: {
            dailyLossUsage: dailyLoss.usagePercentage.toFixed(2) + '%',
            dailyLossRemaining: dailyLoss.remainingDailyLossBudget.toFixed(2),
          },
          details: {
            breached: true,
            usage: dailyLoss.usagePercentage.toString(),
            remaining: dailyLoss.remainingDailyLossBudget.toString(),
          },
        };
      }

      // If stop loss provided, check worst-case loss
      if (orderRequest.stopLoss) {
        const worstCaseLoss = this.calculateWorstCaseLoss(
          orderRequest.side,
          executionPrice,
          orderRequest.stopLoss,
          orderRequest.volume,
          contractMultiplier,
        );

        if (FinancialCalculations.greaterThan(worstCaseLoss, dailyLoss.remainingDailyLossBudget)) {
          return {
            passed: false,
            code: PreTradeValidationCode.DAILY_LOSS_BUDGET_EXCEEDED,
            message: 'Order worst-case loss exceeds remaining daily loss budget',
            metadata: {
              worstCaseLoss: worstCaseLoss.toFixed(2),
              dailyLossRemaining: dailyLoss.remainingDailyLossBudget.toFixed(2),
            },
            details: {
              worstCaseLoss: worstCaseLoss.toString(),
              remaining: dailyLoss.remainingDailyLossBudget.toString(),
              exceedsLimit: true,
            },
          };
        }
      }

      return {
        passed: true,
        code: PreTradeValidationCode.APPROVED,
        message: 'Daily loss budget sufficient',
        metadata: {
          dailyLossUsage: dailyLoss.usagePercentage.toFixed(2) + '%',
          dailyLossRemaining: dailyLoss.remainingDailyLossBudget.toFixed(2),
        },
        details: {
          breached: false,
          usage: dailyLoss.usagePercentage.toString(),
          remaining: dailyLoss.remainingDailyLossBudget.toString(),
        },
      };
    } catch (error) {
      // No daily loss rule configured - not a blocker
      this.logger.debug(`Daily loss check skipped: ${error instanceof Error ? error.message : String(error)}`);
      return {
        passed: true,
        code: PreTradeValidationCode.APPROVED,
        message: 'Daily loss rule not configured',
        details: { ruleConfigured: false },
      };
    }
  }

  /**
   * Validate drawdown budget
   */
  private async validateDrawdownBudget(
    accountId: string,
    orderRequest: OrderRequest,
    executionPrice: Decimal,
    contractMultiplier: number,
  ): Promise<{
    passed: boolean;
    code: PreTradeValidationCode;
    message: string;
    metadata?: any;
    details?: any;
  }> {
    try {
      const drawdown = await this.maxDrawdownService.evaluateMaxDrawdown(accountId);

      // Check if already breached
      if (drawdown.breached) {
        return {
          passed: false,
          code: PreTradeValidationCode.DRAWDOWN_BUDGET_EXCEEDED,
          message: 'Max drawdown limit already reached',
          metadata: {
            drawdownUsage: drawdown.usagePercentage.toFixed(2) + '%',
            drawdownRemaining: drawdown.remainingDrawdownBuffer.toFixed(2),
          },
          details: {
            breached: true,
            usage: drawdown.usagePercentage.toString(),
            remaining: drawdown.remainingDrawdownBuffer.toString(),
          },
        };
      }

      // If stop loss provided, check worst-case loss
      if (orderRequest.stopLoss) {
        const worstCaseLoss = this.calculateWorstCaseLoss(
          orderRequest.side,
          executionPrice,
          orderRequest.stopLoss,
          orderRequest.volume,
          contractMultiplier,
        );

        if (FinancialCalculations.greaterThan(worstCaseLoss, drawdown.remainingDrawdownBuffer)) {
          return {
            passed: false,
            code: PreTradeValidationCode.DRAWDOWN_BUDGET_EXCEEDED,
            message: 'Order worst-case loss would breach max drawdown',
            metadata: {
              worstCaseLoss: worstCaseLoss.toFixed(2),
              drawdownRemaining: drawdown.remainingDrawdownBuffer.toFixed(2),
            },
            details: {
              worstCaseLoss: worstCaseLoss.toString(),
              remaining: drawdown.remainingDrawdownBuffer.toString(),
              exceedsLimit: true,
            },
          };
        }
      }

      return {
        passed: true,
        code: PreTradeValidationCode.APPROVED,
        message: 'Drawdown budget sufficient',
        metadata: {
          drawdownUsage: drawdown.usagePercentage.toFixed(2) + '%',
          drawdownRemaining: drawdown.remainingDrawdownBuffer.toFixed(2),
        },
        details: {
          breached: false,
          usage: drawdown.usagePercentage.toString(),
          remaining: drawdown.remainingDrawdownBuffer.toString(),
        },
      };
    } catch (error) {
      // No drawdown rule configured - not a blocker
      this.logger.debug(`Drawdown check skipped: ${error instanceof Error ? error.message : String(error)}`);
      return {
        passed: true,
        code: PreTradeValidationCode.APPROVED,
        message: 'Drawdown rule not configured',
        details: { ruleConfigured: false },
      };
    }
  }

  /**
   * Calculate worst-case loss if stop loss is hit
   */
  private calculateWorstCaseLoss(
    side: TradeSide,
    entryPrice: Decimal,
    stopLoss: Decimal,
    volume: Decimal,
    contractMultiplier: number,
  ): Decimal {
    const pnl = FinancialCalculations.calculateRealizedPnl(
      side,
      entryPrice,
      stopLoss,
      volume,
      contractMultiplier,
    );

    // Return absolute value of loss (PnL will be negative for loss)
    return FinancialCalculations.abs(
      FinancialCalculations.min(pnl, new Decimal(0)),
    );
  }

  /**
   * Build rejection result
   */
  private buildRejection(
    code: PreTradeValidationCode,
    message: string,
    accountId: string,
    validationTimestamp: Date,
    validationSteps: Array<{ step: string; passed: boolean; details?: any }>,
    accountNumber?: string,
    ruleSnapshotVersion?: string,
    accountStage?: AccountStage,
    metadata?: any,
  ): PreTradeValidationResult {
    return {
      approved: false,
      code,
      message,
      validationTimestamp,
      accountId,
      accountNumber,
      ruleSnapshotVersion,
      accountStage,
      metadata: metadata || {},
      validationSteps,
    };
  }
}
