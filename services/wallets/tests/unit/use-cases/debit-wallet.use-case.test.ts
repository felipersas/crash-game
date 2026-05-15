/**
 * Unit tests for DebitWalletUseCase
 *
 * Tests cover:
 * - Happy path: debiting from wallet with sufficient balance
 * - Error: wallet not found
 * - Error: insufficient funds propagated from domain
 * - Persistence: save called with updated wallet
 * - Event publishing: MoneyDebitedEvent written to outbox
 * - Output correctness: newBalance, version
 * - Edge case: debiting entire balance
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DebitWalletUseCase } from '../../../src/application/use-cases/debit-wallet.use-case';
import { Wallet } from '../../../src/domain/entities/wallet.entity';
import {
  WalletNotFoundError,
  InsufficientFundsError,
} from '../../../src/domain/errors/domain.errors';
import { PlayerId, WalletId } from '@crash/domain';

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
        wallet: {
          create: mockFn(() => Promise.resolve()),
          update: mockFn(() => Promise.resolve()),
        },
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

describe('DebitWalletUseCase', () => {
  let mockWalletRepo: ReturnType<typeof createMockWalletRepository>;
  let mockMetrics: ReturnType<typeof createMockMetrics>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockOutboxWriter: ReturnType<typeof createMockOutboxWriter>;
  let useCase: DebitWalletUseCase;

  beforeEach(() => {
    mockWalletRepo = createMockWalletRepository();
    mockMetrics = createMockMetrics();
    mockPrisma = createMockPrisma();
    mockOutboxWriter = createMockOutboxWriter();
    useCase = new DebitWalletUseCase(
      mockWalletRepo as any,
      mockMetrics as any,
      mockPrisma as any,
      mockOutboxWriter as any,
    );
  });

  test('should debit amount from wallet with sufficient balance', async () => {
    const wallet = Wallet.restore(WalletId.from('wallet-1'), PlayerId.from('player-1'), 10000n, 1);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    const result = await useCase.execute({
      walletId: WalletId.from('wallet-1'),
      amount: 3000n,
      reason: 'bet',
    });

    expect(result.newBalance).toBe(7000n);
  });

  test('should throw WalletNotFoundError when wallet not found', async () => {
    mockWalletRepo.findById.mockResolvedValue(null);

    expect(
      useCase.execute({
        walletId: WalletId.from('nonexistent'),
        amount: 1000n,
        reason: 'bet',
      }),
    ).rejects.toThrow(WalletNotFoundError);
  });

  test('should propagate InsufficientFundsError from domain when balance too low', async () => {
    const wallet = Wallet.restore(WalletId.from('wallet-1'), PlayerId.from('player-1'), 1000n, 1);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    expect(
      useCase.execute({
        walletId: WalletId.from('wallet-1'),
        amount: 5000n,
        reason: 'bet',
      }),
    ).rejects.toThrow(InsufficientFundsError);
  });

  test('should persist updated wallet within transaction', async () => {
    const wallet = Wallet.restore(WalletId.from('wallet-1'), PlayerId.from('player-1'), 10000n, 1);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    await useCase.execute({
      walletId: WalletId.from('wallet-1'),
      amount: 2500n,
      reason: 'bet',
    });

    expect(mockWalletRepo.save._calls.length).toBe(1);
    const savedWallet = mockWalletRepo.save._calls[0][0] as Wallet;
    expect(savedWallet.getBalance().toCents()).toBe(7500n);
  });

  test('should write MoneyDebitedEvent to outbox', async () => {
    const wallet = Wallet.restore(WalletId.from('wallet-1'), PlayerId.from('player-1'), 10000n, 1);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    await useCase.execute({
      walletId: WalletId.from('wallet-1'),
      amount: 3000n,
      reason: 'bet',
    });

    expect(mockOutboxWriter.writeWithinTransaction._calls.length).toBe(1);
    const events = mockOutboxWriter.writeWithinTransaction._calls[0][2];
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('MoneyDebited');
    expect(events[0].amount).toBe(3000n);
    expect(events[0].newBalance).toBe(7000n);
    expect(events[0].reason).toBe('bet');
  });

  test('should return correct newBalance and version', async () => {
    const wallet = Wallet.restore(WalletId.from('wallet-1'), PlayerId.from('player-1'), 10000n, 5);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    const result = await useCase.execute({
      walletId: WalletId.from('wallet-1'),
      amount: 4000n,
      reason: 'withdrawal',
    });

    expect(result.walletId).toBe('wallet-1');
    expect(result.newBalance).toBe(6000n);
    expect(result.version).toBe(6);
  });

  test('should allow debiting entire balance', async () => {
    const wallet = Wallet.restore(WalletId.from('wallet-1'), PlayerId.from('player-1'), 10000n, 1);
    mockWalletRepo.findById.mockResolvedValue(wallet);

    const result = await useCase.execute({
      walletId: WalletId.from('wallet-1'),
      amount: 10000n,
      reason: 'cashout',
    });

    expect(result.newBalance).toBe(0n);
    expect(result.version).toBe(2);
  });
});
