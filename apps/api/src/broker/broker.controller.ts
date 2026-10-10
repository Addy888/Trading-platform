import { Controller, Get, Post, Delete, UseGuards, HttpException, HttpStatus, Logger, Body, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BrokerService } from './broker.service';
import { BrokerPortfolioSyncService } from './broker-portfolio-sync.service';
import { ConnectionStatusDto } from './dto/connection-status.dto';
import { AccountSummaryDto } from './dto/account-summary.dto';
import { BrokerCredentials } from './interfaces/broker-provider.interface';
import {
  PortfolioSyncResponseDto,
  SyncStatusResponseDto,
  BrokerPositionDto,
  BrokerHoldingDto,
  FundsDto,
  PortfolioResponseDto,
  GetPositionsQueryDto,
} from './dto/portfolio.dto';

/**
 * Broker API Controller
 * 
 * Provides endpoints for:
 * - Broker connection management
 * - Portfolio synchronization (Day 4)
 * - Live positions and holdings (Day 4)
 * - Account funds/margin (Day 4)
 * 
 * All endpoints require JWT authentication
 */
@Controller('api/broker')
@UseGuards(JwtAuthGuard)
export class BrokerController {
  private readonly logger = new Logger(BrokerController.name);

  constructor(
    private brokerService: BrokerService,
    private portfolioSync: BrokerPortfolioSyncService,
  ) {}

