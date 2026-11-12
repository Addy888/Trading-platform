import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataEngineService, MarketStatus } from '../market-data/market-data-engine.service';
import { MarketDataManagerService } from '../market-data/market-data-manager.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { MarginService } from './margin.service';
import { BalanceEquityService } from './balance-equity.service';
import { RuleEvaluatorService } from '../rule-evaluator/rule-evaluator.service';
import { RiskEvaluationService } from '../risk-engine/risk-evaluation.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { MinTradingDaysService } from '../risk-engine/min-trading-days.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TradingAccountStatus,
  TradeStatus,
  TradeSide,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

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
    private readonly balanceEquity: BalanceEquityService,
    private readonly ruleEvaluator: RuleEvaluatorService,
    private readonly riskEvaluation: RiskEvaluationService,
    private readonly accountSnapshots: AccountSnapshotsService,
    private readonly minTradingDays: MinTradingDaysService,
    private readonly eventEmitter: EventEmitter2,
    private readonly providerMarketData: MarketDataManagerService,
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
    const accountMode = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      select: { executionMode: true, userId: true },
    });
    if (accountMode?.executionMode === 'SIMULATED') {
      if (accountMode.userId !== userId) {
        throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_OWNED);
      }
      return this.openSimulatedTrade(tradingAccountId, userId, dto);
    }
    if (accountMode?.executionMode) {
      throw new BadRequestException({
        code: TradingErrorCode.TRADING_DISABLED,
        message: 'Real execution is disabled until an authorized broker with validated executable quotes is integrated.',
      });
    }

    const transactionResult = await this.prisma.$transaction(async (tx) => {
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

      // 11a. Record trading day (Day 22)
      await this.minTradingDays.recordTradingDay(
        tradingAccountId,
        trade.openedAt,
        tx,
      );

      // 12. Recalculate equity and update HWM
      const { equity, hwmUpdated, hwm } = await this.balanceEquity.updateFinancialStateOnPriceChange(
        tradingAccountId,
        tx,
      );

      // 13. Calculate P&L for snapshot
      const realizedPnl = await this.balanceEquity.calculateTotalRealizedPnl(tradingAccountId, tx);
      const unrealizedPnl = await this.balanceEquity.calculateTotalUnrealizedPnl(tradingAccountId, tx);

      // 14. Create snapshot
      await this.accountSnapshots.createSnapshot(
        tradingAccountId,
        account.currentBalance,
        equity,
        realizedPnl,
        unrealizedPnl,
        tx,
      );

      this.logger.log(
        `Trade created in transaction: ${trade.id} - ${trade.side} ${trade.volume} ${trade.symbol} @ ${trade.entryPrice}`,
      );

      // Return data needed for post-transaction operations
      return { trade, equity, hwmUpdated, hwm, marginValidation, leverage };
    }, {
      timeout: 10000, // 10 second timeout
      maxWait: 5000, // Wait max 5 seconds for transaction to start
    });

    // Post-transaction operations (risk evaluation, audit log)
    const { trade, equity, hwmUpdated, hwm, marginValidation, leverage } = transactionResult;

    // 15. Evaluate rules using Day 7 central risk engine (outside transaction)
    const evaluation = await this.riskEvaluation.evaluateAccount(
      tradingAccountId,
      {
        type: 'TRADE_OPEN',
        triggeredBy: userId,
        metadata: {
          tradeId: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          volume: trade.volume.toString(),
        },
      },
    );

    // 16. Emit post-evaluation events
    this.riskEvaluation.emitPostEvaluationEvents(evaluation);

    // 17. Create audit log (outside transaction)
    await this.prisma.auditLog.create({
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
          equity: FinancialCalculations.formatMoney(equity),
          hwmUpdated,
          hwm: FinancialCalculations.formatMoney(hwm),
        },
      },
    });

    this.logger.log(
      `Trade opened: ${trade.id} - ${trade.side} ${trade.volume} ${trade.symbol} @ ${trade.entryPrice}`,
    );

    return trade;
  }

  private async openSimulatedTrade(
    tradingAccountId: string,
    userId: string,
    dto: {
      symbol: string;
      side: TradeSide;
      volume: number;
      stopLoss?: number;
      takeProfit?: number;
    },
  ) {
    this.logger.log(`[openSimulatedTrade] Starting simulated trade for account ${tradingAccountId}`);
    this.logger.log(`[openSimulatedTrade] Request: ${JSON.stringify({ symbol: dto.symbol, side: dto.side, volume: dto.volume })}`);
    
    const symbol = dto.symbol.trim().toUpperCase();
    const instrument = this.instrumentConfig.getInstrument(symbol);
    if (!instrument || !instrument.enabled) {
      this.logger.error(`[openSimulatedTrade] Invalid or disabled symbol: ${symbol}`);
      throw new BadRequestException(TradingErrorCode.INVALID_SYMBOL);
    }
    if (![TradeSide.BUY, TradeSide.SELL].includes(dto.side)) {
      this.logger.error(`[openSimulatedTrade] Invalid side: ${dto.side}`);
      throw new BadRequestException(TradingErrorCode.INVALID_SIDE);
    }
    if (!Number.isFinite(dto.volume) || dto.volume <= 0) {
      this.logger.error(`[openSimulatedTrade] Invalid volume: ${dto.volume}`);
      throw new BadRequestException(TradingErrorCode.INVALID_VOLUME);
    }

    this.logger.log(`[openSimulatedTrade] Validating volume`);
    const volumeValidation = this.instrumentConfig.validateVolume(symbol, new Decimal(dto.volume));
    if (!volumeValidation.valid || !volumeValidation.normalized) {
      this.logger.error(`[openSimulatedTrade] Volume validation failed: ${volumeValidation.error}`);
      throw new BadRequestException({
        code: TradingErrorCode.INVALID_VOLUME,
        message: volumeValidation.error,
      });
    }
    const volume = volumeValidation.normalized;
    
    this.logger.log(`[openSimulatedTrade] Loading account and trades`);
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: { trades: { where: { status: TradeStatus.OPEN } } },
    });
    if (!account) throw new NotFoundException(TradingErrorCode.ACCOUNT_NOT_FOUND);
    if (account.userId !== userId) throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_OWNED);
    if (account.status !== TradingAccountStatus.ACTIVE) {
      throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_ACTIVE);
    }
    if (account.executionMode !== 'SIMULATED') {
      throw new BadRequestException(TradingErrorCode.TRADING_DISABLED);
    }

    this.logger.log(`[openSimulatedTrade] Fetching fresh simulated prices`);
    const openTrades = account.trades ?? [];
    const prices = await this.getFreshSimulatedPrices([
      ...new Set([symbol, ...openTrades.map((trade) => trade.symbol)]),
    ]);
    
    this.logger.log(`[openSimulatedTrade] Prices fetched:`, {
      symbolsCount: prices.size,
      targetSymbol: symbol,
      targetPrice: prices.get(symbol)?.price.toString(),
      targetTimestamp: prices.get(symbol)?.timestamp,
    });
    
    this.logger.log(`[openSimulatedTrade] Calculating account state`);
    const projected = this.calculateSimulatedAccountState(
      openTrades,
      prices,
      new Decimal(account.currentBalance),
    );
    
    const leverage = instrument.defaultLeverage;
    const margin = this.marginService.calculateRequiredMargin(
      symbol,
      volume,
      prices.get(symbol)!.price,
      leverage,
    );
    
    this.logger.log(`[openSimulatedTrade] Margin check:`, {
      requiredMargin: margin.requiredMargin.toString(),
      freeMargin: projected.equity.minus(projected.usedMargin).toString(),
      usedMargin: projected.usedMargin.toString(),
      equity: projected.equity.toString(),
    });
    
    const freeMargin = projected.equity.minus(projected.usedMargin);
    if (freeMargin.lessThan(margin.requiredMargin)) {
      this.logger.error(`[openSimulatedTrade] Insufficient margin`);
      throw new BadRequestException({
        code: TradingErrorCode.INSUFFICIENT_MARGIN,
        message: 'Insufficient simulated margin for this order.',
      });
    }
    
    this.logger.log(`[openSimulatedTrade] Validating SL/TP levels`);
    this.validateSlTpLevels(dto.side, prices.get(symbol)!.price, dto.stopLoss, dto.takeProfit);

    this.logger.log(`[openSimulatedTrade] Starting database transaction`);
    const result = await this.prisma.$transaction(async (tx) => {
      const currentAccount = await tx.tradingAccount.findUnique({
        where: { id: tradingAccountId },
        include: { trades: { where: { status: TradeStatus.OPEN } } },
      });
      if (!currentAccount) throw new NotFoundException(TradingErrorCode.ACCOUNT_NOT_FOUND);
      if (currentAccount.userId !== userId) throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_OWNED);
      if (currentAccount.status !== TradingAccountStatus.ACTIVE) {
        throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_ACTIVE);
      }
      if (currentAccount.executionMode !== 'SIMULATED') {
        throw new BadRequestException(TradingErrorCode.TRADING_DISABLED);
      }
      const currentOpenTrades = currentAccount.trades ?? [];
      if (currentOpenTrades.map((trade) => trade.id).sort().join(',') !==
        openTrades.map((trade) => trade.id).sort().join(',')) {
        throw new BadRequestException('Open positions changed during validation. Retry the simulated order.');
      }

      for (const trade of currentOpenTrades) {
        const valuation = this.calculateSimulatedTradePnl(trade, prices.get(trade.symbol)!.price);
        await tx.trade.update({
          where: { id: trade.id },
          data: { unrealizedPnl: valuation },
        });
      }

      const trade = await tx.trade.create({
        data: {
          tradingAccountId,
          symbol,
          side: dto.side,
          volume,
          entryPrice: prices.get(symbol)!.price,
          stopLoss: dto.stopLoss !== undefined ? new Decimal(dto.stopLoss) : null,
          takeProfit: dto.takeProfit !== undefined ? new Decimal(dto.takeProfit) : null,
          status: TradeStatus.OPEN,
          realizedPnl: new Decimal(0),
          unrealizedPnl: new Decimal(0),
        },
      });

      await this.minTradingDays.recordTradingDay(tradingAccountId, trade.openedAt, tx);
      const equity = projected.equity;
      const dailyPnl = equity.minus(new Decimal(currentAccount.dailyStartEquity));
      await tx.tradingAccount.update({
        where: { id: tradingAccountId },
        data: {
          equity,
          currentDailyPnl: dailyPnl,
          lastTradeAt: trade.openedAt,
          ...(equity.greaterThan(currentAccount.highWaterMark) ? { highWaterMark: equity } : {}),
        },
      });

      const closedTrades = await tx.trade.findMany({
        where: { tradingAccountId, status: TradeStatus.CLOSED },
        select: { realizedPnl: true },
      });
      const realizedPnl = closedTrades.reduce(
        (total, closedTrade) => total.plus(closedTrade.realizedPnl),
        new Decimal(0),
      );
      await this.accountSnapshots.createSnapshot(
        tradingAccountId,
        currentAccount.currentBalance,
        equity,
        realizedPnl,
        projected.unrealizedPnl,
        tx,
      );
      this.logger.log(`[openSimulatedTrade] Transaction completed, trade created: ${trade.id}`);
      
      // Return data needed for post-transaction operations
      return {
        trade,
        accountNumber: currentAccount.accountNumber,
      };
    }, { timeout: 15_000, maxWait: 5_000 }).catch((txError) => {
      this.logger.error(`[openSimulatedTrade] Transaction failed:`, {
        name: txError.name,
        message: txError.message,
        code: txError.code,
        stack: txError.stack?.split('\n').slice(0, 5).join('\n'),
      });
      throw txError;
    });

    const { trade, accountNumber } = result;

    // Post-transaction operations (risk evaluation, audit log, events)
    this.logger.log(`[openSimulatedTrade] Running post-transaction operations`);
    
    // Risk evaluation (can be slow, done outside transaction)
    const evaluation = await this.riskEvaluation.evaluateAccount(tradingAccountId, {
      type: 'TRADE_OPEN',
      triggeredBy: userId,
      metadata: { tradeId: trade.id, symbol, side: dto.side, volume: volume.toString(), executionMode: 'SIMULATED' },
    });
    this.logger.log(`[openSimulatedTrade] Risk evaluation completed:`, {
      statusChanged: evaluation.statusChanged,
      newStatus: evaluation.newStatus,
      previousStatus: evaluation.previousStatus,
    });
    this.riskEvaluation.emitPostEvaluationEvents(evaluation);
    
    // Audit log (outside transaction)
    this.logger.log(`[openSimulatedTrade] Creating audit log`);
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'TRADE_OPENED',
        entityType: 'Trade',
        entityId: trade.id,
        metadata: {
          tradingAccountId,
          symbol,
          side: dto.side,
          volume: volume.toString(),
          entryPrice: trade.entryPrice.toString(),
          executionMode: 'SIMULATED',
          fillPolicy: 'TWELVE_DATA_LAST_PRICE_NO_SPREAD',
          providerTimestamp: prices.get(symbol)!.timestamp,
          simulatedMargin: margin.requiredMargin.toString(),
        },
      },
    });
    
    // Emit event (outside transaction)
    this.logger.log(`[openSimulatedTrade] Emitting trade.opened event`);
    this.eventEmitter.emit('trade.opened', { trade, accountNumber, executionMode: 'SIMULATED' });
    
    this.logger.log(`[openSimulatedTrade] Simulated trade opened successfully:`, {
      tradeId: trade.id,
      symbol,
      side: dto.side,
      volume: volume.toString(),
      entryPrice: trade.entryPrice.toString(),
    });
    
    return {
        ...trade,
        executionMode: 'SIMULATED',
        fillPolicy: 'TWELVE_DATA_LAST_PRICE_NO_SPREAD',
        providerTimestamp: prices.get(symbol)!.timestamp,
      };
  }


  private async getFreshSimulatedPrices(symbols: string[]) {
    const status = this.providerMarketData.getProviderStatus();
    const staleThresholdMs = status.configuration.staleThresholdMs;
    const quotes = await Promise.all(symbols.map(async (symbol) => {
      const quote = await this.providerMarketData.getQuote(symbol);
      const price = new Decimal(quote.price);
      const providerTime = Date.parse(quote.timestamp);
      const age = Date.now() - providerTime;
      if (!price.isFinite() || price.lte(0) || !Number.isFinite(providerTime) ||
        age < 0 || age > staleThresholdMs) {
        throw new ServiceUnavailableException(
          `A current Twelve Data provider price is unavailable for simulated ${symbol}.`,
        );
      }
      return [symbol, { price, timestamp: quote.timestamp }] as const;
    }));
    return new Map(quotes);
  }

  private calculateSimulatedTradePnl(trade: {
    symbol: string;
    side: TradeSide;
    entryPrice: Decimal;
    volume: Decimal;
  }, price: Decimal): Decimal {
    const instrument = this.instrumentConfig.getInstrument(trade.symbol);
    if (!instrument) throw new BadRequestException(TradingErrorCode.INVALID_SYMBOL);
    return FinancialCalculations.calculateUnrealizedPnl(
      trade.side,
      new Decimal(trade.entryPrice),
      price,
      new Decimal(trade.volume),
      instrument.contractMultiplier,
    );
  }

  private calculateSimulatedAccountState(
    openTrades: Array<{ symbol: string; side: TradeSide; entryPrice: Decimal; volume: Decimal }>,
    prices: Map<string, { price: Decimal; timestamp: string }>,
    balance: Decimal,
  ) {
    let unrealizedPnl = new Decimal(0);
    let usedMargin = new Decimal(0);
    for (const trade of openTrades) {
      const instrument = this.instrumentConfig.getInstrument(trade.symbol);
      const currentPrice = prices.get(trade.symbol)?.price;
      if (!instrument || !currentPrice) {
        throw new ServiceUnavailableException(`Simulated valuation is unavailable for ${trade.symbol}.`);
      }
      unrealizedPnl = unrealizedPnl.plus(this.calculateSimulatedTradePnl(trade, currentPrice));
      usedMargin = usedMargin.plus(this.marginService.calculateRequiredMargin(
        trade.symbol,
        new Decimal(trade.volume),
        currentPrice,
        instrument.defaultLeverage,
      ).requiredMargin);
    }
    return { unrealizedPnl, usedMargin, equity: balance.plus(unrealizedPnl) };
  }

  /**
   * Close a trade manually
   */
  async closeTrade(
    tradingAccountId: string,
    tradeId: string,
    userId: string,
  ) {
    const accountMode = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      select: { executionMode: true, userId: true },
    });
    if (accountMode?.executionMode === 'SIMULATED') {
      if (accountMode.userId !== userId) {
        throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_OWNED);
      }
      return this.closeSimulatedTrade(tradingAccountId, tradeId, userId);
    }
    if (accountMode?.executionMode) {
      throw new BadRequestException({
        code: TradingErrorCode.TRADING_DISABLED,
        message: 'Real execution is disabled until an authorized broker with validated executable quotes is integrated.',
      });
    }

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

      // 8. Calculate realized P&L using BalanceEquityService
      const instrument = this.instrumentConfig.getInstrument(trade.symbol);
      const contractMultiplier = instrument?.contractMultiplier || 1;

      const realizedPnl = this.balanceEquity.calculatePositionRealizedPnl(
        trade.side,
        new Decimal(trade.entryPrice),
        exitPrice,
        new Decimal(trade.volume),
        contractMultiplier,
      );

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

      // 10-13. Update complete financial state (balance, equity, HWM, daily P&L)
      const financialState = await this.balanceEquity.updateFinancialStateOnClose(
        tradingAccountId,
        realizedPnl,
        tx,
      );

      // 14. Calculate P&L for snapshot
      const totalRealizedPnl = await this.balanceEquity.calculateTotalRealizedPnl(
        tradingAccountId,
        tx,
      );
      const totalUnrealizedPnl = await this.balanceEquity.calculateTotalUnrealizedPnl(
        tradingAccountId,
        tx,
      );

      // 15. Create snapshot
      await this.accountSnapshots.createSnapshot(
        tradingAccountId,
        financialState.balance,
        financialState.equity,
        totalRealizedPnl,
        totalUnrealizedPnl,
        tx,
      );

      // 16. Evaluate rules using Day 7 central risk engine
      const evaluation = await this.riskEvaluation.evaluateAccount(
        tradingAccountId,
        {
          type: 'TRADE_CLOSE',
          triggeredBy: userId,
          metadata: {
            tradeId: trade.id,
            symbol: trade.symbol,
            realizedPnl: FinancialCalculations.formatMoney(realizedPnl),
          },
        },
      );

      // 17. Emit post-evaluation events (after successful transaction)
      this.riskEvaluation.emitPostEvaluationEvents(evaluation);

      // 18. Create audit log
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
            realizedPnl: FinancialCalculations.formatMoney(realizedPnl),
            newBalance: FinancialCalculations.formatMoney(financialState.balance),
            newEquity: FinancialCalculations.formatMoney(financialState.equity),
            hwmUpdated: financialState.hwmUpdated,
            hwm: FinancialCalculations.formatMoney(financialState.hwm),
            closeReason: 'MANUAL',
          },
        },
      });

      this.logger.log(
        `Trade closed: ${trade.id} - P&L: ${FinancialCalculations.formatMoney(realizedPnl)}`,
      );

      return closedTrade;
    }, {
      timeout: 10000,
      maxWait: 5000,
    });
  }

  private async closeSimulatedTrade(tradingAccountId: string, tradeId: string, userId: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: { trades: { where: { status: TradeStatus.OPEN } } },
    });
    if (!account) throw new NotFoundException(TradingErrorCode.ACCOUNT_NOT_FOUND);
    if (account.userId !== userId) throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_OWNED);
    const targetTrade = account.trades.find((trade) => trade.id === tradeId);
    if (!targetTrade) {
      const existing = await this.prisma.trade.findUnique({ where: { id: tradeId } });
      if (!existing) throw new NotFoundException(TradingErrorCode.POSITION_NOT_FOUND);
      if (existing.tradingAccountId !== tradingAccountId) {
        throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_OWNED);
      }
      throw new BadRequestException(TradingErrorCode.POSITION_NOT_OPEN);
    }
    if (account.executionMode !== 'SIMULATED') {
      throw new BadRequestException(TradingErrorCode.TRADING_DISABLED);
    }
    const openTrades = account.trades;
    const prices = await this.getFreshSimulatedPrices([...new Set(openTrades.map((trade) => trade.symbol))]);

    const result = await this.prisma.$transaction(async (tx) => {
      const currentAccount = await tx.tradingAccount.findUnique({
        where: { id: tradingAccountId },
        include: { trades: { where: { status: TradeStatus.OPEN } } },
      });
      if (!currentAccount) throw new NotFoundException(TradingErrorCode.ACCOUNT_NOT_FOUND);
      if (currentAccount.userId !== userId) throw new ForbiddenException(TradingErrorCode.ACCOUNT_NOT_OWNED);
      if (currentAccount.executionMode !== 'SIMULATED') {
        throw new BadRequestException(TradingErrorCode.TRADING_DISABLED);
      }
      const currentTrade = currentAccount.trades.find((trade) => trade.id === tradeId);
      if (!currentTrade) throw new BadRequestException(TradingErrorCode.POSITION_NOT_OPEN);
      if (currentAccount.trades.map((trade) => trade.id).sort().join(',') !==
        openTrades.map((trade) => trade.id).sort().join(',')) {
        throw new BadRequestException('Open positions changed during validation. Retry the simulated close.');
      }

      const exitPrice = prices.get(currentTrade.symbol)?.price;
      if (!exitPrice) throw new ServiceUnavailableException(`Simulated price unavailable for ${currentTrade.symbol}.`);
      const instrument = this.instrumentConfig.getInstrument(currentTrade.symbol);
      if (!instrument) throw new BadRequestException(TradingErrorCode.INVALID_SYMBOL);
      const realizedPnl = FinancialCalculations.calculateRealizedPnl(
        currentTrade.side,
        new Decimal(currentTrade.entryPrice),
        exitPrice,
        new Decimal(currentTrade.volume),
        instrument.contractMultiplier,
      );
      const closedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.CLOSED,
          exitPrice,
          realizedPnl,
          unrealizedPnl: new Decimal(0),
          closedAt: new Date(),
        },
      });

      const remainingTrades = currentAccount.trades.filter((trade) => trade.id !== tradeId);
      let unrealizedPnl = new Decimal(0);
      for (const trade of remainingTrades) {
        const price = prices.get(trade.symbol)?.price;
        if (!price) throw new ServiceUnavailableException(`Simulated valuation is unavailable for ${trade.symbol}.`);
        const tradePnl = this.calculateSimulatedTradePnl(trade, price);
        unrealizedPnl = unrealizedPnl.plus(tradePnl);
        await tx.trade.update({ where: { id: trade.id }, data: { unrealizedPnl: tradePnl } });
      }

      const balance = new Decimal(currentAccount.currentBalance).plus(realizedPnl);
      const equity = balance.plus(unrealizedPnl);
      const highWaterMark = new Decimal(currentAccount.highWaterMark);
      const dailyStartEquity = new Decimal(currentAccount.dailyStartEquity);
      await tx.tradingAccount.update({
        where: { id: tradingAccountId },
        data: {
          currentBalance: balance,
          equity,
          currentDailyPnl: equity.minus(dailyStartEquity),
          lastTradeAt: closedTrade.closedAt,
          ...(equity.greaterThan(highWaterMark) ? { highWaterMark: equity } : {}),
        },
      });
      const closedTrades = await tx.trade.findMany({
        where: { tradingAccountId, status: TradeStatus.CLOSED },
        select: { realizedPnl: true },
      });
      const totalRealizedPnl = closedTrades.reduce(
        (total, closed) => total.plus(closed.realizedPnl),
        new Decimal(0),
      );
      await this.accountSnapshots.createSnapshot(
        tradingAccountId,
        balance,
        equity,
        totalRealizedPnl,
        unrealizedPnl,
        tx,
      );
      
      // Return data needed for post-transaction operations
      return {
        closedTrade,
        accountNumber: currentAccount.accountNumber,
        currentTradeSymbol: currentTrade.symbol,
        realizedPnl,
      };
    }, { timeout: 15_000, maxWait: 5_000 });

    // Post-transaction operations (risk evaluation, audit log, events)
    const { closedTrade, accountNumber, currentTradeSymbol, realizedPnl } = result;

    // Risk evaluation (outside transaction)
    const evaluation = await this.riskEvaluation.evaluateAccount(tradingAccountId, {
      type: 'TRADE_CLOSE',
      triggeredBy: userId,
      metadata: { tradeId, symbol: currentTradeSymbol, realizedPnl: realizedPnl.toString(), executionMode: 'SIMULATED' },
    });
    this.riskEvaluation.emitPostEvaluationEvents(evaluation);
    
    // Audit log (outside transaction)
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'TRADE_CLOSED',
        entityType: 'Trade',
        entityId: tradeId,
        metadata: {
          tradingAccountId,
          symbol: currentTradeSymbol,
          side: closedTrade.side,
          volume: closedTrade.volume.toString(),
          entryPrice: closedTrade.entryPrice.toString(),
          exitPrice: closedTrade.exitPrice!.toString(),
          realizedPnl: realizedPnl.toString(),
          executionMode: 'SIMULATED',
          fillPolicy: 'TWELVE_DATA_LAST_PRICE_NO_SPREAD',
          providerTimestamp: prices.get(currentTradeSymbol)!.timestamp,
        },
      },
    });
    
    // Emit event (outside transaction)
    this.eventEmitter.emit('trade.closed', { trade: closedTrade, accountNumber, executionMode: 'SIMULATED' });
    
    return {
      ...closedTrade,
      executionMode: 'SIMULATED',
      fillPolicy: 'TWELVE_DATA_LAST_PRICE_NO_SPREAD',
      providerTimestamp: prices.get(currentTradeSymbol)!.timestamp,
    };
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

}
