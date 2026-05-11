/**
 * Unit tests for CreateWalletUseCase
 *
 * Tests cover:
 * - Happy path: new wallet creation
 * - Idempotency: returning existing wallet
 * - Event publishing: WalletCreatedEvent written to outbox only for new wallets
 * - Output correctness: walletId, playerId, balance
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { CreateWalletUseCase } from '../../../src/application/use-cases/create-wallet.use-case';
import { Wallet } from '../../../src/domain/entities/wallet.entity';

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

describe('CreateWalletUseCase', () => {
  let mockWalletRepo: ReturnType<typeof createMockWalletRepository>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockOutboxWriter: ReturnType<typeof createMockOutboxWriter>;
  let useCase: CreateWalletUseCase;

  beforeEach(() => {
    mockWalletRepo = createMockWalletRepository();
    mockPrisma = createMockPrisma();
    mockOutboxWriter = createMockOutboxWriter();
    useCase = new CreateWalletUseCase(
      mockWalletRepo as any,
      mockPrisma as any,
      mockOutboxWriter as any,
    );
  });

  test('should create new wallet for player without existing wallet', async () => {
    mockWalletRepo.findByPlayerId.mockResolvedValue(null);

    const result = await useCase.execute({ playerId: 'player-1' });

    expect(result.walletId).toBeDefined();
    expect(result.playerId).toBe('player-1');
    expect(mockWalletRepo.create._calls.length).toBe(1);
  });

  test('should return existing wallet when player already has one (idempotent)', async () => {
    const existingWallet = Wallet.restore('wallet-1', 'player-1', 5000n, 1);
    mockWalletRepo.findByPlayerId.mockResolvedValue(existingWallet);

    const result = await useCase.execute({ playerId: 'player-1' });

    expect(result.walletId).toBe('wallet-1');
    expect(result.playerId).toBe('player-1');
    expect(mockWalletRepo.create._calls.length).toBe(0);
  });

  test('should write WalletCreatedEvent to outbox for new wallet', async () => {
    mockWalletRepo.findByPlayerId.mockResolvedValue(null);

    await useCase.execute({ playerId: 'player-1' });

    expect(mockPrisma.$transaction._calls.length).toBe(1);
    expect(mockOutboxWriter.writeWithinTransaction._calls.length).toBe(1);
    const events = mockOutboxWriter.writeWithinTransaction._calls[0][2];
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].eventType).toBe('WalletCreated');
  });

  test('should NOT write to outbox for existing wallet', async () => {
    const existingWallet = Wallet.restore('wallet-1', 'player-1', 5000n, 1);
    mockWalletRepo.findByPlayerId.mockResolvedValue(existingWallet);

    await useCase.execute({ playerId: 'player-1' });

    expect(mockPrisma.$transaction._calls.length).toBe(0);
    expect(mockOutboxWriter.writeWithinTransaction._calls.length).toBe(0);
  });

  test('should return correct output with walletId, playerId, balance', async () => {
    mockWalletRepo.findByPlayerId.mockResolvedValue(null);

    const result = await useCase.execute({ playerId: 'player-1' });

    expect(result).toHaveProperty('walletId');
    expect(result).toHaveProperty('playerId');
    expect(result).toHaveProperty('balance');
    expect(result.playerId).toBe('player-1');
    expect(typeof result.walletId).toBe('string');
    expect(result.walletId.length).toBeGreaterThan(0);
  });

  test('should initialize balance at "0.00"', async () => {
    mockWalletRepo.findByPlayerId.mockResolvedValue(null);

    const result = await useCase.execute({ playerId: 'player-1' });

    expect(result.balance).toBe('0.00');
  });
});
