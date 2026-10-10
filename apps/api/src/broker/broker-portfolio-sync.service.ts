import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerConnectionService } from './broker-connection.service';
import { AngelOnePortfolioAdapter } from './providers/angelone/angelone-portfolio.adapter';
import Decimal from 'decimal.js';

/**
 * Broker Portfolio Synchronization Service
 * 
 * Day 4: Real Broker Positions, Portfolio Sync & Live P&L
 * 
 * Responsibilities:
 * - Fetch portfolio data from broker (positions, holdings, funds)
 * - Normalize broker responses to internal types
 * - Store/update broker positions and holdings in database
 * - Track sync status and history
 * - Handle concurrent sync prevention
 * - Calculate live P&L from broker data
 * 
 * Security:
 * - User ownership enforced
 * - No silent fallback to simulated data
 * - Stale data marked clearly
 * - Broker secrets never logged
 */
@Injectable()
export class BrokerPortfolioSyncService {
  private readonly logger = new Logger(BrokerPortfolioSyncService.name);
  private readonly activeSyncs = new Map<string, boolean>();

  constructor(
    private prisma: PrismaService,
    private brokerConnection: BrokerConnectionService,
    private angelOnePortfolio: AngelOnePortfolioAdapter,
  ) {}

  /**
   * Sync portfolio data from broker
   * 
   * Fetches positions, holdings, and funds from broker and updates database.
   * Prevents concurrent syncs for same broker connection.
   * 
   * @param userId - Authenticated user ID
   * @param provider - Broker provider (default: ANGELONE)
   * @returns Sync result with counts and status
   */
  async syncPortfolio(userId: string, provider: string = 'ANGELONE') {
    const syncKey = `${userId}:${provider}`;

    // Prevent concurrent syncs
    if (this.activeSyncs.get(syncKey)) {
      throw new HttpException(
        {
          error: 'SYNC_IN_PROGRESS',
          message: 'Portfolio sync already in progress',
        },
        HttpStatus.CONFLICT,
      );
    }

    this.activeSyncs.set(syncKey, true);

    try {
      return await this.performSync(userId, provider);
    } finally {
      this.activeSyncs.delete(syncKey);
    }
  }

