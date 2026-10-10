import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { FinancialCalculations } from '../common/utils/financial-calculations.util';

/**
 * P&L Reconciliation Result
 */
export interface PnLReconciliationResult {
  accountId: string;
  accountNumber: string;
  currentBalance: Decimal;
  initialBalance: Decimal;
  calculatedRealizedPnl: Decimal;  // Sum of all closed trade P&L
  recordedRealizedPnl: Decimal;     // From trade records
  balanceCalculated: Decimal;       // initialBalance + calculatedRealizedPnl
  balanceDifference: Decimal;       // currentBalance - balanceCalculated
  isReconciled: boolean;            // balanceDifference == 0
  closedTradesCount: number;
  openTradesCount: number;
  totalUnrealizedPnl: Decimal;
  timestamp: Date;
}

/**
 * P&L Reconciliation Service
 * 
 * Day 14 - Realized + Floating P&L Integration
 * 
 * Validates that account balance matches the sum of:
 * - Initial balance
 * - All realized P&L from closed trades
 * 
 * Detects mismatches caused by:
 * - Duplicate P&L application
 * - Missing P&L application
 * - Manual balance adjustments without audit trail
 * - Database corruption
 * 
 * NEVER silently repairs mismatches by overwriting historical data.
 * All discrepancies are reported for manual review.
 */
@Injectable()
export class PnLReconciliationService {
  private readonly logger = new Logger(PnLReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reconcile P&L for a single trading account
   * 
   * Validates:
   * - Balance = InitialBalance + Sum(RealizedPnL from closed trades)
   * - Floating P&L is not included in balance
   * - No duplicate P&L application
   * 
   * @param accountId Trading account ID
   * @returns Reconciliation result with detailed breakdown
   */
  async reconcileAccount(accountId: string): Promise<PnLReconciliationResult> {
    // Fetch account with trades
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        accountNumber: true,
        initialBalance: true,
        currentBalance: true,
        trades: {
          select: {
            id: true,
            status: true,
            realizedPnl: true,
            unrealizedPnl: true,
          },
        },
      },
    });

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // Calculate realized P&L from closed trades
    const closedTrades = account.trades.filter(t => t.status === TradeStatus.CLOSED);
    const openTrades = account.trades.filter(t => t.status === TradeStatus.OPEN);

    const calculatedRealizedPnl = closedTrades.reduce(
      (sum, trade) => FinancialCalculations.add(sum, trade.realizedPnl),
      new Decimal(0),
    );

    const recordedRealizedPnl = calculatedRealizedPnl; // Same in our current implementation

    const totalUnrealizedPnl = openTrades.reduce(
      (sum, trade) => FinancialCalculations.add(sum, trade.unrealizedPnl),
      new Decimal(0),
    );

    // Calculate expected balance
    const initialBalance = new Decimal(account.initialBalance);
    const currentBalance = new Decimal(account.currentBalance);
    const balanceCalculated = FinancialCalculations.add(initialBalance, calculatedRealizedPnl);
    const balanceDifference = FinancialCalculations.subtract(currentBalance, balanceCalculated);

    // Check if reconciled (within 0.01 tolerance for rounding)
    const isReconciled = FinancialCalculations.abs(balanceDifference).lessThan(0.01);

    const result: PnLReconciliationResult = {
      accountId: account.id,
      accountNumber: account.accountNumber,
      currentBalance,
      initialBalance,
      calculatedRealizedPnl,
      recordedRealizedPnl,
      balanceCalculated,
      balanceDifference,
      isReconciled,
      closedTradesCount: closedTrades.length,
      openTradesCount: openTrades.length,
      totalUnrealizedPnl,
      timestamp: new Date(),
    };

    if (!isReconciled) {
      this.logger.warn(
        `P&L MISMATCH for account ${account.accountNumber}: ` +
        `Expected ${FinancialCalculations.formatMoney(balanceCalculated)}, ` +
        `Actual ${FinancialCalculations.formatMoney(currentBalance)}, ` +
        `Difference ${FinancialCalculations.formatMoney(balanceDifference)}`,
      );
    } else {
      this.logger.debug(
        `P&L reconciled for account ${account.accountNumber}: ` +
        `Balance ${FinancialCalculations.formatMoney(currentBalance)}`,
      );
    }

    return result;
  }

  /**
   * Reconcile P&L for all active trading accounts
   * 
   * @returns Array of reconciliation results
   */
  async reconcileAllAccounts(): Promise<PnLReconciliationResult[]> {
    const accounts = await this.prisma.tradingAccount.findMany({
      where: {
        status: {
          in: ['ACTIVE', 'PASSED', 'BREACHED'],
        },
      },
      select: {
        id: true,
      },
    });

    const results: PnLReconciliationResult[] = [];

    for (const account of accounts) {
      try {
        const result = await this.reconcileAccount(account.id);
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Failed to reconcile account ${account.id}: ${(error as Error).message}`,
        );
      }
    }

    const mismatches = results.filter(r => !r.isReconciled);
    if (mismatches.length > 0) {
      this.logger.warn(
        `P&L RECONCILIATION SUMMARY: ${mismatches.length} of ${results.length} accounts have mismatches`,
      );
    } else {
      this.logger.log(
        `P&L RECONCILIATION SUMMARY: All ${results.length} accounts reconciled successfully`,
      );
    }

    return results;
  }

  /**
   * Get reconciliation summary for reporting
   * 
   * @returns Aggregated reconciliation statistics
   */
  async getReconciliationSummary(): Promise<{
    totalAccounts: number;
    reconciledAccounts: number;
    mismatchedAccounts: number;
    totalMismatchAmount: string;
    timestamp: Date;
  }> {
    const results = await this.reconcileAllAccounts();

    const totalAccounts = results.length;
    const reconciledAccounts = results.filter(r => r.isReconciled).length;
    const mismatchedAccounts = results.filter(r => !r.isReconciled).length;

    const totalMismatchAmount = results
      .filter(r => !r.isReconciled)
      .reduce(
        (sum, r) => FinancialCalculations.add(sum, FinancialCalculations.abs(r.balanceDifference)),
        new Decimal(0),
      );

    return {
      totalAccounts,
      reconciledAccounts,
      mismatchedAccounts,
      totalMismatchAmount: FinancialCalculations.formatMoney(totalMismatchAmount),
      timestamp: new Date(),
    };
  }
}
