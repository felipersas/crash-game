/**
 * Unit tests for PlayerWalletResolver
 *
 * Tests cover:
 * - resolveWalletId: returns wallet ID for existing player
 * - resolveWalletId: throws WalletNotFoundError when no wallet
 * - resolveWallet: returns full wallet entity for existing player
 * - resolveWallet: throws WalletNotFoundError when no wallet
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { PlayerWalletResolver } from '../../../src/application/services/player-wallet-resolver.service';
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

describe('PlayerWalletResolver', () => {
  let mockWalletRepo: ReturnType<typeof createMockWalletRepository>;
  let resolver: PlayerWalletResolver;

  beforeEach(() => {
    mockWalletRepo = createMockWalletRepository();
    resolver = new PlayerWalletResolver(mockWalletRepo as any);
  });

  describe('resolveWalletId', () => {
    test('should return wallet ID for existing player', async () => {
      const wallet = Wallet.restore('wallet-1', 'player-1', 10000n, 1);
      mockWalletRepo.findByPlayerId.mockResolvedValue(wallet);

      const walletId = await resolver.resolveWalletId('player-1');

      expect(walletId).toBe('wallet-1');
    });

    test('should throw WalletNotFoundError when no wallet', async () => {
      mockWalletRepo.findByPlayerId.mockResolvedValue(null);

      expect(resolver.resolveWalletId('unknown-player')).rejects.toThrow(WalletNotFoundError);
    });
  });

  describe('resolveWallet', () => {
    test('should return full wallet entity for existing player', async () => {
      const wallet = Wallet.restore('wallet-1', 'player-1', 10000n, 3);
      mockWalletRepo.findByPlayerId.mockResolvedValue(wallet);

      const result = await resolver.resolveWallet('player-1');

      expect(result).toBe(wallet);
      expect(result.id).toBe('wallet-1');
      expect(result.playerId).toBe('player-1');
      expect(result.getBalance().toCents()).toBe(10000n);
      expect(result.getVersion()).toBe(3);
    });

    test('should throw WalletNotFoundError when no wallet', async () => {
      mockWalletRepo.findByPlayerId.mockResolvedValue(null);

      expect(resolver.resolveWallet('unknown-player')).rejects.toThrow(WalletNotFoundError);
    });
  });
});
