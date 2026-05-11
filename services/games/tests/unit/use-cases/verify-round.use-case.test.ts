import { describe, test, expect, beforeEach } from 'bun:test';
import { VerifyRoundUseCase } from '../../../src/application/use-cases/verify-round.use-case';
import { Round } from '../../../src/domain/entities/round.entity';
import { Money } from '@crash/domain';
import {
  RoundNotFoundError,
  SeedNotAvailableError,
} from '../../../src/domain/errors/domain.errors';

function mockFn<T extends (...args: any[]) => any>(
  impl?: T,
): T & { mockReturnValue: (v: any) => void; mockResolvedValue: (v: any) => void } {
  const fn: any = (...args: any[]) => fn._impl(...args);
  fn._impl = impl || (() => {});
  fn.mockReturnValue = (v: any) => {
    fn._impl = () => v;
  };
  fn.mockResolvedValue = (v: any) => {
    fn._impl = () => Promise.resolve(v);
  };
  return fn;
}

describe('VerifyRoundUseCase', () => {
  let useCase: VerifyRoundUseCase;
  let mockRoundRepo: any;

  beforeEach(() => {
    mockRoundRepo = {
      findById: mockFn(async () => null),
    };
    useCase = new VerifyRoundUseCase(mockRoundRepo);
  });

  // Create a real crashed round using deterministic seed for reproducibility
  async function createCrashedRound(): Promise<Round> {
    const round = await Round.create(undefined, 'test-crash-2.00');
    round.placeBet('player-1', 'Player One', Money.fromDecimal('10.00'));
    round.getBetByPlayer('player-1')!.confirm();
    await round.startRound();
    // Force crash
    round.updateMultiplier(1000);
    return round;
  }

  test('Should verify a crashed round and return verification result', async () => {
    const round = await createCrashedRound();
    mockRoundRepo.findById.mockResolvedValue(round);

    const result = await useCase.execute({ roundId: round.id });

    expect(result.roundId).toBe(round.id);
    expect(result.seed).toBeDefined();
    expect(result.seedHash).toBeDefined();
    expect(result.crashPoint).toBeGreaterThan(0);
    expect(typeof result.verified).toBe('boolean');
    expect(result.verificationFormula).toBeDefined();
    expect(result.verificationFormula).toContain('SHA-256');
  });

  test('Should throw RoundNotFoundError for non-existent round', async () => {
    mockRoundRepo.findById.mockResolvedValue(null);

    expect(useCase.execute({ roundId: 'non-existent-id' })).rejects.toThrow(RoundNotFoundError);
  });

  test('Should throw UnauthorizedException for non-crashed round', async () => {
    // Create a round that is still in BETTING state (not started/crashed)
    const round = await Round.create();
    mockRoundRepo.findById.mockResolvedValue(round);

    expect(useCase.execute({ roundId: round.id })).rejects.toThrow(SeedNotAvailableError);
  });

  test('Should show verified: true when seed hash matches and crash point matches', async () => {
    const round = await createCrashedRound();
    mockRoundRepo.findById.mockResolvedValue(round);

    const result = await useCase.execute({ roundId: round.id });

    // Using a real crashed round with real crypto, verification should pass
    expect(result.verified).toBe(true);
    expect(result.crashPoint).toBe(round.getCrashPoint());
    expect(result.seed).toBe(round.getSeed());
    expect(result.seedHash).toBe(round.getSeedHash());
  });

  test('Should return correct verification formula', async () => {
    const round = await createCrashedRound();
    mockRoundRepo.findById.mockResolvedValue(round);

    const result = await useCase.execute({ roundId: round.id });

    expect(result.verificationFormula).toBe(
      'SHA-256(seed) \u2192 extract first 52 bits \u2192 crash = max(1.00, (1 - 0.04) / (bits / 2^52))',
    );
  });
});
