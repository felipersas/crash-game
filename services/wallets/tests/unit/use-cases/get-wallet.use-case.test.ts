/**
 * Unit tests for GetWalletUseCase.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { PlayerId, WalletId } from '@crash/domain';
import { GetWalletUseCase } from '../../../src/application/use-cases/get-wallet.use-case';
import { Wallet } from '../../../src/domain/entities/wallet.entity';
import { WalletNotFoundError } from '../../../src/domain/errors/domain.errors';
import { createMockWalletRepository } from '../../helpers/mocks';

const PLAYER_ID = PlayerId.from('player-1');

describe('GetWalletUseCase', () => {
  let walletRepository: ReturnType<typeof createMockWalletRepository>;
  let useCase: GetWalletUseCase;

  beforeEach(() => {
    walletRepository = createMockWalletRepository();
    useCase = new GetWalletUseCase(walletRepository as any);
  });

  test('returns the player wallet with balance in cents and version', async () => {
    // Arrange
    walletRepository.findByPlayerId.mockResolvedValue(
      Wallet.restore(WalletId.from('wallet-1'), PLAYER_ID, 12345n, 7),
    );

    // Act
    const result = await useCase.execute({ playerId: PLAYER_ID });

    // Assert
    expect(result).toEqual({
      walletId: 'wallet-1',
      playerId: PLAYER_ID,
      balanceCents: 12345n,
      version: 7,
    });
    expect(walletRepository.findByPlayerId.calls).toEqual([[PLAYER_ID]]);
  });

  test('keeps precision for balances beyond Number.MAX_SAFE_INTEGER', async () => {
    const huge = 900719925474099312n;
    walletRepository.findByPlayerId.mockResolvedValue(
      Wallet.restore(WalletId.from('wallet-1'), PLAYER_ID, huge, 1),
    );

    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(result.balanceCents).toBe(huge);
  });

  test('throws WalletNotFoundError when the player has no wallet', async () => {
    await expect(useCase.execute({ playerId: PLAYER_ID })).rejects.toThrow(WalletNotFoundError);
  });
});
