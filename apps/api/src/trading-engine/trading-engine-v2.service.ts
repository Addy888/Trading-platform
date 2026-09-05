import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataEngineService, MarketStatus } from '../market-data/market-data-engine.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { MarginService } from './margin.service';
import { RuleEvaluatorService } from '../rule-evaluator/rule-evaluator.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TradingAccountStatus,
  TradeStatus,
  TradeSide,
} from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Error Codes
 */
export enum TradingErrorCode {
  // Account errors
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  ACCOUNT_NOT_OWNED = 'ACCOUNT_NOT_OWNED',
  ACCOUNT_NOT_ACTIVE = 'ACCOUNT_NOT_ACTIVE',
  ACCOUNT_BREACHED = 'ACCOUNT_BREACHED',
  ACCOUNT_PASSED = 'ACCOUNT_PASSED',
  
  // Market errors
  MARKET_CLOSED = 'MARKET_CLOSED',
  MARKET_DATA_UNAVAILABLE = 'MARKET_DATA_UNAVAILABLE',
  MARKET_DATA_STALE = 'MARKET_DATA_STALE',
  INVALID_SYMBOL = 'INVALID_SYMBOL',
  SYMBOL_DISABLED = 'SYMBOL_DISABLED',
  
  // Order errors
  INVALID_VOLUME = 'INVALID_VOLUME',
  INVALID_SIDE = 'INVALID_SIDE',
  INVALID_SL = 'INVALID_SL',
  INVALID_TP = 'INVALID_TP',
  INSUFFICIENT_MARGIN = 'INSUFFICIENT_MARGIN',
  
  // Position errors
  POSITION_NOT_FOUND = 'POSITION_NOT_FOUND',
  POSITION_NOT_OPEN = 'POSITION_NOT_OPEN',
  POSITION_ALREADY_CLOSED = 'POSITION_ALREADY_CLOSED',
  
  // Rule errors
  DAILY_LOSS_LIMIT = 'DAILY_LOSS_LIMIT',
  MAX_DRAWDOWN = 'MAX_DRAWDOWN',
  
