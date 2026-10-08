import { CrashPoint } from '../value-objects/crash-point.value-object';
import { SeedChain } from '../value-objects/seed-chain.value-object';

/** Persisted crash points are compared with this tolerance (2-decimal display precision). */
const CRASH_POINT_TOLERANCE = 0.01;

export interface FairnessVerification {
  seedMatchesCommitment: boolean;
  crashPointMatchesSeed: boolean;
  verified: boolean;
}

/**
 * Provably fair verification: the revealed seed must hash to the commitment
 * published before the round, and must deterministically produce the crash point.
 */
export async function verifyRoundFairness(
  seed: string,
  seedHash: string,
  crashPoint: number,
): Promise<FairnessVerification> {
  const seedMatchesCommitment = await SeedChain.verifySeed(seed, seedHash);
  const expected = await CrashPoint.fromSeed(seed);
  const crashPointMatchesSeed = Math.abs(expected.getValue() - crashPoint) < CRASH_POINT_TOLERANCE;

  return {
    seedMatchesCommitment,
    crashPointMatchesSeed,
    verified: seedMatchesCommitment && crashPointMatchesSeed,
  };
}
