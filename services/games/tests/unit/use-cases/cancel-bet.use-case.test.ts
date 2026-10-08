import { describe, test, expect, beforeEach } from 'bun:test';
import { BetId, PlayerId, RoundId } from '@crash/domain';
import { CancelBetUseCase } from '../../../src/application/use-cases/cancel-bet.use-case';
import { Bet, BetStatus, type BetSnapshot } from '../../../src/domain/entities/bet.entity';
import { BetNotFoundError, InvalidBetStateError } from '../../../src/domain/errors/domain.errors';
import {
  FAKE_TX,
  createMockAutoCashOutRepository,
  createMockBetRepository,
  createMockBroadcaster,
  createMockMetrics,
  createMockUnitOfWork,
} from '../../helpers/mocks';

const PLAYER_ID = PlayerId.from('player-123');
const PLAYER_NAME = 'Player 123';
const ROUND_ID = RoundId.from('round-1');
const REASON = 'Insufficient funds';

function restoreBet(overrides: Partial<BetSnapshot> = {}): Bet {
  return Bet.restore({
    id: BetId.create(),
    roundId: ROUND_ID,
    playerId: PLAYER_ID,
    playerName: PLAYER_NAME,
    amountCents: 1000n,
    status: BetStatus.PENDING,
    autoCashOutMultiplier: null,
    cashOutMultiplier: null,
    cashOutAmount: null,
    cashedOutAt: null,
    cancelReason: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe('CancelBetUseCase', () => {
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let autoCashOutRepository: ReturnType<typeof createMockAutoCashOutRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let broadcaster: ReturnType<typeof createMockBroadcaster>;
  let metrics: ReturnType<typeof createMockMetrics>;
  let useCase: CancelBetUseCase;

  beforeEach(() => {
    betRepository = createMockBetRepository();
    autoCashOutRepository = createMockAutoCashOutRepository();
    unitOfWork = createMockUnitOfWork();
    broadcaster = createMockBroadcaster();
    metrics = createMockMetrics();
    useCase = new CancelBetUseCase(
      betRepository as never,
      autoCashOutRepository as never,
      unitOfWork as never,
      broadcaster as never,
      metrics as never,
    );
  });

  describe('Happy path', () => {
    test('should cancel a pending bet with the given reason', async () => {
      // Arrange
      const bet = restoreBet();
      betRepository.findById.mockResolvedValue(bet);

      // Act
      const result = await useCase.execute({
        roundId: ROUND_ID,
        betId: bet.id,
        playerId: PLAYER_ID,
        reason: REASON,
      });

      // Assert
      expect(result).toEqual({
        betId: bet.id,
        roundId: ROUND_ID,
        playerId: PLAYER_ID,
        reason: REASON,
      });
      expect(bet.getStatus()).toBe(BetStatus.CANCELLED);
      expect(bet.getCancelReason()).toBe(REASON);
      expect(betRepository.findById.calls).toEqual([[bet.id]]);
    });

    test('should persist the bet and commit BetCancelled in the unit of work', async () => {
      // Arrange
      const bet = restoreBet();
      betRepository.findById.mockResolvedValue(bet);

      // Act
      await useCase.execute({
        roundId: ROUND_ID,
        betId: bet.id,
        playerId: PLAYER_ID,
        reason: REASON,
      });

      // Assert
      expect(betRepository.update.calls).toEqual([[bet, FAKE_TX]]);
      expect(unitOfWork.commits).toHaveLength(1);
      expect(unitOfWork.commits[0].aggregateId).toBe(ROUND_ID);
      const events = unitOfWork.committedEvents;
      expect(events.map((e) => e.eventType)).toEqual(['BetCancelled']);
      expect(events[0]).toMatchObject({
        betId: bet.id,
        playerId: PLAYER_ID,
        amount: 1000n,
        reason: REASON,
      });
    });

    test('should broadcast the cancellation and record metrics', async () => {
      // Arrange
      const bet = restoreBet();
      betRepository.findById.mockResolvedValue(bet);

      // Act
      await useCase.execute({
        roundId: ROUND_ID,
        betId: bet.id,
        playerId: PLAYER_ID,
        reason: REASON,
      });

      // Assert
      expect(broadcaster.broadcastBetCancelled.calls[0][0]).toEqual({
        roundId: ROUND_ID,
        betId: bet.id,
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        amountCents: 1000n,
        reason: REASON,
      });
      expect(metrics.incrBet.calls).toEqual([['cancelled', 1000]]);
    });
  });

  describe('Bet ownership', () => {
    test('should throw BetNotFoundError when the bet does not exist', async () => {
      // Arrange
      betRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        useCase.execute({
          roundId: ROUND_ID,
          betId: BetId.create(),
          playerId: PLAYER_ID,
          reason: REASON,
        }),
      ).rejects.toThrow(BetNotFoundError);
      expect(unitOfWork.commit.callCount).toBe(0);
    });

    test('should throw BetNotFoundError when the bet belongs to another player', async () => {
      // Arrange
      const bet = restoreBet({ playerId: PlayerId.from('someone-else') });
      betRepository.findById.mockResolvedValue(bet);

      // Act & Assert
      await expect(
        useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID, reason: REASON }),
      ).rejects.toThrow(BetNotFoundError);
      expect(bet.getStatus()).toBe(BetStatus.PENDING);
      expect(unitOfWork.commit.callCount).toBe(0);
    });

    test('should throw BetNotFoundError when the bet belongs to another round', async () => {
      // Arrange
      const bet = restoreBet({ roundId: RoundId.from('other-round') });
      betRepository.findById.mockResolvedValue(bet);

      // Act & Assert
      await expect(
        useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID, reason: REASON }),
      ).rejects.toThrow(BetNotFoundError);
      expect(unitOfWork.commit.callCount).toBe(0);
    });

    test('should not cancel the newer bet when the reply refers to an old replaced bet (regression)', async () => {
      // Arrange: the old bet was replaced (CANCELLED); a newer PENDING bet exists
      const oldBet = restoreBet({
        status: BetStatus.CANCELLED,
        cancelReason: 'Replaced by new bet attempt',
      });
      const newerBet = restoreBet();
      betRepository.findById.mockImplementation(async (id: string) =>
        id === oldBet.id ? oldBet : id === newerBet.id ? newerBet : null,
      );
      betRepository.findByPlayerAndRound.mockResolvedValue(newerBet);

      // Act & Assert
      await expect(
        useCase.execute({
          roundId: ROUND_ID,
          betId: oldBet.id,
          playerId: PLAYER_ID,
          reason: REASON,
        }),
      ).rejects.toThrow(InvalidBetStateError);
      expect(newerBet.getStatus()).toBe(BetStatus.PENDING);
      expect(betRepository.findByPlayerAndRound.callCount).toBe(0);
      expect(unitOfWork.commit.callCount).toBe(0);
      expect(autoCashOutRepository.removeTarget.callCount).toBe(0);
      expect(broadcaster.broadcastBetCancelled.callCount).toBe(0);
    });

    test('should throw InvalidBetStateError when the bet is already ACTIVE', async () => {
      // Arrange
      const bet = restoreBet({ status: BetStatus.ACTIVE });
      betRepository.findById.mockResolvedValue(bet);

      // Act & Assert
      await expect(
        useCase.execute({ roundId: ROUND_ID, betId: bet.id, playerId: PLAYER_ID, reason: REASON }),
      ).rejects.toThrow(InvalidBetStateError);
      expect(bet.getStatus()).toBe(BetStatus.ACTIVE);
      expect(unitOfWork.commit.callCount).toBe(0);
    });
  });

  describe('Auto cash-out', () => {
    test('should remove the auto cash-out target after the commit', async () => {
      // Arrange
      const bet = restoreBet({ autoCashOutMultiplier: 2.5 });
      betRepository.findById.mockResolvedValue(bet);
      let commitsAtRemoval = -1;
      autoCashOutRepository.removeTarget.mockImplementation(async () => {
        commitsAtRemoval = unitOfWork.commits.length;
      });

      // Act
      await useCase.execute({
        roundId: ROUND_ID,
        betId: bet.id,
        playerId: PLAYER_ID,
        reason: REASON,
      });

      // Assert
      expect(autoCashOutRepository.removeTarget.calls).toEqual([[ROUND_ID, PLAYER_ID]]);
      expect(commitsAtRemoval).toBe(1);
    });

    test('should log and continue when removing the auto cash-out target fails', async () => {
      // Arrange
      const bet = restoreBet();
      betRepository.findById.mockResolvedValue(bet);
      autoCashOutRepository.removeTarget.mockRejectedValue(new Error('redis down'));

      // Act
      const result = await useCase.execute({
        roundId: ROUND_ID,
        betId: bet.id,
        playerId: PLAYER_ID,
        reason: REASON,
      });

      // Assert
      expect(result.betId).toBe(bet.id);
      expect(bet.getStatus()).toBe(BetStatus.CANCELLED);
      expect(broadcaster.broadcastBetCancelled.callCount).toBe(1);
    });
  });
});