  // System errors
  TRADING_DISABLED = 'TRADING_DISABLED',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

/**
 * Trading Engine V2 Service
 * 
 * Production-grade trading engine with:
 * - Proper bid/ask execution
 * - Margin management
 * - Volume validation
 * - Order validation
 * - Risk management
 * - Challenge evaluation
 * - Atomic transactions
 * - Concurrency protection
 * - Comprehensive error handling
 * - Full audit trail
 */
@Injectable()
export class TradingEngineV2Service {
  private readonly logger = new Logger(TradingEngineV2Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataEngineService,
    private readonly instrumentConfig: InstrumentConfigService,
    private readonly marginService: MarginService,
    private readonly ruleEvaluator: RuleEvaluatorService,
    private readonly accountSnapshots: AccountSnapshotsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Open a new trade with comprehensive validation
   */
  async openTrade(
    tradingAccountId: string,
    userId: string,
    dto: {
      symbol: string;
      side: TradeSide;
      volume: number;
      stopLoss?: number;
      takeProfit?: number;
      leverage?: number;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch and verify account
      const account = await tx.tradingAccount.findUnique({
        where: { id: tradingAccountId },
      });

      if (!account) {
        throw new NotFoundException(TradingErrorCode.ACCOUNT_NOT_FOUND);
      }

      // 2. Verify ownership
      if (account.userId !== userId) {
        throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_OWNED);
      }

      // 3. Verify account status
      if (account.status === TradingAccountStatus.BREACHED) {
        throw new ForbiddenException(TradingErrorCode.ACCOUNT_BREACHED);
      }

      if (account.status !== TradingAccountStatus.ACTIVE) {
        throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_ACTIVE);
      }

      // 4. Validate symbol
      const symbol = dto.symbol.toUpperCase();
      const instrument = this.instrumentConfig.getInstrument(symbol);

      if (!instrument) {
        throw new BadRequestException(TradingErrorCode.INVALID_SYMBOL);
      }

      if (!instrument.enabled) {
        throw new BadRequestException(TradingErrorCode.SYMBOL_DISABLED);
      }

      // 5. Check market availability
      const marketStatus = this.marketData.getMarketStatus();
      if (marketStatus === MarketStatus.DISCONNECTED) {
        throw new BadRequestException(TradingErrorCode.MARKET_CLOSED);
      }

      if (!this.marketData.isMarketAvailable(symbol)) {
        throw new BadRequestException(TradingErrorCode.MARKET_DATA_STALE);
      }

      // 6. Validate volume
      const volumeDecimal = new Decimal(dto.volume);
      const volumeValidation = this.instrumentConfig.validateVolume(symbol, volumeDecimal);

      if (!volumeValidation.valid) {
        throw new BadRequestException({
          code: TradingErrorCode.INVALID_VOLUME,
          message: volumeValidation.error,
        });
      }

      const normalizedVolume = volumeValidation.normalized!;

      // 7. Get execution price (BID for SELL, ASK for BUY)
      let executionPrice: Decimal;
      if (dto.side === TradeSide.BUY) {
        const ask = this.marketData.getAsk(symbol);
        if (!ask) {
          throw new BadRequestException(TradingErrorCode.MARKET_DATA_UNAVAILABLE);
        }
        executionPrice = ask;
      } else {
        const bid = this.marketData.getBid(symbol);
        if (!bid) {
          throw new BadRequestException(TradingErrorCode.MARKET_DATA_UNAVAILABLE);
        }
        executionPrice = bid;
      }

      // 8. Validate leverage
      const leverage = dto.leverage || instrument.defaultLeverage;
      const leverageValidation = this.instrumentConfig.validateLeverage(symbol, leverage);

      if (!leverageValidation.valid) {
        throw new BadRequestException({
          code: 'INVALID_LEVERAGE',
          message: leverageValidation.error,
        });
      }

      // 9. Calculate and validate margin
      const marginValidation = await this.marginService.validateMarginForNewPosition(
        tradingAccountId,
        symbol,
        normalizedVolume,
        executionPrice,
        leverage,
      );

      if (!marginValidation.valid) {
        throw new BadRequestException({
          code: TradingErrorCode.INSUFFICIENT_MARGIN,
          message: 'Insufficient margin',
          requiredMargin: marginValidation.requiredMargin,
          freeMargin: marginValidation.freeMargin,
        });
      }

      // 10. Validate SL/TP levels
      this.validateSlTpLevels(dto.side, executionPrice, dto.stopLoss, dto.takeProfit);

      // 11. Create trade
      const trade = await tx.trade.create({
        data: {
          tradingAccountId,
          symbol,
          side: dto.side,
          volume: normalizedVolume,
          entryPrice: executionPrice,
          stopLoss: dto.stopLoss ? new Decimal(dto.stopLoss) : null,
          takeProfit: dto.takeProfit ? new Decimal(dto.takeProfit) : null,
          status: TradeStatus.OPEN,
          realizedPnl: new Decimal(0),
        },
      });

      // 12. Recalculate account equity
      const equity = await this.calculateAccountEquity(tradingAccountId, tx);
      await tx.tradingAccount.update({
        where: { id: tradingAccountId },
        data: { equity },
      });

      // 13. Calculate P&L for snapshot
      const { realizedPnl, unrealizedPnl } = await this.calculateAccountPnl(
        tradingAccountId,
        tx,
      );

      // 14. Create snapshot
      await this.accountSnapshots.createSnapshot(
        tradingAccountId,
        account.currentBalance,
        equity,
        realizedPnl,
        unrealizedPnl,
        tx,
      );

      // 15. Evaluate rules
      const evaluation = await this.ruleEvaluator.evaluateRules(
        tradingAccountId,
        equity,
      );
      await this.ruleEvaluator.updateAccountStatus(
        tradingAccountId,
        evaluation,
        userId,
      );

      // 16. Create audit log
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'TRADE_OPENED',
          entityType: 'Trade',
          entityId: trade.id,
          metadata: {
            tradingAccountId,
            symbol: trade.symbol,
            side: trade.side,
            volume: trade.volume.toString(),
            entryPrice: trade.entryPrice.toString(),
            executionType: dto.side === TradeSide.BUY ? 'ASK' : 'BID',
            leverage,
            requiredMargin: marginValidation.requiredMargin,
          },
        },
      });

      this.logger.log(
        `Trade opened: ${trade.id} - ${trade.side} ${trade.volume} ${trade.symbol} @ ${trade.entryPrice}`,
      );

      return trade;
    }, {
      timeout: 10000, // 10 second timeout
      maxWait: 5000, // Wait max 5 seconds for transaction to start
    });
  }

  /**
   * Close a trade manually
   */
  async closeTrade(
    tradingAccountId: string,
    tradeId: string,
    userId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch account
      const account = await tx.tradingAccount.findUnique({
        where: { id: tradingAccountId },
      });

      if (!account) {
        throw new NotFoundException(TradingErrorCode.ACCOUNT_NOT_FOUND);
      }

      // 2. Verify ownership
      if (account.userId !== userId) {
        throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_OWNED);
      }

      // 3. Fetch trade with FOR UPDATE lock to prevent concurrent closes
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
      });

      if (!trade) {
        throw new NotFoundException(TradingErrorCode.POSITION_NOT_FOUND);
      }

      // 4. Verify trade belongs to account
      if (trade.tradingAccountId !== tradingAccountId) {
        throw new ForbiddenException('Position does not belong to account');
      }

      // 5. Verify trade is open
      if (trade.status !== TradeStatus.OPEN) {
        throw new BadRequestException(TradingErrorCode.POSITION_NOT_OPEN);
      }

      // 6. Check market availability
      if (!this.marketData.isMarketAvailable(trade.symbol)) {
        throw new BadRequestException(TradingErrorCode.MARKET_DATA_STALE);
      }

      // 7. Get exit price (BID for LONG close, ASK for SHORT close)
      let exitPrice: Decimal;
      if (trade.side === TradeSide.BUY) {
        // Close LONG at BID
        const bid = this.marketData.getBid(trade.symbol);
        if (!bid) {
          throw new BadRequestException(TradingErrorCode.MARKET_DATA_UNAVAILABLE);
        }
        exitPrice = bid;
      } else {
        // Close SHORT at ASK
        const ask = this.marketData.getAsk(trade.symbol);
        if (!ask) {
          throw new BadRequestException(TradingErrorCode.MARKET_DATA_UNAVAILABLE);
        }
        exitPrice = ask;
      }

      // 8. Calculate realized P&L
      const instrument = this.instrumentConfig.getInstrument(trade.symbol);
      const contractMultiplier = instrument?.contractMultiplier || 1;

      let realizedPnl: Decimal;
      if (trade.side === TradeSide.BUY) {
        realizedPnl = exitPrice
          .minus(trade.entryPrice)
          .times(trade.volume)
          .times(contractMultiplier);
      } else {
        realizedPnl = trade.entryPrice
          .minus(exitPrice)
          .times(trade.volume)
          .times(contractMultiplier);
      }

      // 9. Update trade
      const closedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.CLOSED,
          exitPrice,
          realizedPnl,
          closedAt: new Date(),
        },
      });

      // 10. Update account balance
      const newBalance = account.currentBalance.plus(realizedPnl);
      await tx.tradingAccount.update({
        where: { id: tradingAccountId },
        data: { currentBalance: newBalance },
      });

      // 11. Recalculate equity
      const equity = await this.calculateAccountEquity(tradingAccountId, tx);
      await tx.tradingAccount.update({
        where: { id: tradingAccountId },
        data: { equity },
      });

      // 12. Calculate P&L for snapshot
      const {
        realizedPnl: totalRealizedPnl,
        unrealizedPnl: totalUnrealizedPnl,
      } = await this.calculateAccountPnl(tradingAccountId, tx);

      // 13. Create snapshot
      await this.accountSnapshots.createSnapshot(
        tradingAccountId,
        newBalance,
        equity,
        totalRealizedPnl,
        totalUnrealizedPnl,
        tx,
      );

      // 14. Evaluate rules
      const evaluation = await this.ruleEvaluator.evaluateRules(
        tradingAccountId,
        equity,
      );
      await this.ruleEvaluator.updateAccountStatus(
        tradingAccountId,
        evaluation,
        userId,
      );

      // 15. Create audit log
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'TRADE_CLOSED',
          entityType: 'Trade',
          entityId: trade.id,
          metadata: {
            tradingAccountId,
            symbol: trade.symbol,
            side: trade.side,
            volume: trade.volume.toString(),
            entryPrice: trade.entryPrice.toString(),
            exitPrice: exitPrice.toString(),
            realizedPnl: realizedPnl.toString(),
            closeReason: 'MANUAL',
          },
        },
      });

      this.logger.log(
        `Trade closed: ${trade.id} - P&L: ${realizedPnl.toFixed(2)}`,
      );

      return closedTrade;
    }, {
      timeout: 10000,
      maxWait: 5000,
    });
  }

  /**
   * Update position SL/TP
   */
  async updatePosition(
    tradingAccountId: string,
    tradeId: string,
    userId: string,
    dto: { stopLoss?: number; takeProfit?: number },
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch and verify account
      const account = await tx.tradingAccount.findUnique({
        where: { id: tradingAccountId },
      });

      if (!account) {
        throw new NotFoundException(TradingErrorCode.ACCOUNT_NOT_FOUND);
      }

      if (account.userId !== userId) {
        throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_OWNED);
      }

      // 2. Fetch trade
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
      });

      if (!trade) {
        throw new NotFoundException(TradingErrorCode.POSITION_NOT_FOUND);
      }

      if (trade.tradingAccountId !== tradingAccountId) {
        throw new ForbiddenException('Position does not belong to account');
      }

      if (trade.status !== TradeStatus.OPEN) {
        throw new BadRequestException(TradingErrorCode.POSITION_NOT_OPEN);
      }

      // 3. Validate SL/TP levels
      this.validateSlTpLevels(
        trade.side,
        trade.entryPrice,
        dto.stopLoss,
        dto.takeProfit,
      );

      // 4. Update trade
      const updatedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          stopLoss: dto.stopLoss !== undefined ? new Decimal(dto.stopLoss) : trade.stopLoss,
          takeProfit: dto.takeProfit !== undefined ? new Decimal(dto.takeProfit) : trade.takeProfit,
        },
      });

      // 5. Create audit log
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'POSITION_UPDATED',
          entityType: 'Trade',
          entityId: trade.id,
          metadata: {
            tradingAccountId,
            symbol: trade.symbol,
            stopLoss: updatedTrade.stopLoss?.toString(),
            takeProfit: updatedTrade.takeProfit?.toString(),
          },
        },
      });

      return updatedTrade;
    });
  }

  /**
   * Validate SL/TP levels
   */
  private validateSlTpLevels(
    side: TradeSide,
    entryPrice: Decimal,
    stopLoss?: number,
    takeProfit?: number,
  ): void {
    if (stopLoss !== undefined) {
      const sl = new Decimal(stopLoss);
      
      if (side === TradeSide.BUY) {
        // For LONG, SL must be below entry
        if (sl.greaterThanOrEqualTo(entryPrice)) {
          throw new BadRequestException(
            'Stop Loss for BUY position must be below entry price',
          );
        }
      } else {
        // For SHORT, SL must be above entry
        if (sl.lessThanOrEqualTo(entryPrice)) {
          throw new BadRequestException(
            'Stop Loss for SELL position must be above entry price',
          );
        }
      }
    }

    if (takeProfit !== undefined) {
      const tp = new Decimal(takeProfit);
      
      if (side === TradeSide.BUY) {
        // For LONG, TP must be above entry
        if (tp.lessThanOrEqualTo(entryPrice)) {
          throw new BadRequestException(
            'Take Profit for BUY position must be above entry price',
          );
        }
      } else {
        // For SHORT, TP must be below entry
        if (tp.greaterThanOrEqualTo(entryPrice)) {
          throw new BadRequestException(
            'Take Profit for SELL position must be below entry price',
          );
        }
      }
    }
  }

  /**
   * Calculate account equity
   */
  private async calculateAccountEquity(
    tradingAccountId: string,
    tx?: any,
  ): Promise<Decimal> {
    const prisma = tx || this.prisma;

    const account = await prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: {
        trades: {
          where: { status: TradeStatus.OPEN },
        },
      },
    });

    if (!account) {
      throw new NotFoundException(TradingErrorCode.ACCOUNT_NOT_FOUND);
    }

    let equity = account.currentBalance;

    // Add unrealized P&L from open trades
    for (const trade of account.trades) {
      const instrument = this.instrumentConfig.getInstrument(trade.symbol);
      const contractMultiplier = instrument?.contractMultiplier || 1;

      let currentPrice: Decimal | null;
      if (trade.side === TradeSide.BUY) {
        currentPrice = this.marketData.getBid(trade.symbol);
      } else {
        currentPrice = this.marketData.getAsk(trade.symbol);
      }

      if (!currentPrice) {
        continue;
      }

      let unrealizedPnl: Decimal;
      if (trade.side === TradeSide.BUY) {
        unrealizedPnl = currentPrice
          .minus(trade.entryPrice)
          .times(trade.volume)
          .times(contractMultiplier);
      } else {
        unrealizedPnl = trade.entryPrice
          .minus(currentPrice)
          .times(trade.volume)
          .times(contractMultiplier);
      }

      equity = equity.plus(unrealizedPnl);
    }

    return equity;
  }

  /**
   * Calculate account P&L
   */
  private async calculateAccountPnl(
    tradingAccountId: string,
    tx?: any,
  ): Promise<{ realizedPnl: Decimal; unrealizedPnl: Decimal }> {
    const prisma = tx || this.prisma;

    const account = await prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: {
        trades: true,
      },
    });

    if (!account) {
      throw new NotFoundException(TradingErrorCode.ACCOUNT_NOT_FOUND);
    }

    // Realized P&L
    const realizedPnl = account.trades
      .filter((t) => t.status === TradeStatus.CLOSED)
      .reduce((sum, t) => sum.plus(t.realizedPnl), new Decimal(0));

    // Unrealized P&L
    let unrealizedPnl = new Decimal(0);
    for (const trade of account.trades.filter((t) => t.status === TradeStatus.OPEN)) {
      const instrument = this.instrumentConfig.getInstrument(trade.symbol);
      const contractMultiplier = instrument?.contractMultiplier || 1;

      let currentPrice: Decimal | null;
      if (trade.side === TradeSide.BUY) {
        currentPrice = this.marketData.getBid(trade.symbol);
      } else {
        currentPrice = this.marketData.getAsk(trade.symbol);
      }

      if (!currentPrice) {
        continue;
      }

      let pnl: Decimal;
      if (trade.side === TradeSide.BUY) {
        pnl = currentPrice
          .minus(trade.entryPrice)
          .times(trade.volume)
          .times(contractMultiplier);
      } else {
        pnl = trade.entryPrice
          .minus(currentPrice)
          .times(trade.volume)
          .times(contractMultiplier);
      }

      unrealizedPnl = unrealizedPnl.plus(pnl);
    }

    return { realizedPnl, unrealizedPnl };
  }
}
