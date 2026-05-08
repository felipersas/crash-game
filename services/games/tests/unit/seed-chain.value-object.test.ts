/**
 * Unit tests for SeedChain Value Object.
 *
 * Tests cover:
 * - Seed chain generation
 * - Seed creation from existing seeds
 * - Hash verification
 * - Chain advancement
 * - Persistence
 */

import { describe, test, expect } from 'bun:test';
import { SeedChain } from '../../src/domain/value-objects/seed-chain.value-object';
import { InvalidSeedError } from '../../src/domain/errors/domain.errors';

describe('SeedChain Value Object', () => {
  describe('Generation', () => {
    test('should generate a seed chain with valid seed and hash', async () => {
      const chain = await SeedChain.generate();

      expect(chain.getSeed()).toBeDefined();
      expect(chain.getSeed()).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(chain.getHash()).toBeDefined();
      expect(chain.getHash()).toHaveLength(64); // SHA-256 = 64 hex chars
    });

    test('should generate unique seeds each time', async () => {
      const chain1 = await SeedChain.generate();
      const chain2 = await SeedChain.generate();

      expect(chain1.getSeed()).not.toBe(chain2.getSeed());
      expect(chain1.getHash()).not.toBe(chain2.getHash());
    });
  });

  describe('Creation from Seed', () => {
    test('should create seed chain from valid 64-char hex seed', async () => {
      const validSeed = 'a'.repeat(64); // 64 hex chars
      const chain = await SeedChain.fromSeed(validSeed);

      expect(chain.getSeed()).toBe(validSeed);
      expect(chain.getHash()).toBeDefined();
    });

    test('should reject empty seed', async () => {
      await expect(SeedChain.fromSeed('')).rejects.toThrow(InvalidSeedError);
    });

    test('should reject seed with wrong length', async () => {
      await expect(SeedChain.fromSeed('abc')).rejects.toThrow(InvalidSeedError);
      await expect(SeedChain.fromSeed('a'.repeat(63))).rejects.toThrow(InvalidSeedError);
      await expect(SeedChain.fromSeed('a'.repeat(65))).rejects.toThrow(InvalidSeedError);
    });

    test('should accept valid hex characters', async () => {
      // The current implementation only checks length, not hex validity
      const seed = '0123456789abcdef'.repeat(4); // 64 chars of valid hex
      const chain = await SeedChain.fromSeed(seed);

      expect(chain.getSeed()).toBe(seed);
    });
  });

  describe('Persistence', () => {
    test('should create from persistence data', () => {
      const data = {
        currentSeed: 'a'.repeat(64),
        currentHash: 'b'.repeat(64),
        nextSeed: null,
      };

      const chain = SeedChain.fromPersistence(data);

      expect(chain.getSeed()).toBe(data.currentSeed);
      expect(chain.getHash()).toBe(data.currentHash);
    });

    test('should convert to persistence format', async () => {
      const chain = await SeedChain.generate();
      const data = chain.toPersistence();

      expect(data.currentSeed).toBeDefined();
      expect(data.currentSeed).toHaveLength(64);
      expect(data.currentHash).toBeDefined();
      expect(data.currentHash).toHaveLength(64);
      expect(data.nextSeed).toBeNull();
    });

    test('should round-trip through persistence', async () => {
      const original = await SeedChain.generate();
      const persistenceData = original.toPersistence();
      const restored = SeedChain.fromPersistence(persistenceData);

      expect(restored.getSeed()).toBe(original.getSeed());
      expect(restored.getHash()).toBe(original.getHash());
    });
  });

  describe('Seed Verification', () => {
    test('should verify valid seed against committed hash', async () => {
      const chain = await SeedChain.generate();
      const seed = chain.getSeed();
      const hash = chain.getHash();

      const isValid = await SeedChain.verifySeed(seed, hash);
      expect(isValid).toBe(true);
    });

    test('should reject invalid seed against committed hash', async () => {
      const chain = await SeedChain.generate();
      const wrongSeed = 'b'.repeat(64);
      const hash = chain.getHash();

      const isValid = await SeedChain.verifySeed(wrongSeed, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('Chain Advancement', () => {
    test('should advance to new seed when nextSeed is null', async () => {
      const chain = await SeedChain.generate();
      const advanced = await chain.advance();

      expect(advanced.getSeed()).toBeDefined();
      expect(advanced.getSeed()).not.toBe(chain.getSeed());
      expect(advanced.getHash()).toBeDefined();
      expect(advanced.getHash()).not.toBe(chain.getHash());
    });

    test('should generate different seeds on each advance', async () => {
      const chain1 = await SeedChain.generate();
      const chain2 = await chain1.advance();
      const chain3 = await chain2.advance();

      expect(chain1.getSeed()).not.toBe(chain2.getSeed());
      expect(chain2.getSeed()).not.toBe(chain3.getSeed());
      expect(chain1.getSeed()).not.toBe(chain3.getSeed());
    });
  });

  describe('Hash Properties', () => {
    test('should produce consistent hash for same seed', async () => {
      const seed = 'a'.repeat(64);
      const chain1 = await SeedChain.fromSeed(seed);
      const chain2 = await SeedChain.fromSeed(seed);

      expect(chain1.getHash()).toBe(chain2.getHash());
    });

    test('should produce different hashes for different seeds', async () => {
      const chain1 = await SeedChain.fromSeed('a'.repeat(64));
      const chain2 = await SeedChain.fromSeed('b'.repeat(64));

      expect(chain1.getHash()).not.toBe(chain2.getHash());
    });
  });
});
