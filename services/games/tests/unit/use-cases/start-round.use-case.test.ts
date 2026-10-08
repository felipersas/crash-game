import { describe, test, expect, beforeEach } from 'bun:test';
import { StartRoundUseCase } from '../../../src/application/use-cases/start-round.use-case';
import { Round, RoundStatus } from '../../../src/domain/entities/round.entity';
import {
  InvalidRoundStateError,
  OptimisticLockError,
  RoundNotFoundError,
} from '../../../src/domain/errors/domain.errors';
import {
  FAKE_TX,
  createMockBroadcaster,
  createMockRoundRepository,
  createMockUnitOfWork,
} from '../../helpers/mocks';

async function createBettingRound(): Promise<Round> {
  const round = await Round.create(undefined, 'test-crash-10.0');
  round.pullEvents();
  return round;
}

/** Persisted copy of a round, as the repository would return it. */
function persistedCopyOf(round: Round): Round {
  return Round.restore(round.toPersistence(), []);
}

describe('StartRoundUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let broadcaster: ReturnType<typeof createMockBroadcaster>;
  let useCase: StartRoundUseCase;

  beforeEach(() => {
    roundRepository = createMockRoundRepository();
    unitOfWork = createMockUnitOfWork();
    broadcaster = createMockBroadcaster();
    useCase = new StartRoundUseCase(roundRepository as any, unitOfWork as any, broadcaster as any);
  });

  test('should start the round and commit it with its BettingPhaseEnded event', async () => {
    // Arrange
    const round = await createBettingRound();

    // Act
    const result = await useCase.execute({ round });

    // Assert
    expect(result.round).toBe(round);
    expect(round.getStatus()).toBe(RoundStatus.ACTIVE);
    expect(round.getCrashPoint()).not.toBeNull();
    expect(unitOfWork.commit.callCount).toBe(1);
    expect(unitOfWork.commits[0]!.aggregateId).toBe(round.id);
    expect(unitOfWork.committedEvents.map((e) => e.eventType)).toEqual(['BettingPhaseEnded']);
    expect(roundRepository.save.calls).toEqual([[round, FAKE_TX]]);
    expect(roundRepository.findById.callCount).toBe(0);
  });

  test('should broadcast that betting ended', async () => {
    // Arrange
    const round = await createBettingRound();

    // Act
    await useCase.execute({ round });

    // Assert
    expect(broadcaster.broadcastBettingEnded.calls).toEqual([[round.id]]);
  });

  describe('optimistic lock conflict', () => {
    test('should use the reloaded round when another writer already started it', async () => {
      // Arrange
      const round = await createBettingRound();
      const otherWriterCopy = persistedCopyOf(round);
      await otherWriterCopy.startRound();
      const reloaded = persistedCopyOf(otherWriterCopy);
      roundRepository.save.mockRejectedValue(new OptimisticLockError());
      roundRepository.findById.mockResolvedValue(reloaded);

      // Act
      const result = await useCase.execute({ round });

      // Assert
      expect(result.round).toBe(reloaded);
      expect(result.round.getStatus()).toBe(RoundStatus.ACTIVE);
      expect(roundRepository.findById.calls).toEqual([[round.id]]);
      expect(roundRepository.save.callCount).toBe(1);
      expect(unitOfWork.commits).toHaveLength(0);
      expect(broadcaster.broadcastBettingEnded.calls).toEqual([[round.id]]);
    });

    test('should retry once on the reloaded round when it is still BETTING', async () => {
      // Arrange
      const round = await createBettingRound();
      const reloaded = persistedCopyOf(round);
      let saveAttempts = 0;
      roundRepository.save.mockImplementation(async () => {
        saveAttempts++;
        if (saveAttempts === 1) throw new OptimisticLockError();
      });
      roundRepository.findById.mockResolvedValue(reloaded);

      // Act
      const result = await useCase.execute({ round });

      // Assert
      expect(result.round).toBe(reloaded);
      expect(reloaded.getStatus()).toBe(RoundStatus.ACTIVE);
      expect(roundRepository.save.callCount).toBe(2);
      expect(roundRepository.save.calls[1]).toEqual([reloaded, FAKE_TX]);
      expect(unitOfWork.commits).toHaveLength(1);
      expect(unitOfWork.committedEvents.map((e) => e.eventType)).toEqual(['BettingPhaseEnded']);
      expect(broadcaster.broadcastBettingEnded.calls).toEqual([[round.id]]);
    });

    test('should propagate a second conflict on retry', async () => {
      // Arrange
      const round = await createBettingRound();
      roundRepository.save.mockRejectedValue(new OptimisticLockError());
      roundRepository.findById.mockResolvedValue(persistedCopyOf(round));

      // Act & Assert
      await expect(useCase.execute({ round })).rejects.toThrow(OptimisticLockError);
      expect(roundRepository.save.callCount).toBe(2);
      expect(broadcaster.broadcastBettingEnded.callCount).toBe(0);
    });

    test('should throw RoundNotFoundError when the round disappeared', async () => {
      // Arrange
      const round = await createBettingRound();
      roundRepository.save.mockRejectedValue(new OptimisticLockError());
      roundRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(useCase.execute({ round })).rejects.toThrow(RoundNotFoundError);
      expect(broadcaster.broadcastBettingEnded.callCount).toBe(0);
    });

    test('should reject a reloaded round that already crashed', async () => {
      // Arrange
      const round = await createBettingRound();
      const otherWriterCopy = persistedCopyOf(round);
      await otherWriterCopy.startRound();
      otherWriterCopy.crash();
      roundRepository.save.mockRejectedValue(new OptimisticLockError());
      roundRepository.findById.mockResolvedValue(persistedCopyOf(otherWriterCopy));

      // Act & Assert
      await expect(useCase.execute({ round })).rejects.toThrow(InvalidRoundStateError);
      expect(broadcaster.broadcastBettingEnded.callCount).toBe(0);
    });
  });

  test('should propagate non-lock persistence errors without reloading', async () => {
    // Arrange
    const round = await createBettingRound();
    roundRepository.save.mockRejectedValue(new Error('db down'));

    // Act & Assert
    await expect(useCase.execute({ round })).rejects.toThrow('db down');
    expect(roundRepository.findById.callCount).toBe(0);
    expect(unitOfWork.commits).toHaveLength(0);
    expect(broadcaster.broadcastBettingEnded.callCount).toBe(0);
  });

  test('should propagate domain errors for a round that is not BETTING', async () => {
    // Arrange
    const round = await createBettingRound();
    await round.startRound();
    round.pullEvents();

    // Act & Assert
    await expect(useCase.execute({ round })).rejects.toThrow(InvalidRoundStateError);
    expect(roundRepository.findById.callCount).toBe(0);
    expect(unitOfWork.commit.callCount).toBe(0);
    expect(broadcaster.broadcastBettingEnded.callCount).toBe(0);
  });
});
