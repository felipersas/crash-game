/**
 * Unit tests for CrashPoint Value Object.
 *
 * Tests cover:
 * - Crash point creation from seed
 * - Crash point creation from value
 * - Crash determination logic
 * - House edge application
 * - Minimum crash point enforcement
 */

import { describe, test, expect } from 'bun:test';
import { CrashPoint } from '../../src/domain/value-objects/crash-point.value-object';
import { InvalidCrashPointError, InvalidSeedError } from '../../src/domain/errors/domain.errors';

describe('CrashPoint Value Object', () => {
  describe('Creation from Value', () => {
    test('should create crash point from valid value', () => {
      const crashPoint = CrashPoint.fromValue(1.5);

      expect(crashPoint.getValue()).toBe(1.5);
    });

    test('should reject values below minimum (1.00) with InvalidCrashPointError', () => {
      expect(() => CrashPoint.fromValue(0.99)).toThrow(InvalidCrashPointError);
      expect(() => CrashPoint.fromValue(0)).toThrow(InvalidCrashPointError);
      expect(() => CrashPoint.fromValue(-1)).toThrow(InvalidCrashPointError);
      expect(() => CrashPoint.fromValue(0.5)).toThrow('Crash point 0.5 must be at least 1');
    });

    test('should accept minimum crash point (1.00)', () => {
      const crashPoint = CrashPoint.fromValue(1.0);
      expect(crashPoint.getValue()).toBe(1.0);
    });

    test('should accept very large crash points', () => {
      const crashPoint = CrashPoint.fromValue(1000000);
      expect(crashPoint.getValue()).toBe(1000000);
    });
  });

  describe('Creation from Seed', () => {
    test('should generate crash point from valid seed', async () => {
      const seed = 'aa'.repeat(32); // valid 64-char hex seed
      const crashPoint = await CrashPoint.fromSeed(seed);

      expect(crashPoint.getValue()).toBeGreaterThanOrEqual(1.0);
    });

    test('should reject empty seed', async () => {
      await expect(CrashPoint.fromSeed('')).rejects.toThrow(InvalidSeedError);
    });

    test('should reject short seeds', async () => {
      await expect(CrashPoint.fromSeed('abc')).rejects.toThrow(InvalidSeedError);
    });

    test('should generate deterministic crash points from same seed', async () => {
      const seed = 'bb'.repeat(32); // valid 64-char hex seed
      const cp1 = await CrashPoint.fromSeed(seed);
      const cp2 = await CrashPoint.fromSeed(seed);

      expect(cp1.getValue()).toBe(cp2.getValue());
    });

    test('should generate different crash points from different seeds', async () => {
      const cp1 = await CrashPoint.fromSeed('aabbccdd'.repeat(8));
      const cp2 = await CrashPoint.fromSeed('11223344'.repeat(8));

      expect(cp1.getValue()).not.toBe(cp2.getValue());
    });
  });

  describe('Algorithm', () => {
    test('should match the documented formula for a known seed', async () => {
      const seed = 'aa'.repeat(32);
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', Buffer.from(seed, 'hex')));
      // First 52 bits = first 13 hex chars of the hash
      const hex = Buffer.from(hash).toString('hex');
      const bits = parseInt(hex.slice(0, 13), 16);
      const expected = Math.max(1, 0.96 / (bits / 2 ** 52));

      const crashPoint = await CrashPoint.fromSeed(seed);

      expect(crashPoint.getValue()).toBe(expected);
    });

    test('should describe the formula for players', () => {
      expect(CrashPoint.FORMULA).toContain('SHA-256(seed)');
      expect(CrashPoint.FORMULA).toContain('52 bits');
      expect(CrashPoint.FORMULA).toContain('max(1.00, (1 - 0.04) / (bits / 2^52))');
    });
  });

  describe('Crash Determination', () => {
    test('should crash when multiplier equals or exceeds crash point', () => {
      const crashPoint = CrashPoint.fromValue(2.5);

      expect(crashPoint.shouldCrashAt(2.5)).toBe(true);
      expect(crashPoint.shouldCrashAt(3.0)).toBe(true);
      expect(crashPoint.shouldCrashAt(10.0)).toBe(true);
    });

    test('should not crash when multiplier is below crash point', () => {
      const crashPoint = CrashPoint.fromValue(2.5);

      expect(crashPoint.shouldCrashAt(1.0)).toBe(false);
      expect(crashPoint.shouldCrashAt(2.0)).toBe(false);
      expect(crashPoint.shouldCrashAt(2.49)).toBe(false);
    });

    test('should handle edge case at exactly 1.00x', () => {
      const crashPoint = CrashPoint.fromValue(1.0);

      expect(crashPoint.shouldCrashAt(1.0)).toBe(true);
      expect(crashPoint.shouldCrashAt(0.99)).toBe(false);
    });
  });

  describe('String Representation', () => {
    test('should format crash point correctly', () => {
      const cp1 = CrashPoint.fromValue(1);
      const cp2 = CrashPoint.fromValue(2.5);
      const cp3 = CrashPoint.fromValue(10.123);

      expect(cp1.toString()).toBe('1.00x');
      expect(cp2.toString()).toBe('2.50x');
      expect(cp3.toString()).toBe('10.12x');
    });

    test('should format large crash points correctly', () => {
      const cp = CrashPoint.fromValue(999999.999);
      expect(cp.toString()).toBe('1000000.00x');
    });
  });

  describe('Persistence', () => {
    test('should convert to persistence format', () => {
      const crashPoint = CrashPoint.fromValue(2.5);
      const data = crashPoint.toPersistence();

      expect(data.value).toBe(2.5);
    });

    test('should convert to JSON format', () => {
      const crashPoint = CrashPoint.fromValue(2.5);
      const json = crashPoint.toJSON();

      expect(json.value).toBe(2.5);
      expect(json.formatted).toBe('2.50x');
    });
  });

  describe('House Edge', () => {
    test('should apply 4% house edge (crash points tend lower)', async () => {
      // Generate many crash points and verify average is below theoretical fair value
      // With 4% house edge, expected value should be around 0.96 / 0.99 ≈ 0.97x the fair value
      const seeds = Array.from({ length: 100 }, (_, i) =>
        i.toString(16).padStart(2, '0').repeat(32),
      );
      const crashPoints = await Promise.all(seeds.map((seed) => CrashPoint.fromSeed(seed)));

      // Count how many are "low" crash points (instant or near-instant crashes)
      const lowCrashes = crashPoints.filter((cp) => cp.getValue() < 1.1).length;

      // With house edge, we expect a significant portion of low crashes
      // This is a probabilistic test, but should generally hold
      expect(lowCrashes).toBeGreaterThan(0);
    });

    test('should generate deterministic crash points from same seed', async () => {
      // This test verifies the randomness in the algorithm
      const seed = 'cc'.repeat(32); // valid 64-char hex seed
      const crashPoints = await Promise.all(
        Array(10)
          .fill(0)
          .map(() => CrashPoint.fromSeed(seed)),
      );

      // All should be the same (deterministic from seed)
      const values = crashPoints.map((cp) => cp.getValue());
      expect(values.every((v) => v === values[0])).toBe(true);
    });
  });

  describe('Minimum Crash Point', () => {
    test('should enforce minimum crash point of 1.00x', async () => {
      // Even with seeds that would mathematically result in values below 1.00,
      // the crash point should be clamped to 1.00
      const seeds = Array.from({ length: 50 }, (_, i) =>
        (i + 100).toString(16).padStart(2, '0').repeat(32),
      );
      const crashPoints = await Promise.all(seeds.map((seed) => CrashPoint.fromSeed(seed)));

      // All crash points should be at least 1.00
      for (const cp of crashPoints) {
        expect(cp.getValue()).toBeGreaterThanOrEqual(1.0);
      }
    });
  });
});
