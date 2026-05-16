/**
 * Unit tests for GetWalletUseCase
 *
 * Tests cover:
 * - Happy path: returning wallet for existing player
 * - Error: wallet not found
 * - Output format: balance as string (cents), correct version
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { GetWalletUseCase } from '../../../src/application/use-cases/get-wallet.use-case';
import { Wallet } from '../../../src/domain/entities/wallet.entity';
import { WalletNotFoundError } from '../../../src/domain/errors/domain.errors';
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

describe('GetWalletUseCase', () => {
  let mockWalletRepo: ReturnType<typeof createMockWalletRepository>;
  let useCase: GetWalletUseCase;

  beforeEach(() => {
    mockWalletRepo = createMockWalletRepository();
    useCase = new GetWalletUseCase(mockWalletRepo as any);
  });

  test('should return wallet for existing player', async () => {
    const wallet = Wallet.restore(WalletId.from('wallet-1'), PlayerId.from('player-1'), 10000n, 1);
    mockWalletRepo.findByPlayerId.mockResolvedValue(wallet);

    const result = await useCase.execute({ playerId: PlayerId.from('player-1') });

    expect(result.walletId).toBe('wallet-1');
    expect(result.playerId).toBe('player-1');
  });

  test('should throw WalletNotFoundError when no wallet found', async () => {
    mockWalletRepo.findByPlayerId.mockResolvedValue(null);

    expect(useCase.execute({ playerId: PlayerId.from('unknown-player') })).rejects.toThrow(WalletNotFoundError);
  });

  test('should return balance as string (cents)', async () => {
    const wallet = Wallet.restore(WalletId.from('wallet-1'), PlayerId.from('player-1'), 10000n, 1);
    mockWalletRepo.findByPlayerId.mockResolvedValue(wallet);

    const result = await useCase.execute({ playerId: PlayerId.from('player-1') });

    expect(result.balance).toBe('10000');
    expect(typeof result.balance).toBe('string');
  });

  test('should return correct version number', async () => {
    const wallet = Wallet.restore(WalletId.from('wallet-1'), PlayerId.from('player-1'), 5000n, 7);
    mockWalletRepo.findByPlayerId.mockResolvedValue(wallet);

    const result = await useCase.execute({ playerId: PlayerId.from('player-1') });

    expect(result.version).toBe(7);
  });
});
