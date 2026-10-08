/**
 * Unit tests for CreateWalletUseCase.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { PlayerId, WalletId } from '@crash/domain';
import { CreateWalletUseCase } from '../../../src/application/use-cases/create-wallet.use-case';
import { Wallet } from '../../../src/domain/entities/wallet.entity';
import { FAKE_TX, createMockUnitOfWork, createMockWalletRepository } from '../../helpers/mocks';

const PLAYER_ID = PlayerId.from('player-1');

describe('CreateWalletUseCase', () => {
  let walletRepository: ReturnType<typeof createMockWalletRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let useCase: CreateWalletUseCase;

  beforeEach(() => {
    walletRepository = createMockWalletRepository();
    unitOfWork = createMockUnitOfWork();
    useCase = new CreateWalletUseCase(walletRepository as any, unitOfWork as any);
  });

  test('creates a zero-balance wallet for a player without one', async () => {
    // Act
    const result = await useCase.execute({ playerId: PLAYER_ID });

    // Assert
    expect(result.playerId).toBe(PLAYER_ID);
    expect(result.balanceCents).toBe(0n);
    expect(result.walletId).toBeDefined();
    expect(walletRepository.create.callCount).toBe(1);
    expect(walletRepository.create.calls[0][1]).toBe(FAKE_TX);
  });

  test('commits WalletCreated keyed by the new wallet', async () => {
    const result = await useCase.execute({ playerId: PLAYER_ID });

    expect(unitOfWork.commits).toHaveLength(1);
    expect(unitOfWork.commits[0].aggregateId).toBe(result.walletId);
    expect(unitOfWork.commits[0].events.map((e) => e.eventType)).toEqual(['WalletCreated']);
  });

  test('returns the existing wallet without creating another (idempotent)', async () => {
    // Arrange
    const existing = Wallet.restore(WalletId.from('wallet-1'), PLAYER_ID, 2500n, 3);
    walletRepository.findByPlayerId.mockResolvedValue(existing);

    // Act
    const result = await useCase.execute({ playerId: PLAYER_ID });

    // Assert
    expect(result).toEqual({ walletId: 'wallet-1', playerId: PLAYER_ID, balanceCents: 2500n });
    expect(walletRepository.create.callCount).toBe(0);
    expect(unitOfWork.commits).toHaveLength(0);
  });
});
