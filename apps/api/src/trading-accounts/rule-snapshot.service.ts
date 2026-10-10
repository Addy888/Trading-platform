import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * RuleSnapshotService
 * 
 * Manages immutable rule snapshots for trading accounts.
 * 
 * CRITICAL REQUIREMENT:
 * When a trading account is created, the exact rules from the plan
 * must be captured and frozen. Later changes to the Plan must NOT
 * affect existing accounts.
 * 
 * Example:
 * - Plan at account creation: Daily Loss 4%, Max Drawdown 8%
 * - Admin changes Plan: Daily Loss 3%, Max Drawdown 6%
 * - Existing account MUST still use: Daily Loss 4%, Max Drawdown 8%
 */
@Injectable()
export class RuleSnapshotService {
  private readonly logger = new Logger(RuleSnapshotService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create immutable rule snapshot when account is created
   */
  async createRuleSnapshot(
    accountId: string,
    ruleSetId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx || this.prisma;

    // Check if snapshot already exists (prevent duplicates)
    const existing = await db.accountRuleSnapshot.findUnique({
      where: { tradingAccountId: accountId },
    });

    if (existing) {
      this.logger.warn(`Rule snapshot already exists for account: ${accountId}`);
      return;
    }

    // Fetch complete rule set with all rules
    const ruleSet = await db.ruleSet.findUnique({
      where: { id: ruleSetId },
      include: {
        ruleSetRules: {
          include: {
            rule: true,
          },
        },
      },
    });

    if (!ruleSet) {
      throw new BadRequestException('RuleSet not found');
    }

    // Build immutable snapshot
    const rules = ruleSet.ruleSetRules.map((rsr) => ({
      id: rsr.rule.id,
      name: rsr.rule.name,
      description: rsr.rule.description,
      type: rsr.rule.type,
      value: rsr.rule.value.toString(),
      isPercentage: rsr.rule.isPercentage,
      isActive: rsr.rule.isActive,
    }));

    // Create version identifier (timestamp-based)
    const snapshotVersion = new Date().toISOString();

    // Store snapshot
    await db.accountRuleSnapshot.create({
      data: {
        tradingAccountId: accountId,
        ruleSetId: ruleSet.id,
        ruleSetName: ruleSet.name,
        snapshotVersion,
        rules: rules,
      },
    });

    this.logger.log(`Created rule snapshot for account: ${accountId} (version: ${snapshotVersion})`);
  }

  /**
   * Get account's rule snapshot (immutable)
   */
  async getAccountRules(accountId: string) {
    const snapshot = await this.prisma.accountRuleSnapshot.findUnique({
      where: { tradingAccountId: accountId },
    });

    if (!snapshot) {
      throw new BadRequestException('Rule snapshot not found for account');
    }

    return snapshot;
  }

  /**
   * Get rules for trade snapshot (capture at trade open time)
   */
  async getRulesForTradeSnapshot(accountId: string) {
    const snapshot = await this.getAccountRules(accountId);

    // Return simplified format for trade snapshot
    return {
      snapshotVersion: snapshot.snapshotVersion,
      ruleSetId: snapshot.ruleSetId,
      ruleSetName: snapshot.ruleSetName,
      rules: snapshot.rules,
      capturedAt: new Date().toISOString(),
    };
  }

  /**
   * Verify if account's rules differ from current plan rules
   * (For admin audit / reporting purposes)
   */
  async compareWithCurrentPlan(accountId: string) {
    const snapshot = await this.prisma.accountRuleSnapshot.findUnique({
      where: { tradingAccountId: accountId },
    });

    if (!snapshot) {
      return { hasDifferences: false, message: 'No snapshot found' };
    }

    // Fetch current rule set
    const currentRuleSet = await this.prisma.ruleSet.findUnique({
      where: { id: snapshot.ruleSetId },
      include: {
        ruleSetRules: {
          include: {
            rule: true,
          },
        },
      },
    });

    if (!currentRuleSet) {
      return { hasDifferences: true, message: 'Original rule set no longer exists' };
    }

    const currentRules = currentRuleSet.ruleSetRules.map((rsr) => ({
      id: rsr.rule.id,
      name: rsr.rule.name,
      type: rsr.rule.type,
      value: rsr.rule.value.toString(),
      isPercentage: rsr.rule.isPercentage,
    }));

    const snapshotRules = (snapshot.rules as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      value: r.value,
      isPercentage: r.isPercentage,
    }));

    // Simple comparison
    const hasDifferences = JSON.stringify(snapshotRules) !== JSON.stringify(currentRules);

    return {
      hasDifferences,
      message: hasDifferences
        ? 'Account rules differ from current plan'
        : 'Account rules match current plan',
      snapshotVersion: snapshot.snapshotVersion,
      currentRules,
      snapshotRules,
    };
  }
}
