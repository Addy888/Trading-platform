import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { TradingAccountsService } from './trading-accounts.service';

const originalEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  enabled: process.env.SIMULATED_TEST_FUNDING_ENABLED,
  userIds: process.env.SIMULATED_TEST_USER_IDS,
  initialBalance: process.env.SIMULATED_TEST_INITIAL_BALANCE,
};

function createService(options: { existingTestAccount?: boolean; walletBalance?: string } = {}) {
  const accountCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'new-account-id',
    accountNumber: 'TRD-2026-000001',
    ...data,
  }));
  const wallet = {
    findUnique: jest.fn().mockResolvedValue(
      options.walletBalance === undefined
        ? null
        : { id: 'wallet-id', currency: 'USD', balance: new Decimal(options.walletBalance) },
    ),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const walletLedger = { create: jest.fn().mockResolvedValue(undefined) };
  const tradingAccount = {
    findFirst: jest.fn().mockResolvedValue(
      options.existingTestAccount ? { id: 'existing-test-account' } : null,
    ),
    create: accountCreate,
  };
  const tx = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'test-user' }) },
    wallet,
    walletLedger,
    tradingAccount,
    ruleSet: { findFirst: jest.fn().mockResolvedValue({ id: 'default-rule-set' }) },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    tradingAccount,
  };
  const accountState = { initializeAccountState: jest.fn().mockResolvedValue(undefined) };
  const ruleSnapshot = { createRuleSnapshot: jest.fn().mockResolvedValue(undefined) };
  const accountSnapshots = { createSnapshot: jest.fn().mockResolvedValue(undefined) };
  const service = new TradingAccountsService(
    prisma as never,
    ruleSnapshot as never,
    accountState as never,
    accountSnapshots as never,
  );
  return { service, prisma, tx, wallet, walletLedger, accountCreate, accountState, accountSnapshots };
}