  /**
   * Perform actual portfolio synchronization
   * 
   * @param userId - User ID
   * @param provider - Broker provider
   * @returns Sync result
   */
  private async performSync(userId: string, provider: string) {
    const startTime = Date.now();
    this.logger.log(`Starting portfolio sync: User ${userId}, Provider ${provider}`);

    // Get broker connection
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });

    if (!connection) {
      throw new HttpException(
        {
          error: 'BROKER_NOT_CONNECTED',
          message: 'Broker connection not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (connection.status !== 'CONNECTED') {
      throw new HttpException(
        {
          error: 'BROKER_DISCONNECTED',
          message: `Broker status: ${connection.status}`,
        },
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    // Create sync record
    const syncRecord = await this.prisma.brokerPortfolioSync.create({
      data: {
        userId,
        brokerConnectionId: connection.id,
        syncType: 'MANUAL',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });

    try {
      // Get session token
      const sessionToken = await this.brokerConnection.getSessionToken(userId, provider);

      // Fetch all portfolio data in parallel
      const [positionsResponse, holdingsResponse, fundsResponse] = await Promise.all([
        this.angelOnePortfolio.getPositions(sessionToken),
        this.angelOnePortfolio.getHoldings(sessionToken),
        this.angelOnePortfolio.getFunds(sessionToken),
      ]);

      // Sync positions
      const positionsCount = await this.syncPositions(
        userId,
        connection.id,
        positionsResponse.data,
      );

      // Sync holdings
      const holdingsCount = await this.syncHoldings(
        userId,
        connection.id,
        holdingsResponse.data.holdings,
      );

      // Update sync record
      await this.prisma.brokerPortfolioSync.update({
        where: { id: syncRecord.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          positionsCount,
          holdingsCount,
          fundsData: fundsResponse.data as any,
        },
      });

      const duration = Date.now() - startTime;
      this.logger.log(
        `✓ Portfolio sync completed: ${positionsCount} positions, ${holdingsCount} holdings (${duration}ms)`,
      );

      return {
        success: true,
        syncId: syncRecord.id,
        positionsCount,
        holdingsCount,
        funds: this.normalizeFunds(fundsResponse.data),
        syncedAt: new Date(),
        duration,
      };
    } catch (error) {
      // Update sync record with error
      await this.prisma.brokerPortfolioSync.update({
        where: { id: syncRecord.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: (error as Error).message,
          errorCode: (error as any).response?.error || 'UNKNOWN',
        },
      });

      this.logger.error(`Portfolio sync failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Sync positions from broker to database
   * 
   * Uses upsert to avoid duplicates. Updates existing positions or creates new ones.
   * Marks positions not returned by broker as CLOSED.
   * 
   * @param userId - User ID
   * @param connectionId - Broker connection ID
   * @param positions - Positions from broker
   * @returns Count of synced positions
   */
  private async syncPositions(
    userId: string,
    connectionId: string,
    positions: any[],
  ): Promise<number> {
    this.logger.log(`Syncing ${positions.length} positions`);

    const now = new Date();
    let syncedCount = 0;

    // Use transaction for consistency
    await this.prisma.$transaction(async (tx) => {
      // Get current position keys to detect closed positions
      const currentPositions = await tx.brokerPosition.findMany({
        where: {
          userId,
          brokerConnectionId: connectionId,
          positionType: 'OPEN',
        },
        select: {
          exchange: true,
          symbol: true,
          symbolToken: true,
          productType: true,
        },
      });

      const currentKeys = new Set(
        currentPositions.map((p) => `${p.exchange}:${p.symbol}:${p.symbolToken}:${p.productType}`),
      );

      const syncedKeys = new Set<string>();

      // Upsert each position
      for (const pos of positions) {
        // Skip positions with zero net quantity
        const netQty = new Decimal(pos.netqty || 0);
        if (netQty.isZero()) {
          continue;
        }

        const posKey = `${pos.exchange}:${pos.tradingsymbol}:${pos.symboltoken}:${pos.producttype}`;
        syncedKeys.add(posKey);

        const positionData = {
          userId,
          brokerConnectionId: connectionId,
          tradingAccountId: null, // Not linked to trading account yet
          brokerPositionId: null, // Angel One doesn't provide position ID
          exchange: pos.exchange,
          symbol: pos.tradingsymbol,
          symbolToken: pos.symboltoken,
          tradingSymbol: pos.tradingsymbol,
          productType: pos.producttype,
          instrumentType: pos.instrumenttype,
          netQuantity: new Decimal(pos.netqty || 0),
          buyQuantity: new Decimal(pos.buyqty || 0),
          sellQuantity: new Decimal(pos.sellqty || 0),
          netAveragePrice: pos.netavgprice ? new Decimal(pos.netavgprice) : null,
          buyAveragePrice: pos.buyavgprice ? new Decimal(pos.buyavgprice) : null,
          sellAveragePrice: pos.sellavgprice ? new Decimal(pos.sellavgprice) : null,
          lastTradedPrice: pos.ltp ? new Decimal(pos.ltp) : null,
          closePrice: pos.close ? new Decimal(pos.close) : null,
          realizedPnl: new Decimal(pos.realised || 0),
          unrealizedPnl: new Decimal(pos.unrealised || 0),
          totalPnl: new Decimal(pos.pnl || 0),
          pnlPercentage: pos.pnlpercentage ? new Decimal(pos.pnlpercentage) : null,
          totalBuyValue: pos.totalbuyvalue ? new Decimal(pos.totalbuyvalue) : null,
          totalSellValue: pos.totalsellvalue ? new Decimal(pos.totalsellvalue) : null,
          netValue: pos.netvalue ? new Decimal(pos.netvalue) : null,
          multiplier: parseInt(pos.multiplier || '1', 10),
          lotSize: parseInt(pos.boardlotsize || '1', 10),
          positionType: 'OPEN',
          lastSyncedAt: now,
          brokerRawData: pos,
        };

        await tx.brokerPosition.upsert({
          where: {
            userId_brokerConnectionId_exchange_symbol_symbolToken_productType: {
              userId,
              brokerConnectionId: connectionId,
              exchange: pos.exchange,
              symbol: pos.tradingsymbol,
              symbolToken: pos.symboltoken,
              productType: pos.producttype,
            },
          },
          create: positionData as any,
          update: {
            ...positionData,
            updatedAt: now,
          } as any,
        });

        syncedCount++;
      }

      // Mark positions not in sync as CLOSED
      const closedKeys = Array.from(currentKeys).filter((key) => !syncedKeys.has(key));
      for (const key of closedKeys) {
        const [exchange, symbol, symbolToken, productType] = key.split(':');
        await tx.brokerPosition.updateMany({
          where: {
            userId,
            brokerConnectionId: connectionId,
            exchange,
            symbol,
            symbolToken,
            productType,
            positionType: 'OPEN',
          },
          data: {
            positionType: 'CLOSED',
            lastSyncedAt: now,
          },
        });
      }
    });

    return syncedCount;
  }

  /**
   * Sync holdings from broker to database
   * 
   * @param userId - User ID
   * @param connectionId - Broker connection ID
   * @param holdings - Holdings from broker
   * @returns Count of synced holdings
   */
  private async syncHoldings(
    userId: string,
    connectionId: string,
    holdings: any[],
  ): Promise<number> {
    this.logger.log(`Syncing ${holdings.length} holdings`);

    const now = new Date();
    let syncedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const holding of holdings) {
        const quantity = new Decimal(holding.quantity || 0);
        if (quantity.isZero()) {
          continue;
        }

        const holdingData = {
          userId,
          brokerConnectionId: connectionId,
          exchange: holding.exchange,
          symbol: holding.tradingsymbol,
          symbolToken: holding.symboltoken,
          tradingSymbol: holding.tradingsymbol,
          isin: holding.isin,
          quantity: new Decimal(holding.quantity || 0),
          t1Quantity: new Decimal(holding.t1quantity || 0),
          realizedQuantity: new Decimal(holding.realisedquantity || 0),
          authorizedQuantity: new Decimal(holding.authorisedquantity || 0),
          collateralQuantity: new Decimal(holding.collateralquantity || 0),
          averagePrice: holding.averageprice ? new Decimal(holding.averageprice) : null,
          lastTradedPrice: holding.ltp ? new Decimal(holding.ltp) : null,
          closePrice: holding.close ? new Decimal(holding.close) : null,
          profitAndLoss: new Decimal(holding.profitandloss || 0),
          pnlPercentage: holding.pnlpercentage ? new Decimal(holding.pnlpercentage) : null,
          currentValue: holding.ltp && holding.quantity
            ? new Decimal(holding.ltp).times(new Decimal(holding.quantity))
            : null,
          investedValue: holding.averageprice && holding.quantity
            ? new Decimal(holding.averageprice).times(new Decimal(holding.quantity))
            : null,
          collateralType: holding.collateraltype,
          haircut: holding.haircut ? new Decimal(holding.haircut) : null,
          lastSyncedAt: now,
          brokerRawData: holding,
        };

        await tx.brokerHolding.upsert({
          where: {
            userId_brokerConnectionId_exchange_symbol_symbolToken: {
              userId,
              brokerConnectionId: connectionId,
              exchange: holding.exchange,
              symbol: holding.tradingsymbol,
              symbolToken: holding.symboltoken,
            },
          },
          create: holdingData as any,
          update: {
            ...holdingData,
            updatedAt: now,
          } as any,
        });

        syncedCount++;
      }
    });

    return syncedCount;
  }

  /**
   * Normalize funds data from broker
   * 
   * @param fundsData - Raw funds data from broker
   * @returns Normalized funds object
   */
  private normalizeFunds(fundsData: any) {
    return {
      netAvailableFunds: fundsData.net,
      availableCash: fundsData.availablecash,
      availableMargin: fundsData.availablelimitmargin,
      collateral: fundsData.collateral,
      m2mUnrealized: fundsData.m2munrealized,
      m2mRealized: fundsData.m2mrealized,
      utilizedMargin: fundsData.utilisedspan,
    };
  }

  /**
   * Get portfolio sync status
   * 
   * @param userId - User ID
   * @param provider - Broker provider
   * @returns Sync status and last sync info
   */
  async getSyncStatus(userId: string, provider: string = 'ANGELONE') {
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });

    if (!connection) {
      return {
        connected: false,
        lastSync: null,
        status: 'NOT_CONNECTED',
      };
    }

    const lastSync = await this.prisma.brokerPortfolioSync.findFirst({
      where: {
        userId,
        brokerConnectionId: connection.id,
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    const syncKey = `${userId}:${provider}`;
    const isInProgress = this.activeSyncs.get(syncKey) || false;

    return {
      connected: connection.status === 'CONNECTED',
      connectionStatus: connection.status,
      lastSync: lastSync
        ? {
            syncId: lastSync.id,
            status: lastSync.status,
            startedAt: lastSync.startedAt,
            completedAt: lastSync.completedAt,
            positionsCount: lastSync.positionsCount,
            holdingsCount: lastSync.holdingsCount,
            errorMessage: lastSync.errorMessage,
          }
        : null,
      status: isInProgress ? 'SYNCING' : connection.status,
      inProgress: isInProgress,
    };
  }

  /**
   * Get broker positions for user
   * 
   * @param userId - User ID
   * @param provider - Broker provider
   * @param onlyOpen - Filter to only open positions
   * @returns Array of positions
   */
  async getPositions(userId: string, provider: string = 'ANGELONE', onlyOpen: boolean = true) {
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });

    if (!connection) {
      return [];
    }

    const where: any = {
      userId,
      brokerConnectionId: connection.id,
    };

    if (onlyOpen) {
      where.positionType = 'OPEN';
    }

    return this.prisma.brokerPosition.findMany({
      where,
      orderBy: {
        lastSyncedAt: 'desc',
      },
    });
  }

  /**
   * Get broker holdings for user
   * 
   * @param userId - User ID
   * @param provider - Broker provider
   * @returns Array of holdings
   */
  async getHoldings(userId: string, provider: string = 'ANGELONE') {
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });

    if (!connection) {
      return [];
    }

    return this.prisma.brokerHolding.findMany({
      where: {
        userId,
        brokerConnectionId: connection.id,
      },
      orderBy: {
        lastSyncedAt: 'desc',
      },
    });
  }

  /**
   * Get funds/margin from last sync
   * 
   * @param userId - User ID
   * @param provider - Broker provider
   * @returns Funds data or null
   */
  async getFunds(userId: string, provider: string = 'ANGELONE') {
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });

    if (!connection) {
      return null;
    }

    const lastSync = await this.prisma.brokerPortfolioSync.findFirst({
      where: {
        userId,
        brokerConnectionId: connection.id,
        status: 'COMPLETED',
        fundsData: {
          not: null,
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    return lastSync?.fundsData || null;
  }
}
