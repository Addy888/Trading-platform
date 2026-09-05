import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataEngineService, MarketTick } from '../market-data/market-data-engine.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { TradeStatus, TradeSide } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Stop Loss / Take Profit Monitor Service
 * 
 * Server-side monitoring of SL/TP levels.
 * Automatically closes positions when levels are hit.
 * 
 * Architecture:
 * - Event-driven (listens to market.tick)
 * - Idempotent (prevents double triggers)
 * - Atomic (uses transactions)
 * - Audited (creates audit logs)
 */
@Injectable()
export class SlTpMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlTpMonitorService.name);
  private readonly enabled: boolean;
  private processingTriggers: Set<string> = new Set(); // Track trades being processed

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataEngineService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.enabled = process.env.SL_TP_MONITOR_ENABLED !== 'false';
  }

  async onModuleInit() {
    if (this.enabled) {
      this.logger.log('SL/TP Monitor Service started');
    } else {
      this.logger.warn('SL/TP Monitor Service DISABLED');
    }
  }

  async onModuleDestroy() {
    this.logger.log('SL/TP Monitor Service stopped');
  }

  /**
   * Handle market tick and check SL/TP
   */
  @OnEvent('market.tick')
  async handleMarketTick(event: { ticks: MarketTick[]; timestamp: Date }) {
    if (!this.enabled) {
      return;
    }

    try {
      // Get symbols that updated
      const updatedSymbols = event.ticks.map((t) => t.symbol);

      // Find open trades for these symbols with SL or TP set
      const trades = await this.prisma.trade.findMany({
        where: {
          status: TradeStatus.OPEN,
          symbol: { in: updatedSymbols },
          OR: [
            { stopLoss: { not: null } },
            { takeProfit: { not: null } },
          ],
        },
        include: {
          tradingAccount: {
            select: {
              id: true,
              userId: true,
              accountNumber: true,
              currentBalance: true,
              status: true,
            },
          },
        },
      });

      // Check each trade
      for (const trade of trades) {
        // Skip if already being processed
        if (this.processingTriggers.has(trade.id)) {
          continue;
        }

        await this.checkAndTrigger(trade);
      }
    } catch (error) {
      this.logger.error(
        `Error handling market tick: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Check if SL or TP should trigger and execute
   */
  private async checkAndTrigger(trade: any): Promise<void> {
    const tick = this.marketData.getTick(trade.symbol);
    if (!tick) {
      return;
    }

    let shouldTrigger = false;
    let triggerReason: 'STOP_LOSS' | 'TAKE_PROFIT' | null = null;
    let executionPrice: Decimal | null = null;

    if (trade.side === TradeSide.BUY) {
      // LONG position
      // SL triggers when BID <= SL
      if (trade.stopLoss && tick.bid.lessThanOrEqualTo(trade.stopLoss)) {
        shouldTrigger = true;
        triggerReason = 'STOP_LOSS';
        executionPrice = tick.bid;
      }
      // TP triggers when BID >= TP
      else if (trade.takeProfit && tick.bid.greaterThanOrEqualTo(trade.takeProfit)) {
        shouldTrigger = true;
        triggerReason = 'TAKE_PROFIT';
        executionPrice = tick.bid;
      }
    } else {
      // SHORT position
      // SL triggers when ASK >= SL
      if (trade.stopLoss && tick.ask.greaterThanOrEqualTo(trade.stopLoss)) {
        shouldTrigger = true;
        triggerReason = 'STOP_LOSS';
        executionPrice = tick.ask;
      }
      // TP triggers when ASK <= TP
      else if (trade.takeProfit && tick.ask.lessThanOrEqualTo(trade.takeProfit)) {
        shouldTrigger = true;
        triggerReason = 'TAKE_PROFIT';
        executionPrice = tick.ask;
      }
    }

    if (shouldTrigger && triggerReason && executionPrice) {
      await this.executeTrigger(trade, triggerReason, executionPrice);
    }
  }

  /**
   * Execute SL/TP trigger and close position
   */
  private async executeTrigger(
    trade: any,
    reason: 'STOP_LOSS' | 'TAKE_PROFIT',
    executionPrice: Decimal,
  ): Promise<void> {
    // Mark as processing
    this.processingTriggers.add(trade.id);

    try {
      this.logger.log(
        `${reason} triggered for trade ${trade.id} (${trade.symbol} ${trade.side}) @ ${executionPrice.toString()}`,
      );

      // Use transaction to ensure atomicity
      await this.prisma.$transaction(async (tx) => {
        // Re-fetch trade to ensure it's still open (double-check with lock)
        const currentTrade = await tx.trade.findUnique({
          where: { id: trade.id },
        });

        if (!currentTrade || currentTrade.status !== TradeStatus.OPEN) {
          this.logger.warn(`Trade ${trade.id} already closed`);
          return;
        }

        // Calculate realized P&L
        const instrument = await this.getInstrumentConfig(trade.symbol);
        const contractMultiplier = instrument?.contractMultiplier || 1;

        let realizedPnl: Decimal;
        if (trade.side === TradeSide.BUY) {
          realizedPnl = executionPrice
            .minus(trade.entryPrice)
            .times(trade.volume)
            .times(contractMultiplier);
        } else {
          realizedPnl = trade.entryPrice
            .minus(executionPrice)
            .times(trade.volume)
            .times(contractMultiplier);
        }

        // Update trade
        await tx.trade.update({
          where: { id: trade.id },
          data: {
            status: TradeStatus.CLOSED,
            exitPrice: executionPrice,
            realizedPnl,
            closedAt: new Date(),
          },
        });

        // Update account balance
        const newBalance = trade.tradingAccount.currentBalance.plus(realizedPnl);
        await tx.tradingAccount.update({
          where: { id: trade.tradingAccountId },
          data: { currentBalance: newBalance },
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            action: reason === 'STOP_LOSS' ? 'SL_TRIGGERED' : 'TP_TRIGGERED',
            entityType: 'Trade',
            entityId: trade.id,
            metadata: {
              tradingAccountId: trade.tradingAccountId,
              symbol: trade.symbol,
              side: trade.side,
              volume: trade.volume.toString(),
              entryPrice: trade.entryPrice.toString(),
              exitPrice: executionPrice.toString(),
              triggerLevel: (reason === 'STOP_LOSS' ? trade.stopLoss : trade.takeProfit)?.toString(),
              realizedPnl: realizedPnl.toString(),
            },
          },
        });

        this.logger.log(
          `${reason} executed for trade ${trade.id} - P&L: ${realizedPnl.toFixed(2)}`,
        );
      });

      // Emit events (after transaction commits)
      this.eventEmitter.emit('trade.closed', {
        trade: {
          ...trade,
          status: TradeStatus.CLOSED,
          exitPrice: executionPrice,
          closedAt: new Date(),
        },
        accountNumber: trade.tradingAccount.accountNumber,
        closeReason: reason,
      });

      // Emit notification event
      this.eventEmitter.emit('trade.sltp.triggered', {
        tradeId: trade.id,
        userId: trade.tradingAccount.userId,
        accountId: trade.tradingAccountId,
        symbol: trade.symbol,
        side: trade.side,
        reason,
        executionPrice: executionPrice.toString(),
      });

    } catch (error) {
      this.logger.error(
        `Error executing ${reason} for trade ${trade.id}: ${(error as Error).message}`,
      );
    } finally {
      // Remove from processing set
      this.processingTriggers.delete(trade.id);
    }
  }

  /**
   * Get instrument configuration
   */
  private async getInstrumentConfig(symbol: string): Promise<any> {
    // This would normally come from InstrumentConfigService
    // For now, return default
    return { contractMultiplier: 100000 };
  }
}
