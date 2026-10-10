import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { PayoutStatus, TradingAccountStatus } from '@prisma/client';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';
import { DecimalInputValidation } from '../common/utils/decimal-input-validation.util';
import Decimal from 'decimal.js';
import { ConsistencyService } from '../risk-engine/consistency.service';
import { MinTradingDaysService } from '../risk-engine/min-trading-days.service';
import { KycGateService } from '../kyc/kyc-gate.service';
import { PayoutEligibilityService } from './payout-eligibility.service';


@Injectable()
export class PayoutsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private consistencyService: ConsistencyService,
    private minTradingDays: MinTradingDaysService,
    private kycGate: KycGateService,
    private payoutEligibility: PayoutEligibilityService,
  ) {}

  async requestPayout(userId: string, requestPayoutDto: RequestPayoutDto) {
    const { tradingAccountId, amount, method, destination, notes } =
      requestPayoutDto;

    // Day 25: Use centralized Payout Eligibility Engine
    const eligibilityResult = await this.payoutEligibility.evaluate({
      userId,
      tradingAccountId,
      requestedAmount: amount,
      method,
      destination,
    });

    // Record eligibility evaluation in audit log
    await this.payoutEligibility.recordEligibilityEvaluation(
      userId,
      eligibilityResult,
      {
        userId,
        tradingAccountId,
        requestedAmount: amount,
        method,
        destination,
      },
    );

    // If not eligible, reject with detailed message
    if (!eligibilityResult.eligible) {
      throw new BadRequestException(eligibilityResult.safeMessage);
    }

    // Load account for payout creation
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        challengePlan: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    // Create payout request
    const payout = await this.prisma.payout.create({
      data: {
        userId,
        tradingAccountId,
        amount: new Decimal(amount),
        currency: 'USD',
        status: PayoutStatus.PENDING,
        method: method || 'Bank Transfer',
        destination,
        notes,
        requestedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Day 21: Calculate and persist consistency for payout
    try {
      const consistencyResult = await this.consistencyService.calculateConsistency(
        tradingAccountId,
        payout.id,
      );

      // Create immutable audit event
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: consistencyResult.passed ? 'PAYOUT_CONSISTENCY_PASSED' : 'PAYOUT_CONSISTENCY_FAILED',
          entityType: 'Payout',
          entityId: payout.id,
          metadata: {
            tradingAccountId,
            accountNumber: account.accountNumber,
            totalProfit: FinancialCalculations.formatMoney(consistencyResult.totalProfit),
            highestProfitableDay: FinancialCalculations.formatMoney(consistencyResult.highestProfitableDay),
            highestProfitableDayDate: consistencyResult.highestProfitableDayDate.toISOString(),
            consistencyPercentage: consistencyResult.consistencyPercentage.toFixed(2),
            requiredThreshold: consistencyResult.requiredThreshold?.toFixed(2) || null,
            passed: consistencyResult.passed,
            profitableDaysCount: consistencyResult.profitableDaysCount,
            totalTradingDays: consistencyResult.totalTradingDays,
          },
        },
      });

      // If consistency check fails, add warning to notes (admin still decides)
      if (!consistencyResult.passed && consistencyResult.requiredThreshold) {
        const warningNote = `\n\n[System Warning] Consistency check: ${consistencyResult.consistencyPercentage.toFixed(2)}% exceeds threshold of ${consistencyResult.requiredThreshold.toFixed(2)}%. Manual review required.`;
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            notes: (notes || '') + warningNote,
          },
        });
      }
    } catch (error) {
      // Consistency calculation failure should not block payout request
      // Log error and continue
      console.error('Consistency calculation failed:', error);
      
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'PAYOUT_CONSISTENCY_ERROR',
          entityType: 'Payout',
          entityId: payout.id,
          metadata: {
            tradingAccountId,
            accountNumber: account.accountNumber,
            error: (error as Error).message,
          },
        },
      });
    }

    // Create audit log for payout request
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'PAYOUT_REQUESTED',
        entityType: 'Payout',
        entityId: payout.id,
        metadata: {
          tradingAccountId,
          accountNumber: account.accountNumber,
          amount: amount.toString(),
          method: method || 'Bank Transfer',
          eligibilityChecks: eligibilityResult.checks.length,
          ruleSnapshotVersion: eligibilityResult.ruleSnapshotVersion,
        },
      },
    });

    // Emit event for admin notification
    this.eventEmitter.emit('payout.requested', {
      payoutId: payout.id,
      userId,
      userEmail: payout.user.email,
      userName: `${payout.user.firstName} ${payout.user.lastName}`,
      accountNumber: account.accountNumber,
      amount,
    });

    return payout;
  }

  async getUserPayouts(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where: { userId },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { requestedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payout.count({ where: { userId } }),
    ]);

    return {
      data: payouts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPayoutDetails(id: string, userId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    // Verify ownership
    if (payout.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return payout;
  }

  async checkPayoutEligibility(tradingAccountId: string, userId: string) {
    // Day 25: Use centralized Payout Eligibility Engine
    const eligibilityResult = await this.payoutEligibility.evaluate({
      userId,
      tradingAccountId,
      requestedAmount: 0, // For eligibility check, we check general eligibility
    });

    // Extract details for response
    const checks = eligibilityResult.checks.reduce((acc, check) => {
      acc[check.checkName] = {
        passed: check.passed,
        required: check.required,
        message: check.message,
        details: check.details,
      };
      return acc;
    }, {} as Record<string, any>);

    return {
      eligible: eligibilityResult.eligible,
      rejectionCode: eligibilityResult.rejectionCode,
      message: eligibilityResult.safeMessage,
      accountSnapshot: eligibilityResult.accountSnapshot,
      checks,
      evaluatedAt: eligibilityResult.evaluatedAt,
      ruleSnapshotVersion: eligibilityResult.ruleSnapshotVersion,
    };
  }
}