  /**
   * GET /api/broker/connection/status
   * Returns broker connection status for the authenticated user
   */
  @Get('connection/status')
  async getConnectionStatus(
    @CurrentUser() user: { userId: string; email: string },
    @Query('provider') provider?: string,
  ): Promise<ConnectionStatusDto> {
    this.logger.log(`GET /api/broker/connection/status - User: ${user.userId}`);

    try {
      return await this.brokerService.getConnectionStatus(user.userId, provider);
    } catch (error) {
      this.logger.error(`Failed to get connection status: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * POST /api/broker/connection/connect
   * Connect to broker with credentials
   * 
   * NOTE: This endpoint is for testing purposes.
   * In production, users should input credentials through secure UI.
   */
  @Post('connection/connect')
  async connect(
    @CurrentUser() user: { userId: string; email: string },
    @Body() credentials: BrokerCredentials,
    @Query('provider') provider?: string,
  ): Promise<ConnectionStatusDto> {
    this.logger.log(`POST /api/broker/connection/connect - User: ${user.userId}`);

    // Validate credentials
    if (!credentials.clientId || !credentials.password || !credentials.apiKey) {
      throw new HttpException(
        {
          error: 'INVALID_CREDENTIALS',
          message: 'Missing required credentials',
          details: 'clientId, password, and apiKey are required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.brokerService.connect(user.userId, credentials, provider);
    } catch (error) {
      this.logger.error(`Connection failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * DELETE /api/broker/connection
   * Disconnect from broker
   */
  @Delete('connection')
  async disconnect(
    @CurrentUser() user: { userId: string; email: string },
    @Query('provider') provider?: string,
  ): Promise<{ message: string }> {
    this.logger.log(`DELETE /api/broker/connection - User: ${user.userId}`);

    try {
      await this.brokerService.disconnect(user.userId, provider);
      return { message: 'Disconnected successfully' };
    } catch (error) {
      this.logger.error(`Disconnect failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * GET /api/broker/account/summary
   * Get account summary from broker (funds, margin, profile)
   */
  @Get('account/summary')
  async getAccountSummary(
    @CurrentUser() user: { userId: string; email: string },
    @Query('provider') provider?: string,
  ): Promise<AccountSummaryDto> {
    this.logger.log(`GET /api/broker/account/summary - User: ${user.userId}`);

    try {
      return await this.brokerService.getAccountSummary(user.userId, provider);
    } catch (error) {
      this.logger.error(`Failed to get account summary: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * GET /api/broker/connection/validate
   * Validate current broker session
   */
  @Get('connection/validate')
  async validateSession(
    @CurrentUser() user: { userId: string; email: string },
    @Query('provider') provider?: string,
  ): Promise<{ valid: boolean }> {
    this.logger.log(`GET /api/broker/connection/validate - User: ${user.userId}`);

    try {
      const valid = await this.brokerService.validateSession(user.userId, provider);
      return { valid };
    } catch (error) {
      this.logger.error(`Validation failed: ${(error as Error).message}`);
      return { valid: false };
    }
  }

  // ============================================================================
  // DAY 4: PORTFOLIO SYNC ENDPOINTS
  // ============================================================================

  /**
   * POST /api/broker/portfolio/sync
   * 
   * Trigger manual portfolio synchronization from broker.
   * Fetches positions, holdings, and funds from broker and updates database.
   * 
   * Security:
   * - User ownership enforced (JWT)
   * - Prevents concurrent syncs
   * 
   * @returns Sync result with counts and updated data
   */
  @Post('portfolio/sync')
  async syncPortfolio(
    @CurrentUser() user: { userId: string; email: string },
    @Query('provider') provider?: string,
  ): Promise<PortfolioSyncResponseDto> {
    this.logger.log(`POST /api/broker/portfolio/sync - User: ${user.userId}`);

    try {
      const result = await this.portfolioSync.syncPortfolio(user.userId, provider);
      return result as PortfolioSyncResponseDto;
    } catch (error) {
      this.logger.error(`Portfolio sync failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * GET /api/broker/portfolio/sync-status
   * 
   * Get portfolio sync status and last sync information.
   * 
   * @returns Sync status including connection state and last sync details
   */
  @Get('portfolio/sync-status')
  async getSyncStatus(
    @CurrentUser() user: { userId: string; email: string },
    @Query('provider') provider?: string,
  ): Promise<SyncStatusResponseDto> {
    this.logger.log(`GET /api/broker/portfolio/sync-status - User: ${user.userId}`);

    try {
      return await this.portfolioSync.getSyncStatus(user.userId, provider) as SyncStatusResponseDto;
    } catch (error) {
      this.logger.error(`Failed to get sync status: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * GET /api/broker/portfolio
   * 
   * Get combined portfolio view: positions, holdings, and funds.
   * Returns last synced data from database (does NOT trigger new sync).
   * 
   * To refresh data, call POST /api/broker/portfolio/sync first.
   * 
   * @returns Complete portfolio snapshot
   */
  @Get('portfolio')
  async getPortfolio(
    @CurrentUser() user: { userId: string; email: string },
    @Query('provider') provider?: string,
  ): Promise<PortfolioResponseDto> {
    this.logger.log(`GET /api/broker/portfolio - User: ${user.userId}`);

    try {
      const [positions, holdings, funds] = await Promise.all([
        this.portfolioSync.getPositions(user.userId, provider, true),
        this.portfolioSync.getHoldings(user.userId, provider),
        this.portfolioSync.getFunds(user.userId, provider),
      ]);

      // Find most recent sync time
      const lastSyncedAt =
        positions.length > 0
          ? positions[0].lastSyncedAt
          : holdings.length > 0
          ? holdings[0].lastSyncedAt
          : null;

      return {
        positions: positions.map(this.mapPositionToDto),
        holdings: holdings.map(this.mapHoldingToDto),
        funds: funds ? this.mapFundsToDto(funds) : null,
        lastSyncedAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get portfolio: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * GET /api/broker/positions
   * 
   * Get broker positions from last sync.
   * 
   * Query params:
   * - onlyOpen: Filter to only open positions (default: true)
   * 
   * @returns Array of positions
   */
  @Get('positions')
  async getPositions(
    @CurrentUser() user: { userId: string; email: string },
    @Query() query: GetPositionsQueryDto,
    @Query('provider') provider?: string,
  ): Promise<BrokerPositionDto[]> {
    this.logger.log(`GET /api/broker/positions - User: ${user.userId}`);

    try {
      const onlyOpen = query.onlyOpen !== undefined ? query.onlyOpen : true;
      const positions = await this.portfolioSync.getPositions(user.userId, provider, onlyOpen);
      return positions.map(this.mapPositionToDto);
    } catch (error) {
      this.logger.error(`Failed to get positions: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * GET /api/broker/holdings
   * 
   * Get broker holdings (long-term investments) from last sync.
   * 
   * @returns Array of holdings
   */
  @Get('holdings')
  async getHoldings(
    @CurrentUser() user: { userId: string; email: string },
    @Query('provider') provider?: string,
  ): Promise<BrokerHoldingDto[]> {
    this.logger.log(`GET /api/broker/holdings - User: ${user.userId}`);

    try {
      const holdings = await this.portfolioSync.getHoldings(user.userId, provider);
      return holdings.map(this.mapHoldingToDto);
    } catch (error) {
      this.logger.error(`Failed to get holdings: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * GET /api/broker/funds
   * 
   * Get account funds/margin from last sync.
   * 
   * @returns Funds data or null if no sync completed
   */
  @Get('funds')
  async getFunds(
    @CurrentUser() user: { userId: string; email: string },
    @Query('provider') provider?: string,
  ): Promise<FundsDto | null> {
    this.logger.log(`GET /api/broker/funds - User: ${user.userId}`);

    try {
      const funds = await this.portfolioSync.getFunds(user.userId, provider);
      return funds ? this.mapFundsToDto(funds) : null;
    } catch (error) {
      this.logger.error(`Failed to get funds: ${(error as Error).message}`);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Map BrokerPosition entity to DTO
   * Converts Decimal fields to strings for JSON serialization
   */
  private mapPositionToDto(position: any): BrokerPositionDto {
    return {
      id: position.id,
      exchange: position.exchange,
      symbol: position.symbol,
      symbolToken: position.symbolToken,
      tradingSymbol: position.tradingSymbol,
      productType: position.productType,
      instrumentType: position.instrumentType,
      netQuantity: position.netQuantity.toString(),
      buyQuantity: position.buyQuantity.toString(),
      sellQuantity: position.sellQuantity.toString(),
      netAveragePrice: position.netAveragePrice?.toString() || null,
      buyAveragePrice: position.buyAveragePrice?.toString() || null,
      sellAveragePrice: position.sellAveragePrice?.toString() || null,
      lastTradedPrice: position.lastTradedPrice?.toString() || null,
      closePrice: position.closePrice?.toString() || null,
      realizedPnl: position.realizedPnl.toString(),
      unrealizedPnl: position.unrealizedPnl.toString(),
      totalPnl: position.totalPnl.toString(),
      pnlPercentage: position.pnlPercentage?.toString() || null,
      totalBuyValue: position.totalBuyValue?.toString() || null,
      totalSellValue: position.totalSellValue?.toString() || null,
      netValue: position.netValue?.toString() || null,
      multiplier: position.multiplier,
      lotSize: position.lotSize,
      positionType: position.positionType,
      lastSyncedAt: position.lastSyncedAt,
    };
  }

  /**
   * Map BrokerHolding entity to DTO
   * Converts Decimal fields to strings for JSON serialization
   */
  private mapHoldingToDto(holding: any): BrokerHoldingDto {
    return {
      id: holding.id,
      exchange: holding.exchange,
      symbol: holding.symbol,
      symbolToken: holding.symbolToken,
      tradingSymbol: holding.tradingSymbol,
      isin: holding.isin,
      quantity: holding.quantity.toString(),
      t1Quantity: holding.t1Quantity.toString(),
      realizedQuantity: holding.realizedQuantity.toString(),
      authorizedQuantity: holding.authorizedQuantity.toString(),
      collateralQuantity: holding.collateralQuantity.toString(),
      averagePrice: holding.averagePrice?.toString() || null,
      lastTradedPrice: holding.lastTradedPrice?.toString() || null,
      closePrice: holding.closePrice?.toString() || null,
      profitAndLoss: holding.profitAndLoss.toString(),
      pnlPercentage: holding.pnlPercentage?.toString() || null,
      currentValue: holding.currentValue?.toString() || null,
      investedValue: holding.investedValue?.toString() || null,
      collateralType: holding.collateralType,
      haircut: holding.haircut?.toString() || null,
      lastSyncedAt: holding.lastSyncedAt,
    };
  }

  /**
   * Map funds data to DTO
   * Converts all values to strings for JSON serialization
   */
  private mapFundsToDto(funds: any): FundsDto {
    return {
      netAvailableFunds: funds.netAvailableFunds?.toString() || '0',
      availableCash: funds.availableCash?.toString() || '0',
      availableMargin: funds.availableMargin?.toString() || '0',
      collateral: funds.collateral?.toString() || '0',
      m2mUnrealized: funds.m2mUnrealized?.toString() || '0',
      m2mRealized: funds.m2mRealized?.toString() || '0',
      utilizedMargin: funds.utilizedMargin?.toString() || '0',
    };
  }
}