describe('TradingAccountsService simulated test funding', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.SIMULATED_TEST_FUNDING_ENABLED = 'true';
    process.env.SIMULATED_TEST_USER_IDS = 'test-user,another-test-user';
    process.env.SIMULATED_TEST_INITIAL_BALANCE = '10000.00';
  });

  afterAll(() => {
    if (originalEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment.nodeEnv;
    if (originalEnvironment.enabled === undefined) delete process.env.SIMULATED_TEST_FUNDING_ENABLED;
    else process.env.SIMULATED_TEST_FUNDING_ENABLED = originalEnvironment.enabled;
    if (originalEnvironment.userIds === undefined) delete process.env.SIMULATED_TEST_USER_IDS;
    else process.env.SIMULATED_TEST_USER_IDS = originalEnvironment.userIds;
    if (originalEnvironment.initialBalance === undefined) delete process.env.SIMULATED_TEST_INITIAL_BALANCE;
    else process.env.SIMULATED_TEST_INITIAL_BALANCE = originalEnvironment.initialBalance;
  });

  it('creates exactly $10,000 simulated balance without reading or changing the wallet or ledger', async () => {
    const { service, wallet, walletLedger, accountCreate, accountState, accountSnapshots, tx } = createService();

    const created = await service.createWalletFundedAccount('test-user', { testFunding: true });

    expect(created).toMatchObject({
      isTestAccount: true,
      testFundingUserId: 'test-user',
      initialBalance: '10000.00',
      currentBalance: '10000.00',
      equity: '10000.00',
      walletBalance: undefined,
    });
    expect(wallet.findUnique).not.toHaveBeenCalled();
    expect(wallet.update).not.toHaveBeenCalled();
    expect(walletLedger.create).not.toHaveBeenCalled();
    expect(accountCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        initialBalance: '10000.00',
        currentBalance: '10000.00',
        equity: '10000.00',
        executionMode: 'SIMULATED',
        isTestAccount: true,
        testFundingUserId: 'test-user',
      }),
    }));
    expect(accountState.initializeAccountState).toHaveBeenCalledWith(
      'new-account-id',
      new Decimal('10000.00'),
      tx,
      'FUNDED',
    );
    expect(accountSnapshots.createSnapshot).toHaveBeenCalledWith(
      'new-account-id',
      new Decimal('10000.00'),
      new Decimal('10000.00'),
      new Decimal(0),
      new Decimal(0),
      tx,
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ fundingType: 'SIMULATED_TEST_FUNDS', testAccount: true }),
      }),
    }));
  });

  it('reports test funding only to an authorized development user without an existing test account', async () => {
    const { service, prisma } = createService();

    await expect(service.getTestFundingStatus('test-user')).resolves.toEqual({
      enabled: true,
      initialBalance: '10000.00',
      currency: 'USD',
      label: 'SIMULATED TEST FUNDS',
    });
    expect(prisma.tradingAccount.findFirst).toHaveBeenCalledWith({
      where: { userId: 'test-user', isTestAccount: true },
      select: { id: true },
    });
  });

  it('uses the server-configured simulated balance instead of a client-provided amount', async () => {
    process.env.SIMULATED_TEST_INITIAL_BALANCE = '2500.50';
    const { service, accountCreate, accountState } = createService();

    await expect(service.getTestFundingStatus('test-user')).resolves.toMatchObject({
      enabled: true,
      initialBalance: '2500.50',
    });
    await service.createWalletFundedAccount('test-user', { testFunding: true });

    expect(accountCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        initialBalance: '2500.50',
        currentBalance: '2500.50',
        equity: '2500.50',
      }),
    }));
    expect(accountState.initializeAccountState).toHaveBeenCalledWith(
      'new-account-id',
      new Decimal('2500.50'),
      expect.any(Object),
      'FUNDED',
    );
  });

  it('surfaces invalid server test-balance configuration without opening a transaction', async () => {
    process.env.SIMULATED_TEST_INITIAL_BALANCE = '0';
    const { service, prisma } = createService();

    await expect(service.getTestFundingStatus('test-user'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.createWalletFundedAccount('test-user', { testFunding: true }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unauthorized users before opening a transaction', async () => {
    const { service, prisma } = createService();

    await expect(service.createWalletFundedAccount('unlisted-user', { testFunding: true }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await expect(service.getTestFundingStatus('unlisted-user')).resolves.toMatchObject({ enabled: false });
  });

  it('rejects test funding in production even when the flag and user allowlist are set', async () => {
    process.env.NODE_ENV = 'production';
    const { service, prisma } = createService();

    await expect(service.createWalletFundedAccount('test-user', { testFunding: true }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await expect(service.getTestFundingStatus('test-user')).resolves.toMatchObject({ enabled: false });
  });

  it('rejects caller-supplied test funding amounts and prevents a second test account', async () => {
    const withAmount = createService();
    await expect(withAmount.service.createWalletFundedAccount('test-user', {
      testFunding: true,
      initialFundingAmount: '1',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(withAmount.prisma.$transaction).not.toHaveBeenCalled();

    const duplicate = createService({ existingTestAccount: true });
    await expect(duplicate.service.createWalletFundedAccount('test-user', { testFunding: true }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(duplicate.accountCreate).not.toHaveBeenCalled();
    expect(duplicate.wallet.update).not.toHaveBeenCalled();
    await expect(duplicate.service.getTestFundingStatus('test-user')).resolves.toMatchObject({ enabled: false });
  });

  it('preserves normal wallet-funded account creation', async () => {
    const { service, wallet, walletLedger, accountCreate } = createService({ walletBalance: '500' });

    await service.createWalletFundedAccount('test-user', { initialFundingAmount: '100' });

    expect(wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-id' },
      data: { balance: '400.00' },
    });
    expect(walletLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: '100.00', direction: 'DEBIT' }),
    }));
    expect(accountCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isTestAccount: false, testFundingUserId: null }),
    }));
  });
});
