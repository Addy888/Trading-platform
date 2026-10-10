import { Test, TestingModule } from '@nestjs/testing';
import { AccountStateService } from './account-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { TradingAccountStatus, AccountStage } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';

describe('AccountStateService - State Transition Tests', () => {
  let service: AccountStateService;
  let prisma: PrismaService;

  const mockPrismaService = {
    tradingAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountStateService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AccountStateService>(AccountStateService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Account Initialization', () => {
    it('should initialize account state correctly', async () => {
      const initialBalance = new Decimal(100000);

      mockPrismaService.tradingAccount.update.mockResolvedValue({});

      await service.initializeAccountState('account-1', initialBalance);

      expect(mockPrismaService.tradingAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'account-1' },
          data: expect.objectContaining({
            highWaterMark: initialBalance,
            dailyStartBalance: initialBalance,
            dailyStartEquity: initialBalance,
            currentDailyPnl: expect.any(Decimal),
            currentDrawdown: expect.any(Decimal),
            status: TradingAccountStatus.ACTIVE,
            stage: AccountStage.CHALLENGE,
          }),
        }),
      );
    });
  });

  describe('Status Transitions', () => {
    it('should allow ACTIVE → PASSED transition', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        status: TradingAccountStatus.ACTIVE,
        accountNumber: 'TRD-2026-000001',
      });
      mockPrismaService.tradingAccount.update.mockResolvedValue({});

      await service.transitionStatus('account-1', TradingAccountStatus.PASSED);

      expect(mockPrismaService.tradingAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'account-1' },
          data: expect.objectContaining({
            status: TradingAccountStatus.PASSED,
            passedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should allow ACTIVE → BREACHED transition', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        status: TradingAccountStatus.ACTIVE,
        accountNumber: 'TRD-2026-000001',
      });
      mockPrismaService.tradingAccount.update.mockResolvedValue({});

      await service.transitionStatus(
        'account-1',
        TradingAccountStatus.BREACHED,
        'Daily loss limit exceeded',
      );

      expect(mockPrismaService.tradingAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'account-1' },
          data: expect.objectContaining({
            status: TradingAccountStatus.BREACHED,
            breachedAt: expect.any(Date),
            breachReason: 'Daily loss limit exceeded',
          }),
        }),
      );
    });

    it('should prevent duplicate status transitions', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        status: TradingAccountStatus.PASSED,
        accountNumber: 'TRD-2026-000001',
      });

      await expect(
        service.transitionStatus('account-1', TradingAccountStatus.PASSED),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.tradingAccount.update).not.toHaveBeenCalled();
    });

    it('should prevent invalid status transitions', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        status: TradingAccountStatus.BREACHED,
        accountNumber: 'TRD-2026-000001',
      });

      await expect(
        service.transitionStatus('account-1', TradingAccountStatus.ACTIVE),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow SUSPENDED → ACTIVE transition', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        status: TradingAccountStatus.SUSPENDED,
        accountNumber: 'TRD-2026-000001',
      });
      mockPrismaService.tradingAccount.update.mockResolvedValue({});

      await service.transitionStatus('account-1', TradingAccountStatus.ACTIVE);

      expect(mockPrismaService.tradingAccount.update).toHaveBeenCalled();
    });

    it('should prevent transitions from CLOSED', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        status: TradingAccountStatus.CLOSED,
        accountNumber: 'TRD-2026-000001',
      });

      await expect(
        service.transitionStatus('account-1', TradingAccountStatus.ACTIVE),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Stage Transitions', () => {
    it('should allow CHALLENGE → VERIFICATION transition when PASSED', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        stage: AccountStage.CHALLENGE,
        status: TradingAccountStatus.PASSED,
        accountNumber: 'TRD-2026-000001',
      });
      mockPrismaService.tradingAccount.update.mockResolvedValue({});

      await service.transitionStage('account-1', AccountStage.VERIFICATION);

      expect(mockPrismaService.tradingAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'account-1' },
          data: expect.objectContaining({
            stage: AccountStage.VERIFICATION,
          }),
        }),
      );
    });

    it('should allow CHALLENGE → FUNDED transition when PASSED', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        stage: AccountStage.CHALLENGE,
        status: TradingAccountStatus.PASSED,
        accountNumber: 'TRD-2026-000001',
      });
      mockPrismaService.tradingAccount.update.mockResolvedValue({});

      await service.transitionStage('account-1', AccountStage.FUNDED);

      expect(mockPrismaService.tradingAccount.update).toHaveBeenCalled();
    });

    it('should prevent stage transition without PASSED status', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        stage: AccountStage.CHALLENGE,
        status: TradingAccountStatus.ACTIVE,
        accountNumber: 'TRD-2026-000001',
      });

      await expect(
        service.transitionStage('account-1', AccountStage.VERIFICATION),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent duplicate stage transitions', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        stage: AccountStage.FUNDED,
        status: TradingAccountStatus.PASSED,
        accountNumber: 'TRD-2026-000001',
      });

      await expect(
        service.transitionStage('account-1', AccountStage.FUNDED),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent backwards stage transitions', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        stage: AccountStage.VERIFICATION,
        status: TradingAccountStatus.PASSED,
        accountNumber: 'TRD-2026-000001',
      });

      await expect(
        service.transitionStage('account-1', AccountStage.CHALLENGE),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent stage transitions on CLOSED account', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        stage: AccountStage.CHALLENGE,
        status: TradingAccountStatus.CLOSED,
        accountNumber: 'TRD-2026-000001',
      });

      await expect(
        service.transitionStage('account-1', AccountStage.VERIFICATION),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('High Water Mark', () => {
    it('should update HWM when equity exceeds current HWM', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        highWaterMark: new Decimal(100000),
      });
      mockPrismaService.tradingAccount.update.mockResolvedValue({});

      const newEquity = new Decimal(105000);
      await service.updateHighWaterMark('account-1', newEquity);

      expect(mockPrismaService.tradingAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'account-1' },
          data: expect.objectContaining({
            highWaterMark: newEquity,
          }),
        }),
      );
    });

    it('should not update HWM when equity is below current HWM', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        highWaterMark: new Decimal(100000),
      });

      const newEquity = new Decimal(95000);
      await service.updateHighWaterMark('account-1', newEquity);

      expect(mockPrismaService.tradingAccount.update).not.toHaveBeenCalled();
    });
  });

  describe('Convenience Methods', () => {
    it('markPassed should transition to PASSED', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        status: TradingAccountStatus.ACTIVE,
        accountNumber: 'TRD-2026-000001',
      });
      mockPrismaService.tradingAccount.update.mockResolvedValue({});

      await service.markPassed('account-1');

      expect(mockPrismaService.tradingAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TradingAccountStatus.PASSED,
          }),
        }),
      );
    });

    it('markBreached should transition to BREACHED with reason', async () => {
      mockPrismaService.tradingAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        status: TradingAccountStatus.ACTIVE,
        accountNumber: 'TRD-2026-000001',
      });
      mockPrismaService.tradingAccount.update.mockResolvedValue({});

      await service.markBreached('account-1', 'Max drawdown exceeded');

      expect(mockPrismaService.tradingAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TradingAccountStatus.BREACHED,
            breachReason: 'Max drawdown exceeded',
          }),
        }),
      );
    });
  });
});
