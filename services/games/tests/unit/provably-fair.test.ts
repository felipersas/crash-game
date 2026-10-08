/**
 * Unit tests for the provably fair domain service.
 */

import { describe, test, expect } from 'bun:test';
import { verifyRoundFairness } from '../../src/domain/services/provably-fair';
import { CrashPoint } from '../../src/domain/value-objects/crash-point.value-object';
import { SeedChain } from '../../src/domain/value-objects/seed-chain.value-object';
import { InvalidSeedError } from '../../src/domain/errors/domain.errors';
import { Round } from '../../src/domain/entities/round.entity';

describe('verifyRoundFairness', () => {
  async function honestRound() {
    const chain = await SeedChain.generate(3);
    const seed = chain.getSeed();
    const seedHash = chain.getCurrentSeedHash();
    const crashPoint = (await CrashPoint.fromSeed(seed)).getValue();
    return { seed, seedHash, crashPoint };
  }

  test('should verify an honest round', async () => {
    const { seed, seedHash, crashPoint } = await honestRound();

    const result = await verifyRoundFairness(seed, seedHash, crashPoint);

    expect(result).toEqual({
      seedMatchesCommitment: true,
      crashPointMatchesSeed: true,
      verified: true,
    });
  });

  test('should verify a crashed Round end to end', async () => {
    const round = await Round.create();
    await round.startRound();
    round.crash();

    const result = await verifyRoundFairness(
      round.getSeed(),
      round.getSeedHash(),
      round.getCrashPoint()!,
    );

    expect(result.verified).toBe(true);
  });

  test('should accept a crash point rounded to display precision', async () => {
    const { seed, seedHash, crashPoint } = await honestRound();
    const displayed = Math.floor(crashPoint * 100) / 100;

    const result = await verifyRoundFairness(seed, seedHash, displayed);

    expect(result.crashPointMatchesSeed).toBe(true);
    expect(result.verified).toBe(true);
  });

  test('should reject a seed that does not match the commitment', async () => {
    const { seed, crashPoint } = await honestRound();

    const result = await verifyRoundFairness(seed, 'f'.repeat(64), crashPoint);

    expect(result.seedMatchesCommitment).toBe(false);
    expect(result.crashPointMatchesSeed).toBe(true);
    expect(result.verified).toBe(false);
  });

  test('should reject a crash point not derived from the seed', async () => {
    const { seed, seedHash, crashPoint } = await honestRound();

    const result = await verifyRoundFairness(seed, seedHash, crashPoint + 0.02);

    expect(result.seedMatchesCommitment).toBe(true);
    expect(result.crashPointMatchesSeed).toBe(false);
    expect(result.verified).toBe(false);
  });

  test('should reject when both checks fail', async () => {
    const { seed, crashPoint } = await honestRound();

    const result = await verifyRoundFairness(seed, '0'.repeat(64), crashPoint + 5);

    expect(result).toEqual({
      seedMatchesCommitment: false,
      crashPointMatchesSeed: false,
      verified: false,
    });
  });

  test('should throw InvalidSeedError for an invalid seed', async () => {
    await expect(verifyRoundFairness('abc', 'f'.repeat(64), 2)).rejects.toThrow(InvalidSeedError);
  });
});
