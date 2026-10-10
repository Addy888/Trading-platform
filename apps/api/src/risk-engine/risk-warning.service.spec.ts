import { Test, TestingModule } from '@nestjs/testing';
import { RiskWarningService, RiskWarningLevel } from './risk-warning.service';
import { PrismaService } from '../prisma/prisma.service';
import { RuleType } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Day 20: Risk Warning Service Tests
 * 
 * Tests warning detection, deduplication, and level transitions.
 */
describe('RiskWarningService', () => {
  let service: RiskWarningService;
  let prisma: PrismaService;

  const mockAccountId = 'test-account-123';
  const mockTimestamp = new Date('2026-10-06T12:00:00Z');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskWarningService,
        {
          provide: PrismaService,
          useValue: {
            // Mock Prisma methods as needed
          },
        },
      ],
    }).compile();

    service = module.get<RiskWarningService>(RiskWarningService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    // Clear warning state between tests
    service.clearWarningState(mockAccountId);
  });

  describe('Warning Level Detection', () => {
    it('should detect SAFE level (0-49%)', () => {
      const calculation = createMockCalculation({
        dailyLoss: new Decimal(200),
        dailyLossLimit: new Decimal(500),
      });

      const warnings = service.analyzeRisk(calculation);
      
      // SAFE level should not generate warnings
      expect(warnings.length).toBe(0);
    });

    it('should detect CAUTION level (50-74%)', () => {
      const calculation = createMockCalculation({
        dailyLoss: new Decimal(300),
        dailyLossLimit: new Decimal(500),
      });

      const warnings = service.analyzeRisk(calculation);
      
      expect(warnings.length).toBe(1);
      expect(warnings[0].warningLevel).toBe(RiskWarningLevel.CAUTION);
      expect(warnings[0].ruleType).toBe(RuleType.DAILY_LOSS);
      expect(warnings[0].message).toContain('caution');
    });

    it('should detect WARNING level (75-89%)', () => {
      const calculation = createMockCalculation({
        dailyLoss: new Decimal(400),
        dailyLossLimit: new Decimal(500),
      });

      const warnings = service.analyzeRisk(calculation);
      
      expect(warnings.length).toBe(1);
      expect(warnings[0].warningLevel).toBe(RiskWarningLevel.WARNING);
      expect(warnings[0].ruleType).toBe(RuleType.DAILY_LOSS);
      expect(warnings[0].message).toContain('warning');
    });

    it('should detect CRITICAL level (90-99%)', () => {
      const calculation = createMockCalculation({
        dailyLoss: new Decimal(475),
        dailyLossLimit: new Decimal(500),
      });

      const warnings = service.analyzeRisk(calculation);
      
      expect(warnings.length).toBe(1);
      expect(warnings[0].warningLevel).toBe(RiskWarningLevel.CRITICAL);
      expect(warnings[0].ruleType).toBe(RuleType.DAILY_LOSS);
      expect(warnings[0].message).toContain('critical');
    });

    it('should not generate warning for BREACHED level (100%+)', () => {
      const calculation = createMockCalculation({
        dailyLoss: new Decimal(500),
        dailyLossLimit: new Decimal(500),
      });

      const warnings = service.analyzeRisk(calculation);
      
      // BREACHED is handled by breach notification, not warnings
      expect(warnings.length).toBe(0);
    });
  });

  describe('Duplicate Warning Prevention', () => {
    it('should NOT send duplicate warnings for same level', () => {
      const calculation = createMockCalculation({
        dailyLoss: new Decimal(400),
        dailyLossLimit: new Decimal(500),
      });

      // First analysis - should return warning
      const warnings1 = service.analyzeRisk(calculation);
      expect(warnings1.length).toBe(1);
      expect(warnings1[0].warningLevel).toBe(RiskWarningLevel.WARNING);

      // Second analysis with same level - should NOT return warning
      const warnings2 = service.analyzeRisk(calculation);
      expect(warnings2.length).toBe(0);
    });

    it('should send warning when level changes', () => {
      // Start at CAUTION
      const calculation1 = createMockCalculation({
        dailyLoss: new Decimal(300),
        dailyLossLimit: new Decimal(500),
      });

      const warnings1 = service.analyzeRisk(calculation1);
      expect(warnings1.length).toBe(1);
      expect(warnings1[0].warningLevel).toBe(RiskWarningLevel.CAUTION);

      // Escalate to WARNING
      const calculation2 = createMockCalculation({
        dailyLoss: new Decimal(400),
        dailyLossLimit: new Decimal(500),
      });

      const warnings2 = service.analyzeRisk(calculation2);
      expect(warnings2.length).toBe(1);
      expect(warnings2[0].warningLevel).toBe(RiskWarningLevel.WARNING);

      // Escalate to CRITICAL
      const calculation3 = createMockCalculation({
        dailyLoss: new Decimal(475),
        dailyLossLimit: new Decimal(500),
      });

      const warnings3 = service.analyzeRisk(calculation3);
      expect(warnings3.length).toBe(1);
      expect(warnings3[0].warningLevel).toBe(RiskWarningLevel.CRITICAL);
    });

    it('should send warning when level decreases (recovery)', () => {
      // Start at CRITICAL
      const calculation1 = createMockCalculation({
        dailyLoss: new Decimal(475),
        dailyLossLimit: new Decimal(500),
      });

      const warnings1 = service.analyzeRisk(calculation1);
      expect(warnings1.length).toBe(1);
      expect(warnings1[0].warningLevel).toBe(RiskWarningLevel.CRITICAL);

      // Recover to WARNING
      const calculation2 = createMockCalculation({
        dailyLoss: new Decimal(400),
        dailyLossLimit: new Decimal(500),
      });

      const warnings2 = service.analyzeRisk(calculation2);
      expect(warnings2.length).toBe(1);
      expect(warnings2[0].warningLevel).toBe(RiskWarningLevel.WARNING);
    });
  });

  describe('Multiple Rule Type Warnings', () => {
    it('should generate warnings for both daily loss and drawdown', () => {
      const calculation = createMockCalculation({
        dailyLoss: new Decimal(400),
        dailyLossLimit: new Decimal(500),
        drawdown: new Decimal(800),
        drawdownLimit: new Decimal(1000),
      });

      const warnings = service.analyzeRisk(calculation);
      
      expect(warnings.length).toBe(2);
      
      const dailyLossWarning = warnings.find(w => w.ruleType === RuleType.DAILY_LOSS);
      const drawdownWarning = warnings.find(w => w.ruleType === RuleType.MAX_DRAWDOWN);
      
      expect(dailyLossWarning).toBeDefined();
      expect(dailyLossWarning?.warningLevel).toBe(RiskWarningLevel.WARNING);
      
      expect(drawdownWarning).toBeDefined();
      expect(drawdownWarning?.warningLevel).toBe(RiskWarningLevel.WARNING);
    });

    it('should track warning state independently per rule type', () => {
      // Daily loss at WARNING, drawdown at CAUTION
      const calculation1 = createMockCalculation({
        dailyLoss: new Decimal(400),
        dailyLossLimit: new Decimal(500),
        drawdown: new Decimal(600),
        drawdownLimit: new Decimal(1000),
      });

      const warnings1 = service.analyzeRisk(calculation1);
      expect(warnings1.length).toBe(2);

      // Same calculation again - no duplicates
      const warnings2 = service.analyzeRisk(calculation1);
      expect(warnings2.length).toBe(0);

      // Only drawdown changes to WARNING
      const calculation2 = createMockCalculation({
        dailyLoss: new Decimal(400),
        dailyLossLimit: new Decimal(500),
        drawdown: new Decimal(800),
        drawdownLimit: new Decimal(1000),
      });

      const warnings3 = service.analyzeRisk(calculation2);
      expect(warnings3.length).toBe(1);
      expect(warnings3[0].ruleType).toBe(RuleType.MAX_DRAWDOWN);
      expect(warnings3[0].warningLevel).toBe(RiskWarningLevel.WARNING);
    });
  });

  describe('Profit Target Warning', () => {
    it('should generate warning at 90% profit target progress', () => {
      const calculation = createMockCalculation({
        profitProgress: new Decimal(90),
        profitTargetReached: false,
      });

      const warnings = service.analyzeRisk(calculation);
      
      expect(warnings.length).toBe(1);
      expect(warnings[0].ruleType).toBe(RuleType.PROFIT_TARGET);
      expect(warnings[0].warningLevel).toBe(RiskWarningLevel.CRITICAL);
      expect(warnings[0].message).toContain('90.0%');
    });

    it('should NOT generate warning below 90% progress', () => {
      const calculation = createMockCalculation({
        profitProgress: new Decimal(89),
        profitTargetReached: false,
      });

      const warnings = service.analyzeRisk(calculation);
      
      const profitWarning = warnings.find(w => w.ruleType === RuleType.PROFIT_TARGET);
      expect(profitWarning).toBeUndefined();
    });

    it('should NOT generate warning if target already reached', () => {
      const calculation = createMockCalculation({
        profitProgress: new Decimal(100),
        profitTargetReached: true,
      });

      const warnings = service.analyzeRisk(calculation);
      
      const profitWarning = warnings.find(w => w.ruleType === RuleType.PROFIT_TARGET);
      expect(profitWarning).toBeUndefined();
    });
  });

  describe('Warning State Management', () => {
    it('should clear warning state for account', () => {
      const calculation = createMockCalculation({
        dailyLoss: new Decimal(400),
        dailyLossLimit: new Decimal(500),
      });

      // Generate warning
      const warnings1 = service.analyzeRisk(calculation);
      expect(warnings1.length).toBe(1);

      // Clear state
      service.clearWarningState(mockAccountId);

      // Same calculation should generate warning again
      const warnings2 = service.analyzeRisk(calculation);
      expect(warnings2.length).toBe(1);
    });

    it('should get current warning level', () => {
      const calculation = createMockCalculation({
        dailyLoss: new Decimal(400),
        dailyLossLimit: new Decimal(500),
      });

      // Initially SAFE
      const level1 = service.getCurrentWarningLevel(mockAccountId, RuleType.DAILY_LOSS);
      expect(level1).toBe(RiskWarningLevel.SAFE);

      // Generate warning
      service.analyzeRisk(calculation);

      // Now WARNING
      const level2 = service.getCurrentWarningLevel(mockAccountId, RuleType.DAILY_LOSS);
      expect(level2).toBe(RiskWarningLevel.WARNING);
    });
  });

  /**
   * Helper function to create mock calculation results
   */
  function createMockCalculation(options: {
    dailyLoss?: Decimal;
    dailyLossLimit?: Decimal;
    drawdown?: Decimal;
    drawdownLimit?: Decimal;
    profitProgress?: Decimal;
    profitTargetReached?: boolean;
  }): any {
    return {
      accountId: mockAccountId,
      accountStage: 'PHASE_1',
      calculationTimestamp: mockTimestamp,
      ruleSnapshotVersion: 'test-snapshot-v1',
      initialBalance: new Decimal(10000),
      currentBalance: new Decimal(9500),
      currentEquity: new Decimal(9500),
      highWaterMark: new Decimal(10000),
      dailyStartBalance: new Decimal(10000),
      dailyStartEquity: new Decimal(10000),
      dailyLoss: options.dailyLoss ? {
        accountId: mockAccountId,
        evaluationTimestamp: mockTimestamp,
        dailyLoss: options.dailyLoss,
        dailyLossLimit: options.dailyLossLimit || new Decimal(500),
        breached: false,
      } : null,
      dailyLossBreached: false,
      maxDrawdown: options.drawdown ? {
        accountId: mockAccountId,
        evaluationTimestamp: mockTimestamp,
        currentDrawdown: options.drawdown,
        maxDrawdownLimit: options.drawdownLimit || new Decimal(1000),
        breached: false,
      } : null,
      maxDrawdownBreached: false,
      profitTarget: options.profitProgress ? {
        accountId: mockAccountId,
        evaluationTimestamp: mockTimestamp,
        progressPercentage: options.profitProgress,
        currentProfit: new Decimal(0),
        profitTargetAmount: new Decimal(1000),
        reached: options.profitTargetReached || false,
      } : null,
      profitTargetReached: options.profitTargetReached || false,
      minTradingDays: null,
      minTradingDaysReached: false,
      canBreach: false,
      canPass: false,
    };
  }
});
