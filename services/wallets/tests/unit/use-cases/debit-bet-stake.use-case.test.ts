/**
 * Unit tests for DebitBetStakeUseCase (bet saga step).
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { PlayerId, WalletId } from '@crash/domain';
import { DebitBetStakeUseCase } from '../../../src/application/use-cases/debit-bet-stake.use-case';
import { Wallet } from '../../../src/domain/entities/wallet.entity';
import { OptimisticLockError } from '../../../src/domain/errors/domain.errors';
import {
  FAKE_TX,
  createMockInboxRepository,
  createMockMetrics,
  createMockUnitOfWork,
  createMockWalletRepository,
} from '../../helpers/mocks';

const PLAYER_ID = '00000000-0000-4000-8000-000000000001';
const STAKE = {
  roundId: 'round-1',
  betId: 'bet-1',
  playerId: PLAYER_ID,
  amountCents: 1000n,
  inboxEventId: 'inbox-1',
};

function walletWithBalance(balanceCents: bigint): Wallet {
  return Wallet.restore(WalletId.from('wallet-1'), PlayerId.from(PLAYER_ID), balanceCents, 1);
}

describe('DebitBetStakeUseCase', () => {
  let walletRepository: ReturnType<typeof createMockWalletRepository>;
  let inboxRepository: ReturnType<typeof createMockInboxRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let metrics: ReturnType<typeof createMockMetrics>;
  let useCase: DebitBetStakeUseCase;

  beforeEach(() => {
    walletRepository = createMockWalletRepository();
    inboxRepository = createMockInboxRepository();
    unitOfWork = createMockUnitOfWork();
    metrics = createMockMetrics();
    useCase = new DebitBetStakeUseCase(
      walletRepository as any,
      inboxRepository as any,
      unitOfWork as any,
      metrics as any,
    );
  });

  describe('when the wallet covers the stake', () => {
    test('debits the wallet and replies WalletDebited in the same commit', async () => {
      // Arrange
      const wallet = walletWithBalance(5000n);
      walletRepository.findByPlayerId.mockResolvedValue(wallet);

      // Act
      const result = await useCase.execute(STAKE);

      // Assert
      expect(result).toEqual({ debited: true });
      expect(wallet.getBalance().toCents()).toBe(4000n);
      expect(unitOfWork.commits).toHaveLength(1);
      expect(unitOfWork.commits[0].aggregateId).toBe(wallet.id);
      expect(unitOfWork.commits[0].events.map((e) => e.eventType)).toEqual([
        'MoneyDebited',
        'WalletDebited',
      ]);
      expect(walletRepository.save.calls).toEqual([[wallet, FAKE_TX]]);
    });

    test('marks the inbox event processed inside the transaction', async () => {
      walletRepository.findByPlayerId.mockResolvedValue(walletWithBalance(5000n));

      await useCase.execute(STAKE);

      expect(inboxRepository.markAsProcessed.calls).toEqual([['inbox-1', FAKE_TX]]);
    });

    test('replies with the bet references and stake amount', async () => {
      walletRepository.findByPlayerId.mockResolvedValue(walletWithBalance(5000n));

      await useCase.execute(STAKE);

      const reply = unitOfWork.committedEvents.find((e) => e.eventType === 'WalletDebited');
      expect(reply).toMatchObject({
        aggregateId: 'round-1',
        roundId: 'round-1',
        betId: 'bet-1',
        playerId: PLAYER_ID,
        amount: 1000n,
      });
    });

    test('records the debit metric', async () => {
      walletRepository.findByPlayerId.mockResolvedValue(walletWithBalance(5000n));

      await useCase.execute(STAKE);

      expect(metrics.incrWalletOp.calls).toEqual([['debit', 1000]]);
    });
  });

  describe('when the stake is rejected', () => {
    test('replies WalletDebitFailed for insufficient funds without touching the wallet', async () => {
      // Arrange
      const wallet = walletWithBalance(500n);
      walletRepository.findByPlayerId.mockResolvedValue(wallet);

      // Act
      const result = await useCase.execute(STAKE);

      // Assert
      expect(result.debited).toBe(false);
      expect(result.reason).toContain('Insufficient funds');
      expect(wallet.getBalance().toCents()).toBe(500n);
      expect(walletRepository.save.callCount).toBe(0);
      expect(unitOfWork.commits).toHaveLength(1);
      expect(unitOfWork.commits[0].aggregateId).toBe('round-1');
      expect(unitOfWork.commits[0].events).toHaveLength(1);
      expect(unitOfWork.commits[0].events[0]).toMatchObject({
        eventType: 'WalletDebitFailed',
        betId: 'bet-1',
        reason: result.reason,
      });
    });

    test('replies WalletDebitFailed when the player has no wallet', async () => {
      const result = await useCase.execute(STAKE);

      expect(result).toEqual({ debited: false, reason: 'Wallet not found' });
      expect(unitOfWork.committedEvents.map((e) => e.eventType)).toEqual(['WalletDebitFailed']);
    });

    test('marks the inbox event processed with the failure reply (final outcome, no retry)', async () => {
      walletRepository.findByPlayerId.mockResolvedValue(walletWithBalance(0n));

      await useCase.execute(STAKE);

      expect(inboxRepository.markAsProcessed.calls).toEqual([['inbox-1', FAKE_TX]]);
    });

    test('does not record a debit metric', async () => {
      await useCase.execute(STAKE);

      expect(metrics.incrWalletOp.callCount).toBe(0);
    });
  });

  describe('when the failure is transient', () => {
    test('rethrows optimistic lock conflicts without replying, so the message is retried', async () => {
      // Arrange
      walletRepository.findByPlayerId.mockResolvedValue(walletWithBalance(5000n));
      walletRepository.save.mockRejectedValue(new OptimisticLockError('wallet-1'));

      // Act & Assert
      await expect(useCase.execute(STAKE)).rejects.toThrow(OptimisticLockError);
      expect(unitOfWork.commits).toHaveLength(0);
      expect(inboxRepository.markAsProcessed.callCount).toBe(0);
    });

    test('rethrows infrastructure errors', async () => {
      walletRepository.findByPlayerId.mockRejectedValue(new Error('connection lost'));

      await expect(useCase.execute(STAKE)).rejects.toThrow('connection lost');
      expect(unitOfWork.commits).toHaveLength(0);
    });
  });

  test('works without an inbox event (direct invocation)', async () => {
    walletRepository.findByPlayerId.mockResolvedValue(walletWithBalance(5000n));

    await useCase.execute({ ...STAKE, inboxEventId: undefined });

    expect(inboxRepository.markAsProcessed.callCount).toBe(0);
    expect(unitOfWork.commits).toHaveLength(1);
  });
});
