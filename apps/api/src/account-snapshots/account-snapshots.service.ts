import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Decimal from 'decimal.js';

/**
 * Account Snapshots Service
 * 
 * Captures point-in-time snapshots of trading account state
 * for performance history and analytics.
 * 
 * Snapshots are created on meaningful events:
 * - Account created
 * - Trade opened
 * - Trade closed
 * - Account passed
 * - Account breached
 */
@Injectable()
export class AccountSnapshotsService {
  private readonly logger = new Logger(AccountSnapshotsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a snapshot of the trading account
   * @param tradingAccountId Trading account ID
   * @param balance Current balance
   * @param equity Current equity
   * @param realizedPnl Total realized PnL
   * @param unrealizedPnl Total unrealized PnL
   * @param tx Optional transaction
   */
  async createSnapshot(
    tradingAccountId: string,
    balance: Decimal,
    equity: Decimal,
    realizedPnl: Decimal,
    unrealizedPnl: Decimal,
    tx?: any,
  ): Promise<void> {
    const prisma = tx || this.prisma;

    const totalPnl = realizedPnl.plus(unrealizedPnl);

    try {
      await prisma.accountSnapshot.create({
        data: {
          tradingAccountId,
          balance,
          equity,
          realizedPnl,
          unrealizedPnl,
          totalPnl,
        },
      });

      this.logger.debug(
        `Snapshot created for account ${tradingAccountId}: Balance=${balance.toFixed(2)}, Equity=${equity.toFixed(2)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create snapshot for account ${tradingAccountId}`,
        error instanceof Error ? error.stack : String(error),
      );
      // Don't throw - snapshot failures should not break core trading flow
    }
  }

  /**
   * Get equity history for a trading account
   * @param tradingAccountId Trading account ID
   * @param range Optional time range: '7d', '30d', or 'all'
   */
  async getEquityHistory(tradingAccountId: string, range?: string) {
    let where: any = { tradingAccountId };

    if (range && range !== 'all') {
      const daysMap: Record<string, number> = {
        '7d': 7,
        '30d': 30,
      };

      const days = daysMap[range];
      if (days) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        where.createdAt = { gte: startDate };
      }
    }

    const snapshots = await this.prisma.accountSnapshot.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        balance: true,
        equity: true,
        totalPnl: true,
        realizedPnl: true,
        unrealizedPnl: true,
        createdAt: true,
      },
    });

    return snapshots.map((snapshot) => ({
      timestamp: snapshot.createdAt,
      balance: snapshot.balance.toFixed(2),
      equity: snapshot.equity.toFixed(2),
      totalPnl: snapshot.totalPnl.toFixed(2),
      realizedPnl: snapshot.realizedPnl.toFixed(2),
      unrealizedPnl: snapshot.unrealizedPnl.toFixed(2),
    }));
  }

  /**
   * Get the latest snapshot for an account
   * @param tradingAccountId Trading account ID
   */
  async getLatestSnapshot(tradingAccountId: string) {
    return this.prisma.accountSnapshot.findFirst({
      where: { tradingAccountId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
