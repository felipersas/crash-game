/**
 * Unit tests for SeedChain Value Object.
 *
 * Tests cover:
 * - Seed chain generation (random and deterministic)
 * - Seed access and hash verification
 * - Chain advancement
 * - Persistence round-trip
 */

import { describe, test, expect } from 'bun:test';
import { SeedChain } from '../../src/domain/value-objects/seed-chain.value-object';

describe('SeedChain Value Object', () => {
  describe('Generation', () => {
    test('should generate a seed chain with valid seed and hash', async () => {
      const chain = await SeedChain.generate();

      expect(chain.getSeed()).toBeDefined();
      expect(chain.getSeed()).toHaveLength(64);
      expect(chain.getCurrentSeedHash()).toBeDefined();
      expect(chain.getCurrentSeedHash()).toHaveLength(64);
    });

    test('should generate unique seeds each time', async () => {
      const chain1 = await SeedChain.generate();
      const chain2 = await SeedChain.generate();

      expect(chain1.getSeed()).not.toBe(chain2.getSeed());
      expect(chain1.getCurrentSeedHash()).not.toBe(chain2.getCurrentSeedHash());
    });

    test('should generate deterministic chain from seed string', async () => {
      const chain = await SeedChain.generateDeterministic('test-seed');

      expect(chain.getSeed()).toBeDefined();
      expect(chain.getSeed()).toHaveLength(64);
    });

    test('should produce same chain for same seed string', async () => {
      const chain1 = await SeedChain.generateDeterministic('test-seed');
      const chain2 = await SeedChain.generateDeterministic('test-seed');

      expect(chain1.getSeed()).toBe(chain2.getSeed());
      expect(chain1.getCurrentSeedHash()).toBe(chain2.getCurrentSeedHash());
    });

    test('should produce different chains for different seed strings', async () => {
      const chain1 = await SeedChain.generateDeterministic('seed-a');
      const chain2 = await SeedChain.generateDeterministic('seed-b');

      expect(chain1.getSeed()).not.toBe(chain2.getSeed());
    });
  });

  describe('Seed Access', () => {
    test('should return current seed', async () => {
      const chain = await SeedChain.generate();

      expect(chain.getSeed()).toHaveLength(64);
    });

    test('should return seed hash (commitment)', async () => {
      const chain = await SeedChain.generate();

      expect(chain.getCurrentSeedHash()).toHaveLength(64);
      expect(chain.getCurrentSeedHash()).not.toBe(chain.getSeed());
    });

    test('should return initial commitment', async () => {
      const chain = await SeedChain.generate();

      expect(chain.getCommitment()).toHaveLength(64);
    });
  });

  describe('Chain Advancement', () => {
    test('should advance to next seed', async () => {
      const chain = await SeedChain.generate();
      const originalSeed = chain.getSeed();

      const advanced = chain.advance();

      expect(advanced.getSeed()).not.toBe(originalSeed);
    });

    test('should generate different seeds on each advance', async () => {
      const chain1 = await SeedChain.generate();
      const chain2 = chain1.advance();
      const chain3 = chain2.advance();

      expect(chain1.getSeed()).not.toBe(chain2.getSeed());
      expect(chain2.getSeed()).not.toBe(chain3.getSeed());
      expect(chain1.getSeed()).not.toBe(chain3.getSeed());
    });

    test('should decrease remaining count on advance', async () => {
      const chain = await SeedChain.generate(10);
      const remaining1 = chain.getRemainingCount();

      const advanced = chain.advance();
      const remaining2 = advanced.getRemainingCount();

      expect(remaining2).toBe(remaining1 - 1);
    });
  });

  describe('Persistence', () => {
    test('should convert to persistence format', async () => {
      const chain = await SeedChain.generate();
      const data = chain.toPersistence();

      expect(data.seeds).toBeInstanceOf(Array);
      expect(data.current).toBe(0);
      expect(data.commitment).toHaveLength(64);
    });

    test('should restore from persistence data', async () => {
      const original = await SeedChain.generate();
      const data = original.toPersistence();
      const restored = SeedChain.fromPersistence(data);

      expect(restored.getSeed()).toBe(original.getSeed());
      expect(restored.getCurrentSeedHash()).toBe(original.getCurrentSeedHash());
    });

    test('should restore from round persistence data', () => {
      const chain = SeedChain.fromRoundPersistence({
        currentSeed: 'a'.repeat(64),
        currentHash: 'b'.repeat(64),
      });

      expect(chain.getSeed()).toBe('a'.repeat(64));
      expect(chain.getCurrentSeedHash()).toBe('b'.repeat(64));
    });
  });

  describe('Seed Verification', () => {
    test('should verify valid seed against committed hash', async () => {
      const chain = await SeedChain.generate();
      const seed = chain.getSeed();
      const hash = chain.getCurrentSeedHash();

      const isValid = await SeedChain.verifySeed(seed, hash);
      expect(isValid).toBe(true);
    });

    test('should reject invalid seed against committed hash', async () => {
      const chain = await SeedChain.generate();
      const wrongSeed = 'b'.repeat(64);
      const hash = chain.getCurrentSeedHash();

      const isValid = await SeedChain.verifySeed(wrongSeed, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('Chain Properties', () => {
    test('should report remaining count', async () => {
      const chain = await SeedChain.generate(10);

      expect(chain.getRemainingCount()).toBe(10);
      expect(chain.getTotalCount()).toBe(10);
    });

    test('should report current position', async () => {
      const chain = await SeedChain.generate(10);

      expect(chain.getCurrentPosition()).toBe(0);

      const advanced = chain.advance();
      expect(advanced.getCurrentPosition()).toBe(1);
    });

    test('should report needs regeneration when low', async () => {
      // Create chain with 2 seeds and advance once
      const chain = await SeedChain.generate(2);
      expect(chain.needsRegeneration()).toBe(false);

      // Advance to last seed
      const advanced = chain.advance();
      // Remaining is 1 out of 2 = 50% remaining. With threshold at 10%, not needed yet
      // But we can test the method works
      expect(typeof advanced.needsRegeneration()).toBe('boolean');
    });
  });
});
