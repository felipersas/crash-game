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
import { SeedChainExhaustedError } from '../../src/domain/errors/domain.errors';
import { bytesToHex, hexToBytes, sha256, sha256Hex } from '../../src/domain/crypto/sha256';

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

    test('should derive the oldest seed as SHA-256 of the deterministic string', async () => {
      const chain = await SeedChain.generateDeterministic('test-seed', 3);
      const { seeds } = chain.toPersistence();

      const expected = bytesToHex(await sha256(new TextEncoder().encode('test-seed')));
      expect(seeds[seeds.length - 1]).toBe(expected);
    });

    test('should link every seed to the next one: seeds[i] = H(seeds[i + 1])', async () => {
      const chain = await SeedChain.generate(5);
      const { seeds, commitment } = chain.toPersistence();

      expect(seeds).toHaveLength(5);
      for (let i = 0; i < seeds.length - 1; i++) {
        expect(await sha256Hex(seeds[i + 1])).toBe(seeds[i]);
      }
      expect(commitment).toBe(await sha256Hex(seeds[0]));
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

    test('should commit to each seed before it is used', async () => {
      let chain = await SeedChain.generate(4);

      for (let i = 0; i < 4; i++) {
        expect(await SeedChain.verifySeed(chain.getSeed(), chain.getCurrentSeedHash())).toBe(true);
        if (i < 3) chain = chain.advance();
      }
    });

    test('should not mutate the original chain on advance', async () => {
      const chain = await SeedChain.generate(3);
      const seed = chain.getSeed();

      chain.advance();

      expect(chain.getSeed()).toBe(seed);
      expect(chain.getCurrentPosition()).toBe(0);
    });

    test('should throw SeedChainExhaustedError when advancing past the last seed', async () => {
      const last = (await SeedChain.generate(2)).advance();

      expect(() => last.advance()).toThrow(SeedChainExhaustedError);
    });

    test('should throw SeedChainExhaustedError when the position is past the end', () => {
      const chain = SeedChain.fromPersistence({
        seeds: ['a'.repeat(64)],
        current: 1,
        commitment: 'b'.repeat(64),
      });

      expect(() => chain.getSeed()).toThrow(SeedChainExhaustedError);
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
      const restored = SeedChain.fromPersistence({ ...data, seeds: [...data.seeds] });

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

    test('should report needs regeneration when less than 10% of seeds remain', async () => {
      let chain = await SeedChain.generate(10);
      for (let i = 0; i < 8; i++) chain = chain.advance();
      expect(chain.getRemainingCount()).toBe(2);
      expect(chain.needsRegeneration()).toBe(false);

      chain = chain.advance();
      expect(chain.getRemainingCount()).toBe(1);
      expect(chain.needsRegeneration()).toBe(true);
    });

    test('should summarize without exposing seeds', async () => {
      const chain = await SeedChain.generate(10);

      const summary = chain.getSummary();

      expect(summary).toEqual({
        currentPosition: 0,
        remaining: 10,
        total: 10,
        commitment: chain.getCommitment(),
        needsRegeneration: false,
      });
      expect(JSON.stringify(summary)).not.toContain(chain.getSeed());
    });
  });

  describe('sha256 helpers', () => {
    test('should round-trip hex and bytes', () => {
      const hex = '00ff10ab';

      expect(Array.from(hexToBytes(hex))).toEqual([0x00, 0xff, 0x10, 0xab]);
      expect(bytesToHex(hexToBytes(hex))).toBe(hex);
    });

    test('should hash the bytes of a hex value (not its text)', async () => {
      // SHA-256 of the empty byte string
      expect(await sha256Hex('')).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
      // SHA-256 of the single byte 0x00
      expect(await sha256Hex('00')).toBe(
        '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
      );
    });
  });
});
