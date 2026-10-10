import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketPriceService } from '../market-data/market-price.service';
import { RuleEvaluatorService } from '../rule-evaluator/rule-evaluator.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { MinTradingDaysService } from '../risk-engine/min-trading-days.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TradingAccountStatus,
  TradeStatus,
  TradeSide,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { OpenTradeDto } from './dto/open-trade.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

/**
 * Trading Engine Service
 * 
 * Core business logic for:
 * - Opening trades
 * - Closing trades
 * - Calculating PnL
 * - Updating account balance and equity
 * - Triggering rule evaluation
 * - Creating account snapshots
 * - Emitting real-time WebSocket events via EventEmitter (Day 8)
 */
@Injectable()
export class TradingEngineService {
  private readonly logger = new Logger(TradingEngineService.name);
  private readonly CONTRACT_MULTIPLIER = 1; // Default for Day 6

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketPrice: MarketPriceService,
    private readonly ruleEvaluator: RuleEvaluatorService,
    private readonly accountSnapshots: AccountSnapshotsService,
    private readonly minTradingDays: MinTradingDaysService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Open a new trade
   */
  async openTrade(
    tradingAccountId: string,
    userId: string,
    dto: OpenTradeDto,
  ) {
    // 1. Fetch and verify account
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    // 2. Verify ownership
    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this trading account');
    }

    // 3. Verify account status
    if (account.status !== TradingAccountStatus.ACTIVE) {
      throw new ForbiddenException(
        `Cannot open trade. Account status is ${account.status}`,
      );
    }

    // 4. Validate symbol
    if (!this.marketPrice.isSymbolSupported(dto.symbol)) {
      throw new BadRequestException(
        `Symbol ${dto.symbol} is not supported. Available symbols: ${this.marketPrice.getSupportedSymbols().join(', ')}`,
      );
    }

    // 5. Get current market price
    const entryPrice = this.marketPrice.getPrice(dto.symbol);

    // 6. Create trade
    const trade = await this.prisma.trade.create({
      data: {
        tradingAccountId,
        symbol: dto.symbol.toUpperCase(),
        side: dto.side,
        volume: new Decimal(dto.volume),
        entryPrice,
        stopLoss: dto.stopLoss ? new Decimal(dto.stopLoss) : null,
        takeProfit: dto.takeProfit ? new Decimal(dto.takeProfit) : null,
        status: TradeStatus.OPEN,
        realizedPnl: new Decimal(0),
      },
    });

    // 7. Record trading day (Day 22)
    await this.minTradingDays.recordTradingDay(tradingAccountId, trade.openedAt);

    // 8. Recalculate equity
    const equity = await this.calculateAccountEquity(tradingAccountId);
    const updatedAccount = await this.prisma.tradingAccount.update({
      where: { id: tradingAccountId },
      data: { equity },
    });

    // 9. Calculate PnL for snapshot
    const { realizedPnl, unrealizedPnl } = await this.calculateAccountPnl(tradingAccountId);

    // 10. Create snapshot after trade opened
    await this.accountSnapshots.createSnapshot(
      tradingAccountId,
      updatedAccount.currentBalance,
      equity,
      realizedPnl,
      unrealizedPnl,
    );

    // 11. Evaluate rules
    const evaluation = await this.ruleEvaluator.evaluateRules(
      tradingAccountId,
      equity,
    );
    await this.ruleEvaluator.updateAccountStatus(
      tradingAccountId,
      evaluation,
      userId,
    );

