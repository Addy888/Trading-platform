import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentConfigService } from '../market-data/instrument-config.service';
import { MarketDataEngineService } from '../market-data/market-data-engine.service';
import { TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Account Margin Information
 */
export interface AccountMargin {
  accountId: string;
  balance: Decimal;
  equity: Decimal;
  usedMargin: Decimal;
  freeMargin: Decimal;
  marginLevel: Decimal; // Equity / Used Margin * 100
  openPositions: number;
}

/**
 * Margin Service
 * 
 * Manages margin calculations and validation.
 * Ensures accounts have sufficient margin before opening positions.
 * Tracks used and free margin.
 */
@Injectable()
export class MarginService {
  private readonly logger = new Logger(MarginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instrumentConfig: InstrumentConfigService,
    private readonly marketData: MarketDataEngineService,
  ) {}

  /**
   * Calculate margin required for a new position
   */
  calculateRequiredMargin(
    symbol: string,
    volume: Decimal,
    price: Decimal,
    leverage?: number,
  ): Decimal {
    return this.instrumentConfig.calculateMarginRequirement(
      symbol,
      volume,
      price,
      leverage,
    );
  }

  /**
   * Calculate account margin information
   */
  async calculateAccountMargin(accountId: string): Promise<AccountMargin> {
    // Get account with open trades
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      include: {
        trades: {
          where: { status: TradeStatus.OPEN },
        },
      },
    });

    if (!account) {
      throw new Error('Trading account not found');
    }

    // Calculate used margin from open positions
    let usedMargin = new Decimal(0);

    for (const trade of account.trades) {
      const instrument = this.instrumentConfig.getInstrument(trade.symbol);
      if (!instrument) {
        this.logger.warn(`Unknown instrument: ${trade.symbol}`);
        continue;
      }

      // Get current price for mark-to-market
      const currentPrice = this.marketData.getMidPrice(trade.symbol);
      if (!currentPrice) {
        this.logger.warn(`No price available for: ${trade.symbol}`);
        continue;
      }

      // Calculate margin for this position
      const positionMargin = this.instrumentConfig.calculateMarginRequirement(
        trade.symbol,
        trade.volume,
        currentPrice,
        instrument.defaultLeverage,
      );

      usedMargin = usedMargin.plus(positionMargin);
    }

    // Calculate unrealized P&L
    let unrealizedPnl = new Decimal(0);
    for (const trade of account.trades) {
      const pnl = this.calculateUnrealizedPnl(trade);
      unrealizedPnl = unrealizedPnl.plus(pnl);
    }

    // Calculate equity
    const balance = account.currentBalance;
    const equity = balance.plus(unrealizedPnl);

    // Calculate free margin
    const freeMargin = equity.minus(usedMargin);

    // Calculate margin level (% of equity to used margin)
    const marginLevel = usedMargin.isZero()
      ? new Decimal(0)
      : equity.dividedBy(usedMargin).times(100);

    return {
      accountId,
      balance,
      equity,
      usedMargin,
      freeMargin,
      marginLevel,
      openPositions: account.trades.length,
    };
  }

  /**
   * Calculate unrealized P&L for a trade
   */
  private calculateUnrealizedPnl(trade: any): Decimal {
    const instrument = this.instrumentConfig.getInstrument(trade.symbol);
    if (!instrument) {
      return new Decimal(0);
    }

    // Get current price based on side
    let currentPrice: Decimal | null;
    if (trade.side === 'BUY') {
      // LONG position closes at BID
      currentPrice = this.marketData.getBid(trade.symbol);
    } else {
      // SHORT position closes at ASK
      currentPrice = this.marketData.getAsk(trade.symbol);
    }

    if (!currentPrice) {
      return new Decimal(0);
    }

    // Calculate P&L
    let pnl: Decimal;
    if (trade.side === 'BUY') {
      // BUY: profit when price goes up
      pnl = currentPrice
        .minus(trade.entryPrice)
        .times(trade.volume)
        .times(instrument.contractMultiplier);
    } else {
      // SELL: profit when price goes down
      pnl = trade.entryPrice
        .minus(currentPrice)
        .times(trade.volume)
        .times(instrument.contractMultiplier);
    }

    return pnl;
  }

  /**
   * Check if account has sufficient margin
   */
  async hasSufficientMargin(
    accountId: string,
    requiredMargin: Decimal,
  ): Promise<{ sufficient: boolean; freeMargin: Decimal }> {
    const marginInfo = await this.calculateAccountMargin(accountId);

    return {
      sufficient: marginInfo.freeMargin.greaterThanOrEqualTo(requiredMargin),
      freeMargin: marginInfo.freeMargin,
    };
  }

  /**
   * Validate margin before opening position
   */
  async validateMarginForNewPosition(
    accountId: string,
    symbol: string,
    volume: Decimal,
    price: Decimal,
    leverage?: number,
  ): Promise<{
    valid: boolean;
    error?: string;
    requiredMargin?: string;
    freeMargin?: string;
  }> {
    // Calculate required margin
    const requiredMargin = this.calculateRequiredMargin(
      symbol,
      volume,
      price,
      leverage,
    );

    // Check if sufficient
    const { sufficient, freeMargin } = await this.hasSufficientMargin(
      accountId,
      requiredMargin,
    );

    if (!sufficient) {
      return {
        valid: false,
        error: 'INSUFFICIENT_MARGIN',
        requiredMargin: requiredMargin.toFixed(2),
        freeMargin: freeMargin.toFixed(2),
      };
    }

    return {
      valid: true,
      requiredMargin: requiredMargin.toFixed(2),
      freeMargin: freeMargin.toFixed(2),
    };
  }
}
