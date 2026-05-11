/**
 * Unit tests for CreditWalletUseCase
 *
 * Tests cover:
 * - Happy path: crediting amount to existing wallet
 * - Error: wallet not found
 * - Persistence: save called with updated wallet
 * - Event publishing: MoneyCreditedEvent written to outbox
 * - Output correctness: newBalance, version
 * - Edge case: zero amount credit
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { CreditWalletUseCase } from '../../../src/application/use-cases/credit-wallet.use-case';
import { Wallet } from '../../../src/domain/entities/wallet.entity';
import { WalletNotFoundError } from '../../../src/domain/errors/domain.errors';

// --- Mock helpers ---

function mockFn<T extends (...args: any[]) => any>(
  impl?: T,
): T & { mockReturnValue: (v: any) => void; mockResolvedValue: (v: any) => void } {
  const calls: any[] = [];
  const fn: any = (...args: any[]) => {
    calls.push(args);
    return (fn._impl as any)(...args);
  };
  fn._impl = impl || (() => {});
  fn._calls = calls;
  fn.mockReturnValue = (v: any) => {
    fn._impl = () => v;
  };
  fn.mockResolvedValue = (v: any) => {
    fn._impl = () => Promise.resolve(v);
  };
  return fn;
}

function createMockWalletRepository(overrides: Record<string, any> = {}) {
  return {
    findById: mockFn(() => Promise.resolve(null)),
    findByPlayerId: mockFn(() => Promise.resolve(null)),
    save: mockFn(() => Promise.resolve()),
    create: mockFn(() => Promise.resolve()),
    existsByPlayerId: mockFn(() => Promise.resolve(false)),
    ...overrides,
  };
}

function createMockMetrics(overrides: Record<string, any> = {}) {
  return {
    incrWalletOp: mockFn(() => {}),
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    $transaction: mockFn(async (fn: any) => {
      const mockTx = {
        outboxEvent: { create: mockFn(() => Promise.resolve()) },
        wallet: { create: mockFn(() => Promise.resolve()), update: mockFn(() => Promise.resolve()) },
      };
      return fn(mockTx);
    }),
    wallet: { create: mockFn(() => Promise.resolve()), update: mockFn(() => Promise.resolve()) },
    outboxEvent: { create: mockFn(() => Promise.resolve()) },
  };
}

function createMockOutboxWriter() {
  return {
    writeWithinTransaction: mockFn(() => Promise.resolve(['outbox-id-1'])),
    tryImmediatePublish: mockFn(() => Promise.resolve()),
  };
}

describe('CreditWalletUseCase', () => {
  let mockWalletRepo: ReturnType<typeof createMockWalletRepository>;
  let mockMetrics: ReturnType<typeof createMockMetrics>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockOutboxWriter: ReturnType<typeof createMockOutboxWriter>;
  let useCase: CreditWalletUseCase;

  beforeEach(() => {
    mockWalletRepo = createMockWalletRepository();
    mockMetrics = createMockMetrics();
    mockPrisma = createMockPrisma();
    mockOutboxWriter = createMockOutboxWriter();
    useCase = new CreditWalletUseCase(
      mockWalletRepo as any,
      mockMetrics as any,
      mockPrisma as any,
      mockOutboxWriter as any,
    );
  });

  test('should credit amount to existing wallet', async () => {
    const wallet = Wallet.restore('wallet-1', 'player-1', 10000n, 1);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    const result = await useCase.execute({
      walletId: 'wallet-1',
      amount: 5000n,
      reason: 'win',
    });

    expect(result.newBalance).toBe(15000n);
  });

  test('should throw WalletNotFoundError when wallet not found', async () => {
    mockWalletRepo.findById.mockResolvedValue(null);

    expect(
      useCase.execute({
        walletId: 'nonexistent',
        amount: 1000n,
        reason: 'win',
      }),
    ).rejects.toThrow(WalletNotFoundError);
  });

  test('should persist updated wallet within transaction', async () => {
    const wallet = Wallet.restore('wallet-1', 'player-1', 10000n, 1);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    await useCase.execute({
      walletId: 'wallet-1',
      amount: 2500n,
      reason: 'deposit',
    });

    expect(mockWalletRepo.save._calls.length).toBe(1);
    const savedWallet = mockWalletRepo.save._calls[0][0] as Wallet;
    expect(savedWallet.getBalance().toCents()).toBe(12500n);
  });

  test('should write MoneyCreditedEvent to outbox', async () => {
    const wallet = Wallet.restore('wallet-1', 'player-1', 10000n, 1);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    await useCase.execute({
      walletId: 'wallet-1',
      amount: 3000n,
      reason: 'bonus',
    });

    expect(mockOutboxWriter.writeWithinTransaction._calls.length).toBe(1);
    const events = mockOutboxWriter.writeWithinTransaction._calls[0][2];
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('MoneyCredited');
    expect(events[0].amount).toBe(3000n);
    expect(events[0].newBalance).toBe(13000n);
    expect(events[0].reason).toBe('bonus');
  });

  test('should return correct newBalance and version', async () => {
    const wallet = Wallet.restore('wallet-1', 'player-1', 10000n, 3);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    const result = await useCase.execute({
      walletId: 'wallet-1',
      amount: 5000n,
      reason: 'win',
    });

    expect(result.walletId).toBe('wallet-1');
    expect(result.newBalance).toBe(15000n);
    expect(result.version).toBe(4);
  });

  test('should handle credit of zero amount', async () => {
    const wallet = Wallet.restore('wallet-1', 'player-1', 10000n, 1);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    const result = await useCase.execute({
      walletId: 'wallet-1',
      amount: 0n,
      reason: 'adjustment',
    });

    expect(result.newBalance).toBe(10000n);
    expect(result.version).toBe(2);
  });
});
