import { describe, test, expect, beforeEach } from 'bun:test';
import { CreateRoundUseCase } from '../../../src/application/use-cases/create-round.use-case';
import { Round } from '../../../src/domain/entities/round.entity';
import {
  FAKE_TX,
  createMockBroadcaster,
  createMockRoundRepository,
  createMockUnitOfWork,
} from '../../helpers/mocks';

describe('CreateRoundUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let broadcaster: ReturnType<typeof createMockBroadcaster>;
  let useCase: CreateRoundUseCase;

  beforeEach(() => {
    roundRepository = createMockRoundRepository();
    unitOfWork = createMockUnitOfWork();
    broadcaster = createMockBroadcaster();
    useCase = new CreateRoundUseCase(roundRepository as any, unitOfWork as any, broadcaster as any);
  });

  test('should persist the round and its RoundStarted event in one commit', async () => {
    // Arrange
    const round = await Round.create();

    // Act
    const result = await useCase.execute({ round });

    // Assert
    expect(result.round).toBe(round);
    expect(unitOfWork.commit.callCount).toBe(1);
    expect(unitOfWork.commits[0]!.aggregateId).toBe(round.id);
    expect(unitOfWork.committedEvents.map((e) => e.eventType)).toEqual(['RoundStarted']);
    expect(roundRepository.create.calls).toEqual([[round, FAKE_TX]]);
  });

  test('should drain the round event buffer', async () => {
    // Arrange
    const round = await Round.create();

    // Act
    await useCase.execute({ round });

    // Assert
    expect(round.pullEvents()).toHaveLength(0);
  });

  test('should announce the betting phase after committing', async () => {
    // Arrange
    const round = await Round.create();

    // Act
    await useCase.execute({ round });

    // Assert
    expect(broadcaster.broadcastRoundStarted.calls).toEqual([
      [
        {
          roundId: round.id,
          seedHash: round.getSeedHash(),
          bettingEndTime: round.getBettingEndTime()!,
        },
      ],
    ]);
  });

  test('should not broadcast when persisting fails', async () => {
    // Arrange
    const round = await Round.create();
    roundRepository.create.mockRejectedValue(new Error('db down'));

    // Act & Assert
    await expect(useCase.execute({ round })).rejects.toThrow('db down');
    expect(unitOfWork.commits).toHaveLength(0);
    expect(broadcaster.broadcastRoundStarted.callCount).toBe(0);
  });
});
