import { describe, test, expect, beforeEach } from 'bun:test';
import { Money, PlayerId, RoundId } from '@crash/domain';
import { VerifyRoundUseCase } from '../../../src/application/use-cases/verify-round.use-case';
import { Round, type RoundSnapshot } from '../../../src/domain/entities/round.entity';
import { CrashPoint } from '../../../src/domain/value-objects/crash-point.value-object';
import {
  RoundNotFoundError,
  SeedNotAvailableError,
} from '../../../src/domain/errors/domain.errors';
import { createMockRoundRepository } from '../../helpers/mocks';

async function createCrashedRound(): Promise<Round> {
  const round = await Round.create(undefined, 'test-crash-2.00');
  const p1 = PlayerId.from('player-1');
  round.placeBet(p1, 'Player One', Money.fromDecimal('10.00'));
  round.getBetByPlayer(p1)!.confirm();
  await round.startRound();
  round.crash();
  round.pullEvents();
  return round;
}

/** Restores a persisted copy of the round with tampered fields. */
function tampered(round: Round, changes: Partial<RoundSnapshot>): Round {
  return Round.restore({ ...round.toPersistence(), ...changes }, []);
}

describe('VerifyRoundUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let useCase: VerifyRoundUseCase;

  beforeEach(() => {
    roundRepository = createMockRoundRepository();
    useCase = new VerifyRoundUseCase(roundRepository as any);
  });

  test('should reveal the seed and verify a fair crashed round', async () => {
    // Arrange
    const round = await createCrashedRound();
    roundRepository.findById.mockResolvedValue(round);

    // Act
    const result = await useCase.execute({ roundId: round.id });

    // Assert
    expect(roundRepository.findById.calls).toEqual([[round.id]]);
    expect(result).toEqual({
      roundId: round.id,
      seed: round.getSeed(),
      seedHash: round.getSeedHash(),
      salt: round.getSeed(),
      crashPoint: round.getCrashPoint()!,
      verified: true,
      verificationFormula: CrashPoint.FORMULA,
    });
  });

  test('should verify a crashed round restored from persistence', async () => {
    // Arrange
    const round = await createCrashedRound();
    roundRepository.findById.mockResolvedValue(tampered(round, {}));

    // Act
    const result = await useCase.execute({ roundId: round.id });

    // Assert
    expect(result.verified).toBe(true);
  });

  test('should not verify when the stored crash point does not match the seed', async () => {
    // Arrange
    const round = await createCrashedRound();
    const crashPoint = round.getCrashPoint()! + 1;
    roundRepository.findById.mockResolvedValue(tampered(round, { crashPoint }));

    // Act
    const result = await useCase.execute({ roundId: round.id });

    // Assert
    expect(result.crashPoint).toBe(crashPoint);
    expect(result.verified).toBe(false);
  });

  test('should not verify when the seed does not match the committed hash', async () => {
    // Arrange
    const round = await createCrashedRound();
    roundRepository.findById.mockResolvedValue(tampered(round, { seedHash: 'f'.repeat(64) }));

    // Act
    const result = await useCase.execute({ roundId: round.id });

    // Assert
    expect(result.seedHash).toBe('f'.repeat(64));
    expect(result.verified).toBe(false);
  });

  test('should throw RoundNotFoundError for a non-existent round', async () => {
    // Arrange
    roundRepository.findById.mockResolvedValue(null);

    // Act & Assert
    await expect(useCase.execute({ roundId: RoundId.from('non-existent-id') })).rejects.toThrow(
      RoundNotFoundError,
    );
  });

  test('should throw SeedNotAvailableError for a round still in betting', async () => {
    // Arrange
    const round = await Round.create();
    roundRepository.findById.mockResolvedValue(round);

    // Act & Assert
    await expect(useCase.execute({ roundId: round.id })).rejects.toThrow(SeedNotAvailableError);
  });

  test('should throw SeedNotAvailableError for an active round', async () => {
    // Arrange
    const round = await Round.create(undefined, 'test-crash-10.0');
    await round.startRound();
    roundRepository.findById.mockResolvedValue(round);

    // Act & Assert
    await expect(useCase.execute({ roundId: round.id })).rejects.toThrow(SeedNotAvailableError);
  });
});
