/**
 * Unit tests for CreateWalletUseCase
 *
 * Tests cover:
 * - Happy path: new wallet creation
 * - Idempotency: returning existing wallet
 * - Event publishing: WalletCreatedEvent emitted only for new wallets
 * - Output correctness: walletId, playerId, balance
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { CreateWalletUseCase } from '../../../src/application/use-cases/create-wallet.use-case';
import { Wallet } from '../../../src/domain/entities/wallet.entity';

// --- Mock helpers ---

function mockFn<T extends (...args: any[]) => any>(impl?: T): T & { mockReturnValue: (v: any) => void; mockResolvedValue: (v: any) => void } {
  const calls: any[] = [];
  const fn: any = (...args: any[]) => {
    calls.push(args);
    return (fn._impl as any)(...args);
  };
  fn._impl = impl || (() => {});
  fn._calls = calls;
  fn.mockReturnValue = (v: any) => { fn._impl = () => v; };
  fn.mockResolvedValue = (v: any) => { fn._impl = () => Promise.resolve(v); };
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

function createMockEventPublisher(overrides: Record<string, any> = {}) {
  return {
    publish: mockFn(() => Promise.resolve()),
    publishBatch: mockFn(() => Promise.resolve()),
    ...overrides,
  };
}

describe('CreateWalletUseCase', () => {
  let mockWalletRepo: ReturnType<typeof createMockWalletRepository>;
  let mockEventPublisher: ReturnType<typeof createMockEventPublisher>;
  let useCase: CreateWalletUseCase;

  beforeEach(() => {
    mockWalletRepo = createMockWalletRepository();
    mockEventPublisher = createMockEventPublisher();
    useCase = new CreateWalletUseCase(mockWalletRepo as any, mockEventPublisher as any);
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

  test('should emit WalletCreatedEvent for new wallet', async () => {
    mockWalletRepo.findByPlayerId.mockResolvedValue(null);

    await useCase.execute({ playerId: 'player-1' });

    expect(mockEventPublisher.publishBatch._calls.length).toBe(1);
    const publishedEvents = mockEventPublisher.publishBatch._calls[0][0];
    expect(publishedEvents.length).toBeGreaterThan(0);
    expect(publishedEvents[0].eventType).toBe('WalletCreated');
  });

  test('should NOT emit event for existing wallet', async () => {
    const existingWallet = Wallet.restore('wallet-1', 'player-1', 5000n, 1);
    mockWalletRepo.findByPlayerId.mockResolvedValue(existingWallet);

    await useCase.execute({ playerId: 'player-1' });

    expect(mockEventPublisher.publishBatch._calls.length).toBe(0);
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
