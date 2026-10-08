/**
 * Unit tests for CreditWalletUseCase.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { PlayerId, WalletId } from '@crash/domain';
import { CreditWalletUseCase } from '../../../src/application/use-cases/credit-wallet.use-case';
import { Wallet } from '../../../src/domain/entities/wallet.entity';
import { WalletNotFoundError } from '../../../src/domain/errors/domain.errors';
import {
  FAKE_TX,
  createMockInboxRepository,
  createMockMetrics,
  createMockUnitOfWork,
  createMockWalletRepository,
} from '../../helpers/mocks';

const PLAYER_ID = PlayerId.from('player-1');

describe('CreditWalletUseCase', () => {
  let walletRepository: ReturnType<typeof createMockWalletRepository>;
  let inboxRepository: ReturnType<typeof createMockInboxRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let metrics: ReturnType<typeof createMockMetrics>;
  let useCase: CreditWalletUseCase;
  let wallet: Wallet;

  beforeEach(() => {
    walletRepository = createMockWalletRepository();
    inboxRepository = createMockInboxRepository();
    unitOfWork = createMockUnitOfWork();
    metrics = createMockMetrics();
    useCase = new CreditWalletUseCase(
      walletRepository as any,
      inboxRepository as any,
      unitOfWork as any,
      metrics as any,
    );
    wallet = Wallet.restore(WalletId.from('wallet-1'), PLAYER_ID, 1000n, 1);
    walletRepository.findByPlayerId.mockResolvedValue(wallet);
  });

  test('credits the player wallet and returns the new balance and version', async () => {
    // Act
    const result = await useCase.execute({
      playerId: PLAYER_ID,
      amountCents: 2500n,
      reason: 'Cash out',
    });

    // Assert
    expect(result).toEqual({ walletId: 'wallet-1', newBalanceCents: 3500n, version: 2 });
  });

  test('saves the wallet and commits MoneyCredited in one transaction', async () => {
    await useCase.execute({ playerId: PLAYER_ID, amountCents: 2500n, reason: 'Cash out' });

    expect(walletRepository.save.calls).toEqual([[wallet, FAKE_TX]]);
    expect(unitOfWork.commits).toHaveLength(1);
    expect(unitOfWork.commits[0].aggregateId).toBe('wallet-1');
    expect(unitOfWork.commits[0].events).toHaveLength(1);
    expect(unitOfWork.commits[0].events[0]).toMatchObject({
      eventType: 'MoneyCredited',
      amount: 2500n,
      newBalance: 3500n,
      reason: 'Cash out',
    });
  });

  test('marks the inbox event processed inside the transaction', async () => {
    await useCase.execute({
      playerId: PLAYER_ID,
      amountCents: 2500n,
      reason: 'Cash out',
      inboxEventId: 'inbox-1',
    });

    expect(inboxRepository.markAsProcessed.calls).toEqual([['inbox-1', FAKE_TX]]);
  });

  test('records the credit metric', async () => {
    await useCase.execute({ playerId: PLAYER_ID, amountCents: 2500n, reason: 'Cash out' });

    expect(metrics.incrWalletOp.calls).toEqual([['credit', 2500]]);
  });

  test('throws WalletNotFoundError when the player has no wallet', async () => {
    walletRepository.findByPlayerId.mockResolvedValue(null);

    await expect(
      useCase.execute({ playerId: PLAYER_ID, amountCents: 2500n, reason: 'Cash out' }),
    ).rejects.toThrow(WalletNotFoundError);
    expect(unitOfWork.commits).toHaveLength(0);
  });

  test('does not record a metric when the commit fails', async () => {
    walletRepository.save.mockRejectedValue(new Error('db down'));

    await expect(
      useCase.execute({ playerId: PLAYER_ID, amountCents: 2500n, reason: 'Cash out' }),
    ).rejects.toThrow('db down');
    expect(metrics.incrWalletOp.callCount).toBe(0);
  });
});
