import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus, AccountStage, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * AccountStateService
 * 
 * Manages trading account state transitions and lifecycle.
 * Provides controlled, validated state changes for:
 * - Status transitions (ACTIVE → PASSED, BREACHED, etc.)
 * - Stage transitions (CHALLENGE → VERIFICATION → FUNDED)
 * - Account initialization
 * 
 * All state transitions are:
 * 1. Validated (only allowed transitions permitted)
 * 2. Transactional (database consistency guaranteed)
 * 3. Auditable (all changes logged)
 * 4. Backend-authoritative (frontend cannot directly modify)
 */
@Injectable()
export class AccountStateService {
  private readonly logger = new Logger(AccountStateService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Initialize account state for a newly created account
   */
  async initializeAccountState(
    accountId: string,
    initialBalance: Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx || this.prisma;

    const now = new Date();

    await db.tradingAccount.update({
      where: { id: accountId },
      data: {
        highWaterMark: initialBalance,
        dailyStartBalance: initialBalance,
        dailyStartEquity: initialBalance,
        currentDailyPnl: new Decimal(0),
        currentDrawdown: new Decimal(0),
        lastDailyResetAt: now,
        status: TradingAccountStatus.ACTIVE,
        stage: AccountStage.CHALLENGE,
        startedAt: now,
      },
    });

    this.logger.log(`Initialized account state: ${accountId}`);
  }

  /**
   * Transition account status with validation
   */
  async transitionStatus(
    accountId: string,
    newStatus: TradingAccountStatus,
    reason?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx || this.prisma;

    const account = await db.tradingAccount.findUnique({
      where: { id: accountId },
      select: { status: true, accountNumber: true },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    // Validate transition
    this.validateStatusTransition(account.status, newStatus);

    const updateData: any = {
      status: newStatus,
      updatedAt: new Date(),
    };

    // Track breach or pass timestamps
    if (newStatus === TradingAccountStatus.BREACHED) {
      updateData.breachedAt = new Date();
      if (reason) {
        updateData.breachReason = reason;
      }
    } else if (newStatus === TradingAccountStatus.PASSED) {
      updateData.passedAt = new Date();
    }

    await db.tradingAccount.update({
      where: { id: accountId },
      data: updateData,
    });

    this.logger.log(
      `Status transition: ${account.accountNumber} ${account.status} → ${newStatus}`,
    );
  }

  /**
   * Transition account stage with validation
   */
  async transitionStage(
    accountId: string,
    newStage: AccountStage,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx || this.prisma;

    const account = await db.tradingAccount.findUnique({
      where: { id: accountId },
      select: { stage: true, status: true, accountNumber: true },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    // Validate transition
    this.validateStageTransition(account.stage, newStage, account.status);

    await db.tradingAccount.update({
      where: { id: accountId },
      data: {
        stage: newStage,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Stage transition: ${account.accountNumber} ${account.stage} → ${newStage}`,
    );
  }

  /**
   * Mark account as passed
   */
  async markPassed(
    accountId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.transitionStatus(accountId, TradingAccountStatus.PASSED, undefined, tx);
  }

  /**
   * Mark account as breached with reason
   */
  async markBreached(
    accountId: string,
    reason: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.transitionStatus(accountId, TradingAccountStatus.BREACHED, reason, tx);
  }

  /**
   * Update High Water Mark if equity exceeds current HWM
   */
  async updateHighWaterMark(
    accountId: string,
    currentEquity: Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx || this.prisma;

    const account = await db.tradingAccount.findUnique({
      where: { id: accountId },
      select: { highWaterMark: true },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const currentHWM = new Decimal(account.highWaterMark);

    if (currentEquity.greaterThan(currentHWM)) {
      await db.tradingAccount.update({
        where: { id: accountId },
        data: { highWaterMark: currentEquity },
      });

      this.logger.log(
        `HWM updated: ${accountId} ${currentHWM.toFixed(2)} → ${currentEquity.toFixed(2)}`,
      );
    }
  }

  /**
   * Validate status transition is allowed
   */
  private validateStatusTransition(
    currentStatus: TradingAccountStatus,
    newStatus: TradingAccountStatus,
  ): void {
    // Prevent duplicate transitions
    if (currentStatus === newStatus) {
      throw new BadRequestException(
        `Account is already in status: ${newStatus}`,
      );
    }

    // Define allowed transitions
    const allowedTransitions: Record<TradingAccountStatus, TradingAccountStatus[]> = {
      [TradingAccountStatus.PENDING]: [
        TradingAccountStatus.ACTIVE,
        TradingAccountStatus.CLOSED,
      ],
      [TradingAccountStatus.ACTIVE]: [
        TradingAccountStatus.PASSED,
        TradingAccountStatus.BREACHED,
        TradingAccountStatus.SUSPENDED,
        TradingAccountStatus.CLOSED,
      ],
      [TradingAccountStatus.PASSED]: [
        TradingAccountStatus.BREACHED,
        TradingAccountStatus.SUSPENDED,
        TradingAccountStatus.CLOSED,
      ],
      [TradingAccountStatus.BREACHED]: [
        TradingAccountStatus.CLOSED,
      ],
      [TradingAccountStatus.SUSPENDED]: [
        TradingAccountStatus.ACTIVE,
        TradingAccountStatus.CLOSED,
      ],
      [TradingAccountStatus.CLOSED]: [],
    };

    const allowed = allowedTransitions[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${currentStatus} → ${newStatus}`,
      );
    }
  }

  /**
   * Validate stage transition is allowed
   */
  private validateStageTransition(
    currentStage: AccountStage,
    newStage: AccountStage,
    accountStatus: TradingAccountStatus,
  ): void {
    // Prevent duplicate transitions
    if (currentStage === newStage) {
      throw new BadRequestException(
        `Account is already in stage: ${newStage}`,
      );
    }

    // Cannot change stage if account is closed
    if (accountStatus === TradingAccountStatus.CLOSED) {
      throw new BadRequestException('Cannot change stage of closed account');
    }

    // Define allowed stage progressions
    const allowedTransitions: Record<AccountStage, AccountStage[]> = {
      [AccountStage.CHALLENGE]: [
        AccountStage.VERIFICATION,
        AccountStage.FUNDED,
      ],
      [AccountStage.VERIFICATION]: [
        AccountStage.FUNDED,
      ],
      [AccountStage.FUNDED]: [],
    };

    const allowed = allowedTransitions[currentStage] || [];

    if (!allowed.includes(newStage)) {
      throw new BadRequestException(
        `Invalid stage transition: ${currentStage} → ${newStage}`,
      );
    }

    // Stage transition requires PASSED status (except FUNDED, which is terminal)
    if (newStage !== AccountStage.CHALLENGE && accountStatus !== TradingAccountStatus.PASSED) {
      throw new BadRequestException(
        `Stage transition to ${newStage} requires account to be PASSED`,
      );
    }
  }
}
