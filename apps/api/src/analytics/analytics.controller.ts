import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PerformanceAnalyticsService } from './performance-analytics.service';
import { ChallengeProgressService } from '../challenge-progress/challenge-progress.service';
import { AccountSnapshotsService } from '../account-snapshots/account-snapshots.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Analytics Controller
 * 
 * Endpoints:
 * - GET /api/trading-accounts/:id/analytics - Comprehensive account analytics
 * - GET /api/trading-accounts/:id/challenge-progress - Challenge progress
 * - GET /api/trading-accounts/:id/equity-history - Equity history
 */
@Controller('trading-accounts')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly performanceAnalytics: PerformanceAnalyticsService,
    private readonly challengeProgress: ChallengeProgressService,
    private readonly accountSnapshots: AccountSnapshotsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get comprehensive account analytics
   * GET /api/trading-accounts/:id/analytics
   */
  @Get(':id/analytics')
  async getAccountAnalytics(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId;

    // Verify ownership
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });

    if (!account) {
      throw new ForbiddenException('Trading account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Get performance metrics
    const performance = await this.performanceAnalytics.calculatePerformanceMetrics(
      id,
      userId,
    );

    // Get challenge progress
    const challengeProgressData = await this.challengeProgress.getChallengeProgress(id);

    return {
      overview: performance.overview,
      trades: performance.trades,
      pnl: performance.pnl,
      accountStatus: account.status,
      challengeProgress: challengeProgressData,
    };
  }

  /**
   * Get challenge progress
   * GET /api/trading-accounts/:id/challenge-progress
   */
  @Get(':id/challenge-progress')
  async getChallengeProgress(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId;

    // Verify ownership
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!account) {
      throw new ForbiddenException('Trading account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.challengeProgress.getChallengeProgress(id);
  }

  /**
   * Get equity history
   * GET /api/trading-accounts/:id/equity-history?range=7d
   */
  @Get(':id/equity-history')
  async getEquityHistory(
    @Param('id') id: string,
    @Query('range') range: string,
    @Request() req,
  ) {
    const userId = req.user.userId;

    // Verify ownership
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!account) {
      throw new ForbiddenException('Trading account not found');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.accountSnapshots.getEquityHistory(id, range);
  }
}
