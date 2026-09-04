import { Test, TestingModule } from '@nestjs/testing';
import { TradingAccountsController } from './trading-accounts.controller';
import { TradingAccountsService } from './trading-accounts.service';
import { ChallengeProgressService } from '../challenge-progress/challenge-progress.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('TradingAccountsController - Security', () => {
  let controller: TradingAccountsController;
  let service: TradingAccountsService;

  const mockTradingAccountsService = {
    findUserAccounts: jest.fn(),
    findUserAccount: jest.fn(),
  };

  const mockChallengeProgressService = {
    getChallengeProgress: jest.fn(),
  };

  const user1 = { sub: 'user-1', email: 'user1@example.com', role: 'USER' };
  const user2 = { sub: 'user-2', email: 'user2@example.com', role: 'USER' };
  
  const account1 = {
    id: 'account-1',
    userId: 'user-1',
    accountNumber: 'ACC-001',
    status: 'ACTIVE',
  };

  const account2 = {
    id: 'account-2',
    userId: 'user-2',
    accountNumber: 'ACC-002',
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TradingAccountsController],
      providers: [
        {
          provide: TradingAccountsService,
          useValue: mockTradingAccountsService,
        },
        {
          provide: ChallengeProgressService,
          useValue: mockChallengeProgressService,
        },
      ],
    }).compile();

    controller = module.get<TradingAccountsController>(TradingAccountsController);
    service = module.get<TradingAccountsService>(TradingAccountsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Security - User can access own account', () => {
    it('should allow user to view their own accounts', async () => {
      mockTradingAccountsService.findUserAccounts.mockResolvedValue([account1]);

      const result = await controller.findUserAccounts({ user: user1 });

      expect(result).toEqual([account1]);
      expect(service.findUserAccounts).toHaveBeenCalledWith(user1.sub);
    });

    it('should allow user to view their own account details', async () => {
      mockTradingAccountsService.findUserAccount.mockResolvedValue(account1);

      const result = await controller.findUserAccount('account-1', { user: user1 });

      expect(result).toEqual(account1);
      expect(service.findUserAccount).toHaveBeenCalledWith('account-1', user1.sub);
    });
  });

  describe('Security - User cannot access another user\'s account', () => {
    it('should prevent user from accessing another user\'s account', async () => {
      mockTradingAccountsService.findUserAccount.mockRejectedValue(
        new ForbiddenException('Access denied'),
      );

      await expect(
        controller.findUserAccount('account-2', { user: user1 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return 404 if account does not exist', async () => {
      mockTradingAccountsService.findUserAccount.mockRejectedValue(
        new NotFoundException('Trading account not found'),
      );

      await expect(
        controller.findUserAccount('non-existent', { user: user1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Security - Account progress access control', () => {
    it('should allow user to view their own account progress', async () => {
      const progress = {
        accountStatus: 'ACTIVE',
        accountResult: 'In Progress',
        overallProgress: '50.00',
        rules: {},
      };

      mockTradingAccountsService.findUserAccount.mockResolvedValue(account1);
      mockChallengeProgressService.getChallengeProgress.mockResolvedValue(progress);

      const result = await controller.getAccountProgress('account-1', { user: user1 });

      expect(result).toEqual(progress);
      expect(service.findUserAccount).toHaveBeenCalledWith('account-1', user1.sub);
    });

    it('should prevent user from viewing another user\'s account progress', async () => {
      mockTradingAccountsService.findUserAccount.mockRejectedValue(
        new ForbiddenException('Access denied'),
      );

      await expect(
        controller.getAccountProgress('account-2', { user: user1 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