    // 12. Create audit log
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
        },
      },
    });

    this.logger.log(
      `Trade opened: ${trade.id} - ${trade.side} ${trade.volume} ${trade.symbol} @ ${trade.entryPrice}`,
    );

    // Emit real-time trade opened event (Day 8)
    this.eventEmitter.emit('trade.opened', {
      trade,
      accountNumber: updatedAccount.accountNumber,
    });

    return trade;
  }

  /**
   * Close an open trade
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
        throw new NotFoundException('Trading account not found');
      }

      // 2. Verify ownership
      if (account.userId !== userId) {
        throw new ForbiddenException('You do not own this trading account');
      }

      // 3. Fetch trade
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
      });

      if (!trade) {
        throw new NotFoundException('Trade not found');
      }

      // 4. Verify trade belongs to account
      if (trade.tradingAccountId !== tradingAccountId) {
        throw new ForbiddenException('Trade does not belong to this account');
      }

      // 5. Verify trade is open
      if (trade.status !== TradeStatus.OPEN) {
        throw new BadRequestException('Trade is not open');
      }

      // 6. Get current market price
      const exitPrice = this.marketPrice.getPrice(trade.symbol);

      // 7. Calculate realized PnL
      const realizedPnl = this.calculateRealizedPnl(
        trade.side,
        trade.entryPrice,
        exitPrice,
        trade.volume,
      );

      // 8. Update trade
      const closedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.CLOSED,
          exitPrice,
          realizedPnl,
          closedAt: new Date(),
        },
      });

      // 9. Update account balance
      const newBalance = account.currentBalance.plus(realizedPnl);
      await tx.tradingAccount.update({
        where: { id: tradingAccountId },
        data: { currentBalance: newBalance },
      });

      // 10. Recalculate equity
      const equity = await this.calculateAccountEquity(tradingAccountId, tx);
      const updatedAccount = await tx.tradingAccount.update({
        where: { id: tradingAccountId },
        data: { equity },
      });

      // 11. Calculate PnL for snapshot
      const { realizedPnl: totalRealizedPnl, unrealizedPnl: totalUnrealizedPnl } = 
        await this.calculateAccountPnl(tradingAccountId, tx);

      // 12. Create snapshot after trade closed
      await this.accountSnapshots.createSnapshot(
        tradingAccountId,
        updatedAccount.currentBalance,
        equity,
        totalRealizedPnl,
        totalUnrealizedPnl,
        tx,
      );

      // 13. Evaluate rules
      const evaluation = await this.ruleEvaluator.evaluateRules(
        tradingAccountId,
        equity,
      );
      await this.ruleEvaluator.updateAccountStatus(
        tradingAccountId,
        evaluation,
        userId,
      );

      // 14. Create audit log
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
          },
        },
      });

      this.logger.log(
        `Trade closed: ${trade.id} - PnL: ${realizedPnl.toFixed(2)}`,
      );

      // Emit real-time trade closed event (Day 8)
      this.eventEmitter.emit('trade.closed', {
        trade: closedTrade,
        accountNumber: account.accountNumber,
      });

      return closedTrade;
    });
  }

  /**
   * Calculate realized PnL for a closed trade
   */
  private calculateRealizedPnl(
    side: TradeSide,
    entryPrice: Decimal,
    exitPrice: Decimal,
    volume: Decimal,
  ): Decimal {
    let pnl: Decimal;

    if (side === TradeSide.BUY) {
      // BUY: profit when price goes up
      pnl = exitPrice.minus(entryPrice).times(volume).times(this.CONTRACT_MULTIPLIER);
    } else {
      // SELL: profit when price goes down
      pnl = entryPrice.minus(exitPrice).times(volume).times(this.CONTRACT_MULTIPLIER);
    }

    return pnl;
  }

  /**
   * Calculate unrealized PnL for an open trade
   */
  calculateUnrealizedPnl(
    side: TradeSide,
    entryPrice: Decimal,
    currentPrice: Decimal,
    volume: Decimal,
  ): Decimal {
    let pnl: Decimal;

    if (side === TradeSide.BUY) {
      pnl = currentPrice.minus(entryPrice).times(volume).times(this.CONTRACT_MULTIPLIER);
    } else {
      pnl = entryPrice.minus(currentPrice).times(volume).times(this.CONTRACT_MULTIPLIER);
    }

    return pnl;
  }

  /**
   * Calculate account equity
   * Equity = Current Balance + Sum of Unrealized PnL from open trades
   */
  async calculateAccountEquity(
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
      throw new NotFoundException('Trading account not found');
    }

    // Start with current balance
    let equity = account.currentBalance;

    // Add unrealized PnL from open trades
    for (const trade of account.trades) {
      const currentPrice = this.marketPrice.getPrice(trade.symbol);
      const unrealizedPnl = this.calculateUnrealizedPnl(
        trade.side,
        trade.entryPrice,
        currentPrice,
        trade.volume,
      );
      equity = equity.plus(unrealizedPnl);
    }

    return equity;
  }

  /**
   * Calculate total account PnL (realized + unrealized)
   */
  async calculateAccountPnl(
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
      throw new NotFoundException('Trading account not found');
    }

    // Calculate realized PnL
    const realizedPnl = account.trades
      .filter((t) => t.status === TradeStatus.CLOSED)
      .reduce((sum, t) => sum.plus(t.realizedPnl), new Decimal(0));

    // Calculate unrealized PnL
    let unrealizedPnl = new Decimal(0);
    for (const trade of account.trades.filter((t) => t.status === TradeStatus.OPEN)) {
      const currentPrice = this.marketPrice.getPrice(trade.symbol);
      const pnl = this.calculateUnrealizedPnl(
        trade.side,
        trade.entryPrice,
        currentPrice,
        trade.volume,
      );
      unrealizedPnl = unrealizedPnl.plus(pnl);
    }

    return { realizedPnl, unrealizedPnl };
  }

  /**
   * Get account performance
   */
  async getAccountPerformance(tradingAccountId: string, userId: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: {
        trades: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this trading account');
    }

    // Calculate metrics
    const totalTrades = account.trades.length;
    const openTrades = account.trades.filter((t) => t.status === TradeStatus.OPEN).length;
    const closedTrades = account.trades.filter((t) => t.status === TradeStatus.CLOSED).length;

    const totalRealizedPnl = account.trades
      .filter((t) => t.status === TradeStatus.CLOSED)
      .reduce((sum, t) => sum.plus(t.realizedPnl), new Decimal(0));

    // Calculate unrealized PnL
    let totalUnrealizedPnl = new Decimal(0);
    for (const trade of account.trades.filter((t) => t.status === TradeStatus.OPEN)) {
      const currentPrice = this.marketPrice.getPrice(trade.symbol);
      const unrealizedPnl = this.calculateUnrealizedPnl(
        trade.side,
        trade.entryPrice,
        currentPrice,
        trade.volume,
      );
      totalUnrealizedPnl = totalUnrealizedPnl.plus(unrealizedPnl);
    }

    const totalPnl = totalRealizedPnl.plus(totalUnrealizedPnl);
    const returnPercentage = totalPnl
      .dividedBy(account.initialBalance)
      .times(100);

    return {
      accountNumber: account.accountNumber,
      initialBalance: account.initialBalance.toFixed(2),
      currentBalance: account.currentBalance.toFixed(2),
      equity: account.equity.toFixed(2),
      totalTrades,
      openTrades,
      closedTrades,
      totalRealizedPnl: totalRealizedPnl.toFixed(2),
      totalUnrealizedPnl: totalUnrealizedPnl.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      returnPercentage: returnPercentage.toFixed(2),
      accountStatus: account.status,
    };
  }

  /**
   * Get open positions
   */
  async getOpenPositions(tradingAccountId: string, userId: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this trading account');
    }

    const openTrades = await this.prisma.trade.findMany({
      where: {
        tradingAccountId,
        status: TradeStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });

    return openTrades.map((trade) => {
      const currentPrice = this.marketPrice.getPrice(trade.symbol);
      const unrealizedPnl = this.calculateUnrealizedPnl(
        trade.side,
        trade.entryPrice,
        currentPrice,
        trade.volume,
      );

      return {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        volume: trade.volume.toString(),
        entryPrice: trade.entryPrice.toString(),
        currentPrice: currentPrice.toString(),
        unrealizedPnl: unrealizedPnl.toFixed(2),
        stopLoss: trade.stopLoss?.toString(),
        takeProfit: trade.takeProfit?.toString(),
        openedAt: trade.openedAt,
        priceSource: this.marketPrice.getPriceSource(),
      };
    });
  }

  /**
   * Get trade history
   */
  async getTradeHistory(
    tradingAccountId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: TradeStatus,
  ) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this trading account');
    }

    const where: any = { tradingAccountId };
    if (status) {
      where.status = status;
    }

    const [trades, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.trade.count({ where }),
    ]);

    return {
      trades: trades.map((trade) => ({
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        volume: trade.volume.toString(),
        entryPrice: trade.entryPrice.toString(),
        exitPrice: trade.exitPrice?.toString(),
        realizedPnl: trade.realizedPnl.toFixed(2),
        status: trade.status,
        openedAt: trade.openedAt,
        closedAt: trade.closedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update position SL/TP
   */
  async updatePosition(
    tradingAccountId: string,
    tradeId: string,
    userId: string,
    dto: UpdatePositionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch account
      const account = await tx.tradingAccount.findUnique({
        where: { id: tradingAccountId },
      });

      if (!account) {
        throw new NotFoundException('Trading account not found');
      }

      // 2. Verify ownership
      if (account.userId !== userId) {
        throw new ForbiddenException('You do not own this trading account');
      }

      // 3. Fetch trade
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
      });

      if (!trade) {
        throw new NotFoundException('Trade not found');
      }

      // 4. Verify trade belongs to account
      if (trade.tradingAccountId !== tradingAccountId) {
        throw new ForbiddenException('Trade does not belong to this account');
      }

      // 5. Verify trade is open
      if (trade.status !== TradeStatus.OPEN) {
        throw new BadRequestException('Trade is not open');
      }

      // 6. Update SL/TP
      const updatedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          stopLoss: dto.stopLoss ? new Decimal(dto.stopLoss) : trade.stopLoss,
          takeProfit: dto.takeProfit ? new Decimal(dto.takeProfit) : trade.takeProfit,
          updatedAt: new Date(),
        },
      });

      // 7. Create audit log
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

      this.logger.log(`Position updated: ${trade.id} - SL: ${dto.stopLoss}, TP: ${dto.takeProfit}`);

      // Emit real-time position update event
      this.eventEmitter.emit('position.updated', {
        trade: updatedTrade,
        accountNumber: account.accountNumber,
      });

      return {
        id: updatedTrade.id,
        symbol: updatedTrade.symbol,
        side: updatedTrade.side,
        volume: updatedTrade.volume.toString(),
        entryPrice: updatedTrade.entryPrice.toString(),
        stopLoss: updatedTrade.stopLoss?.toString(),
        takeProfit: updatedTrade.takeProfit?.toString(),
        status: updatedTrade.status,
        openedAt: updatedTrade.openedAt,
      };
    });
  }
}
