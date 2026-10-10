import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MarketPriceService } from '../market-data/market-price.service';
import { MarketDataEngineService, MarketTick } from '../market-data/market-data-engine.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { BalanceEquityService } from '../trading-engine/balance-equity.service';
import { RiskEvaluationService } from '../risk-engine/risk-evaluation.service';
import { ChallengeProgressService } from '../challenge-progress/challenge-progress.service';
import { TradeStatus, TradeSide, TradingAccountStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

/**
 * Realtime Service
 * 
 * Responsible for:
 * - Listening to market price updates
 * - Finding affected trading accounts
 * - Recalculating unrealized PnL
 * - Recalculating account equity
 * - Triggering challenge progress updates
 * - Emitting WebSocket events
 * 
 * Architecture:
 * - Event-driven (listens to market.prices.updated)
 * - Efficient querying (only affected accounts)
 * - Batched operations where practical
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly CONTRACT_MULTIPLIER = 1;
  private tradingGateway: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketPrice: MarketPriceService,
    private readonly marketDataEngine: MarketDataEngineService,
    private readonly instrumentConfig: InstrumentConfigService,
    private readonly balanceEquity: BalanceEquityService,
    private readonly riskEvaluation: RiskEvaluationService,
    private readonly challengeProgress: ChallengeProgressService,
  ) {}

  /**
   * Set trading gateway (injected after construction to avoid circular dependency)
   */
  setTradingGateway(gateway: any) {
    this.tradingGateway = gateway;
  }

  /**
   * Handle market price updates (legacy - from SimulatedMarketEngineService)
   * 
   * This is triggered by SimulatedMarketEngineService
   */
  @OnEvent('market.prices.updated')
  async handleMarketPriceUpdateLegacy(event: {
    prices: Array<{ symbol: string; price: string }>;
    timestamp: Date;
    source: string;
  }) {
    try {
      // Get all symbols that were updated
      const updatedSymbols = event.prices.map((p) => p.symbol);

      // Find all accounts with open trades for these symbols
      const affectedAccounts = await this.findAffectedAccounts(updatedSymbols);

      this.logger.debug(
        `Market update (legacy) for ${updatedSymbols.length} symbols, ${affectedAccounts.length} accounts affected`,
      );

      // Process each affected account
      for (const accountId of affectedAccounts) {
        await this.updateAccountRealtime(accountId);
      }
    } catch (error) {
      this.logger.error(`Error handling market price update (legacy): ${(error as Error).message}`);
    }
  }

  /**
   * Handle market tick updates (new - from MarketDataEngineService)
   */
  @OnEvent('market.tick')
  async handleMarketTick(event: {
    ticks: MarketTick[];
    timestamp: Date;
    source: string;
  }) {
    try {
      // Get all symbols that were updated
      const updatedSymbols = event.ticks.map((t) => t.symbol);

      // Find all accounts with open trades for these symbols
      const affectedAccounts = await this.findAffectedAccounts(updatedSymbols);

      this.logger.debug(
        `Market tick for ${updatedSymbols.length} symbols, ${affectedAccounts.length} accounts affected`,
      );

      // Process each affected account
      for (const accountId of affectedAccounts) {
        await this.updateAccountRealtime(accountId);
      }
    } catch (error) {
      this.logger.error(`Error handling market tick: ${(error as Error).message}`);
    }
  }

  /**
   * Find accounts with open trades for given symbols
   */
  private async findAffectedAccounts(symbols: string[]): Promise<string[]> {
    const trades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.OPEN,
        symbol: {
          in: symbols,
        },
      },
      select: {
        tradingAccountId: true,
      },
      distinct: ['tradingAccountId'],
    });

    return trades.map((t) => t.tradingAccountId);
  }

  /**
   * Update account with real-time data
   * 
   * Calculates and emits:
   * - Account equity
   * - Unrealized PnL
   * - Position updates
   * - Challenge progress
   */
  async updateAccountRealtime(accountId: string) {
    try {
      // Fetch account with open trades
      const account = await this.prisma.tradingAccount.findUnique({
        where: { id: accountId },
        include: {
          trades: {
            where: { status: TradeStatus.OPEN },
          },
        },
      });

      if (!account) {
        return;
      }

      // Calculate unrealized PnL and equity
      let totalUnrealizedPnl = new Decimal(0);
      const positionUpdates = [];

      for (const trade of account.trades) {
        const currentPrice = this.marketPrice.getPrice(trade.symbol);
        const instrument = this.instrumentConfig.getInstrument(trade.symbol);
        const contractMultiplier = instrument?.contractMultiplier || 1;
        
        const unrealizedPnl = this.balanceEquity.calculatePositionUnrealizedPnl(
          trade.side,
          new Decimal(trade.entryPrice),
          currentPrice,
          new Decimal(trade.volume),
          contractMultiplier,
        );
        
        totalUnrealizedPnl = FinancialCalculations.add(totalUnrealizedPnl, unrealizedPnl);

        // Day 14: Update trade unrealizedPnl field for persistence
        // Note: This is done without waiting to avoid blocking real-time updates
        // Any failures are logged but don't interrupt the update flow
        this.updateTradeUnrealizedPnl(trade.id, unrealizedPnl).catch((err) => {
          this.logger.warn(`Failed to update unrealizedPnl for trade ${trade.id}: ${err.message}`);
        });

        positionUpdates.push({
          tradeId: trade.id,
          accountId: account.id,
          symbol: trade.symbol,
          side: trade.side,
          volume: trade.volume.toString(),
          entryPrice: trade.entryPrice.toString(),
          currentPrice: currentPrice.toString(),
          unrealizedPnl: FinancialCalculations.formatMoney(unrealizedPnl),
          updatedAt: new Date(),
        });
      }

      // Calculate equity and update HWM
      const { equity, hwmUpdated, hwm } = await this.balanceEquity.updateFinancialStateOnPriceChange(
        accountId,
      );

      // Note: Risk evaluation is NOT performed on every market tick to avoid excessive DB writes.
      // Risk evaluation happens on trade open/close (critical path).
      // Market ticks only update HWM and WebSocket state for real-time display.
      // If account status is ACTIVE and has EQUITY-based rules, those rules will be
      // evaluated on the next trade action when equity-affecting events occur.

      // Calculate total PnL
      const realizedPnl = await this.balanceEquity.calculateTotalRealizedPnl(accountId);
      const totalPnl = FinancialCalculations.add(realizedPnl, totalUnrealizedPnl);

      // Emit account update event via WebSocket gateway
      if (this.tradingGateway) {
        this.tradingGateway.emitAccountUpdate(accountId, {
          accountId: account.id,
          accountNumber: account.accountNumber,
          currentBalance: FinancialCalculations.formatMoney(account.currentBalance),
          equity: FinancialCalculations.formatMoney(equity),
          unrealizedPnl: FinancialCalculations.formatMoney(totalUnrealizedPnl),
          realizedPnl: FinancialCalculations.formatMoney(realizedPnl),
          totalPnl: FinancialCalculations.formatMoney(totalPnl),
          highWaterMark: FinancialCalculations.formatMoney(hwm),
          hwmUpdated,
          status: account.status,
          updatedAt: new Date(),
        });

        // Emit position updates
        for (const position of positionUpdates) {
          this.tradingGateway.emitPositionUpdate(accountId, position);
        }
      }

      // Update challenge progress
      await this.updateChallengeProgress(accountId, equity);
    } catch (error) {
      this.logger.error(`Error updating account ${accountId}: ${(error as Error).message}`);
    }
  }

  /**
   * Update challenge progress and emit event
   */
  private async updateChallengeProgress(accountId: string, equity: Decimal) {
    try {
      const progress = await this.challengeProgress.getChallengeProgress(accountId);
      
      if (progress && this.tradingGateway) {
        // Transform to WebSocket event format
        const challengeUpdate = {
          accountId,
          profitTarget: progress.rules.profitTarget ? {
            target: progress.rules.profitTarget.requiredProfit,
            current: progress.rules.profitTarget.currentProfit,
            percentage: new Decimal(progress.rules.profitTarget.progressPercentage).toNumber(),
            achieved: progress.rules.profitTarget.completed,
          } : undefined,
          dailyLoss: progress.rules.dailyLoss ? {
            limit: progress.rules.dailyLoss.dailyLossLimit,
            current: progress.rules.dailyLoss.currentDailyLoss,
            percentage: new Decimal(progress.rules.dailyLoss.usagePercentage).toNumber(),
            breached: progress.rules.dailyLoss.breached,
          } : undefined,
          maxDrawdown: progress.rules.maxDrawdown ? {
            limit: progress.rules.maxDrawdown.maximumAllowedLoss,
            current: progress.rules.maxDrawdown.currentDrawdown,
            percentage: new Decimal(progress.rules.maxDrawdown.usagePercentage).toNumber(),
            breached: progress.rules.maxDrawdown.breached,
          } : undefined,
          minTradingDays: progress.rules.minimumTradingDays ? {
            required: progress.rules.minimumTradingDays.requiredTradingDays,
            current: progress.rules.minimumTradingDays.completedTradingDays,
            achieved: progress.rules.minimumTradingDays.completed,
          } : undefined,
          updatedAt: new Date(),
        };
        
        this.tradingGateway.emitChallengeUpdate(accountId, challengeUpdate);
      }
    } catch (error) {
      this.logger.error(`Error updating challenge progress for ${accountId}: ${(error as Error).message}`);
    }
  }

  /**
   * Update trade unrealizedPnl field
   * 
   * Day 14: Persist unrealizedPnl to database for consistency
   * This runs async and doesn't block real-time updates
   */
  private async updateTradeUnrealizedPnl(tradeId: string, unrealizedPnl: Decimal): Promise<void> {
    try {
      await this.prisma.trade.update({
        where: { id: tradeId },
        data: { unrealizedPnl },
      });
    } catch (error) {
      // Log but don't throw - we don't want to break real-time updates
      this.logger.debug(`Could not update unrealizedPnl for trade ${tradeId}: ${(error as Error).message}`);
    }
  }

  /**
   * Handle trade opened event
   */
  @OnEvent('trade.opened')
  handleTradeOpened(payload: { trade: any; accountNumber: string }) {
    this.emitTradeOpened(payload.trade, payload.accountNumber);
  }

  /**
   * Handle trade closed event
   */
  @OnEvent('trade.closed')
  handleTradeClosed(payload: { trade: any; accountNumber: string }) {
    this.emitTradeClosed(payload.trade, payload.accountNumber);
  }

  /**
   * Emit trade opened event
   */
  private emitTradeOpened(trade: any, accountNumber: string) {
    if (!this.tradingGateway) return;

    this.tradingGateway.emitTradeOpened(trade.tradingAccountId, {
      tradeId: trade.id,
      accountId: trade.tradingAccountId,
      accountNumber,
      symbol: trade.symbol,
      side: trade.side,
      volume: trade.volume.toString(),
      entryPrice: trade.entryPrice.toString(),
      stopLoss: trade.stopLoss?.toString(),
      takeProfit: trade.takeProfit?.toString(),
      openedAt: trade.openedAt,
    });
  }

  /**
   * Emit trade closed event
   */
  private emitTradeClosed(trade: any, accountNumber: string) {
    if (!this.tradingGateway) return;

    this.tradingGateway.emitTradeClosed(trade.tradingAccountId, {
      tradeId: trade.id,
      accountId: trade.tradingAccountId,
      accountNumber,
      symbol: trade.symbol,
      side: trade.side,
      volume: trade.volume.toString(),
      entryPrice: trade.entryPrice.toString(),
      exitPrice: trade.exitPrice?.toString() || '0',
      realizedPnl: trade.realizedPnl.toFixed(2),
      closedAt: trade.closedAt || new Date(),
    });
  }

  /**
   * Emit account status change event
   */
  emitAccountStatusChange(
    accountId: string,
    accountNumber: string,
    previousStatus: string,
    newStatus: string,
    reason?: string,
  ) {
    if (!this.tradingGateway) return;

    this.tradingGateway.emitAccountStatus(accountId, {
      accountId,
      accountNumber,
      previousStatus,
      newStatus,
      reason,
      timestamp: new Date(),
    });
  }
}
