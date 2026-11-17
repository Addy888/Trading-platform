import { Controller, Get, Param, Query, UseGuards, Request, Post, Body, Delete, DefaultValuePipe } from '@nestjs/common';
import { TradingAccountsService } from './trading-accounts.service';
import { RuleSnapshotBackfillService } from './rule-snapshot-backfill.service';
import { AccountsQueryDto } from './dto/accounts-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ChallengeProgressService } from '../challenge-progress/challenge-progress.service';

@Controller('trading-accounts')
@UseGuards(JwtAuthGuard)
export class TradingAccountsController {
  constructor(
    private readonly tradingAccountsService: TradingAccountsService,
    private readonly challengeProgressService: ChallengeProgressService,
  ) {}

  @Get()
  findUserAccounts(@Request() req) {
    return this.tradingAccountsService.findUserAccounts(req.user.sub);
  }

  @Post()
  createAccount(
    @Request() req,
    @Body() body?: { initialFundingAmount?: string | number; testFunding?: boolean },
  ) {
    return this.tradingAccountsService.createWalletFundedAccount(
      req.user.sub,
      body,
    );
  }

  @Get('test-funding')
  getTestFundingStatus(@Request() req) {
    return this.tradingAccountsService.getTestFundingStatus(req.user.sub);
  }

  @Get(':id')
  findUserAccount(@Param('id') id: string, @Request() req) {
    return this.tradingAccountsService.findUserAccount(id, req.user.sub);
  }

  @Get(':id/progress')
  async getAccountProgress(@Param('id') id: string, @Request() req) {
    // Verify ownership
    await this.tradingAccountsService.findUserAccount(id, req.user.sub);
    return this.challengeProgressService.getChallengeProgress(id);
  }

  /**
   * Get open positions for an account
   */
  @Get(':id/positions')
  async getOpenPositions(
    @Param('id') accountId: string,
    @Request() req,
  ) {
    return this.tradingAccountsService.getOpenPositions(accountId, req.user.sub);
  }

  /**
   * Get trade history for an account
   */
  @Get(':id/trades')
  async getTradeHistory(
    @Param('id') accountId: string,
    @Request() req,
    @Query('page', new DefaultValuePipe('1')) page: string = '1',
    @Query('limit', new DefaultValuePipe('20')) limit: string = '20',
    @Query('status') status?: string,
  ) {
    return this.tradingAccountsService.getTradeHistory(
      accountId,
      req.user.sub,
      {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
        status,
      },
    );
  }
}

@Controller('admin/trading-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminTradingAccountsController {
  constructor(
    private readonly tradingAccountsService: TradingAccountsService,
    private readonly challengeProgressService: ChallengeProgressService,
    private readonly ruleSnapshotBackfill: RuleSnapshotBackfillService,
  ) {}

  @Get()
  findAllAccounts(@Query() query: AccountsQueryDto) {
    return this.tradingAccountsService.findAllAccounts(query);
  }

  @Get(':id')
  findAccountById(@Param('id') id: string) {
    return this.tradingAccountsService.findAccountById(id);
  }

  @Get(':id/progress')
  async getAccountProgressAdmin(@Param('id') id: string) {
    return this.challengeProgressService.getChallengeProgress(id);
  }

  @Get('snapshots/missing')
  async findAccountsMissingSnapshots() {
    return this.ruleSnapshotBackfill.findAccountsMissingSnapshots();
  }

  @Post('snapshots/backfill-all')
  async backfillAllSnapshots() {
    return this.ruleSnapshotBackfill.backfillAllMissingSnapshots();
  }

  @Post(':id/snapshots/backfill')
  async backfillAccountSnapshot(@Param('id') id: string) {
    return this.ruleSnapshotBackfill.backfillAccountSnapshot(id);
  }
}
