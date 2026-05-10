/**
 * Unit Tests for Deterministic Seed Functionality
 *
 * Verify that deterministic seeds produce consistent crash points.
 */

import { describe, test, expect } from 'bun:test';
import { SeedChain } from '../../src/domain/value-objects/seed-chain.value-object';
import { CrashPoint } from '../../src/domain/value-objects/crash-point.value-object';

describe('Deterministic Seed', () => {
  test('should generate same seed from same string', async () => {
    const seedString = 'test-crash-2-27';

    const chain1 = await SeedChain.generateDeterministic(seedString);
    const chain2 = await SeedChain.generateDeterministic(seedString);

    expect(chain1.getSeed()).toBe(chain2.getSeed());
    expect(chain1.getCurrentSeedHash()).toBe(chain2.getCurrentSeedHash());
  });

  test('should produce same crash point from same seed', async () => {
    const seedString = 'test-crash-2-27';

    const chain = await SeedChain.generateDeterministic(seedString);
    const crashPoint1 = await CrashPoint.fromSeed(chain.getSeed());
    const crashPoint2 = await CrashPoint.fromSeed(chain.getSeed());

    expect(crashPoint1.getValue()).toBe(crashPoint2.getValue());
  });

  test('known seeds produce expected crash points', async () => {
    // Chain size must match RoundLifecycleManager (1000)
    const CHAIN_SIZE = 1000;
    const knownSeeds = [
      { seed: 'test-crash-1.5-6', expectedMin: 1.42, expectedMax: 1.52 },
      { seed: 'test-crash-2-94', expectedMin: 1.93, expectedMax: 2.03 },
      { seed: 'test-crash-3-20', expectedMin: 2.97, expectedMax: 3.07 },
    ];

    for (const { seed, expectedMin, expectedMax } of knownSeeds) {
      const chain = await SeedChain.generateDeterministic(seed, CHAIN_SIZE);
      const crashPoint = await CrashPoint.fromSeed(chain.getSeed());

      expect(crashPoint.getValue()).toBeGreaterThanOrEqual(expectedMin);
      expect(crashPoint.getValue()).toBeLessThanOrEqual(expectedMax);

      console.log(`✓ ${seed} → ${crashPoint.getValue().toFixed(2)}x`);
    }
  });

  test('random seeds should be used when DETERMINISTIC_SEED is not set', async () => {
    // Clear the env var if it exists
    const originalValue = process.env.DETERMINISTIC_SEED;
    delete process.env.DETERMINISTIC_SEED;

    const chain1 = await SeedChain.generate();
    const chain2 = await SeedChain.generate();

    // Random seeds should be different (extremely unlikely to be the same)
    expect(chain1.getSeed()).not.toBe(chain2.getSeed());

    // Restore original value
    if (originalValue) {
      process.env.DETERMINISTIC_SEED = originalValue;
    }
  });

  test('DETERMINISTIC_SEED env var should be respected', async () => {
    const testSeed = 'test-seed-env-var';

    // Set the env var
    const originalValue = process.env.DETERMINISTIC_SEED;
    process.env.DETERMINISTIC_SEED = testSeed;

    const chain1 = await SeedChain.generate();
    const chain2 = await SeedChain.generate();

    // Should produce the same seed because DETERMINISTIC_SEED is set
    expect(chain1.getSeed()).toBe(chain2.getSeed());

    // Restore original value
    if (originalValue) {
      process.env.DETERMINISTIC_SEED = originalValue;
    } else {
      delete process.env.DETERMINISTIC_SEED;
    }
  });
});
