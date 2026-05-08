/**
 * Unit tests for Multiplier Value Object.
 *
 * Tests cover:
 * - Multiplier creation and value access
 * - Growth calculations
 * - Cash out payout calculations
 * - Edge cases and invariants
 */

import { describe, test, expect } from 'bun:test';
import { Multiplier } from '../../src/domain/value-objects/multiplier.value-object';
import { Money } from '@crash/domain';

describe('Multiplier Value Object', () => {
  describe('Creation', () => {
    test('should create multiplier at start value (1.00x)', () => {
      const multiplier = Multiplier.start();

      expect(multiplier.getValue()).toBe(1.0);
      expect(multiplier.toString()).toBe('1.00x');
    });

    test('should create multiplier from value', () => {
      const multiplier = Multiplier.fromValue(2.5);

      expect(multiplier.getValue()).toBe(2.5);
      expect(multiplier.toString()).toBe('2.50x');
    });

    test('should reject invalid multipliers (<= 0)', () => {
      expect(() => Multiplier.fromValue(0)).toThrow();
      expect(() => Multiplier.fromValue(-1)).toThrow();
    });

    test('should reject very small multipliers (< 1.0)', () => {
      expect(() => Multiplier.fromValue(0.99)).toThrow();
    });
  });

  describe('Growth', () => {
    test('should grow multiplier over time', () => {
      const start = Multiplier.start();

      const after100ms = Multiplier.afterDuration(0.1);
      expect(after100ms.getValue()).toBeGreaterThan(start.getValue());

      const after200ms = Multiplier.afterDuration(0.2);
      expect(after200ms.getValue()).toBeGreaterThan(after100ms.getValue());
    });

    test('should grow at correct rate with default growth rate (0.06)', () => {
      const after1s = Multiplier.afterDuration(1);

      // Formula: multiplier = e^(growthRate * timeInSeconds)
      // For 1 second with 0.06 growth rate: e^0.06 ≈ 1.062
      expect(after1s.getValue()).toBeCloseTo(1.062, 2);
    });

    test('should maintain precision', () => {
      const multiplier = Multiplier.fromValue(100);
      expect(multiplier.getValue()).toBe(100);

      const large = Multiplier.fromValue(1000000);
      expect(large.getValue()).toBe(1000000);
    });
  });

  describe('Cash Out Calculations', () => {
    test('should calculate payout correctly for 1.00x', () => {
      const multiplier = Multiplier.fromValue(1.0);
      const betCents = 1000n;

      const payout = multiplier.calculatePayout(betCents);
      expect(payout).toBe(1000n);
    });

    test('should calculate payout correctly for 2.50x', () => {
      const multiplier = Multiplier.fromValue(2.5);
      const betCents = 1000n;

      const payout = multiplier.calculatePayout(betCents);
      expect(payout).toBe(2500n);
    });

    test('should calculate payout correctly for large multipliers', () => {
      const multiplier = Multiplier.fromValue(100);
      const betCents = 100n;

      const payout = multiplier.calculatePayout(betCents);
      expect(payout).toBe(10000n);
    });

    test('should handle fractional multipliers correctly', () => {
      const multiplier = Multiplier.fromValue(1.99);
      const betCents = 1000n;

      const payout = multiplier.calculatePayout(betCents);
      expect(payout).toBe(1990n);
    });
  });

  describe('Comparison', () => {
    test('should compare multipliers correctly', () => {
      const m1 = Multiplier.fromValue(1.5);
      const m2 = Multiplier.fromValue(2.0);

      expect(m1.isLessThan(m2)).toBe(true);
      expect(m2.isGreaterThan(m1)).toBe(true);
    });
  });

  describe('String Representation', () => {
    test('should format multipliers correctly', () => {
      const m1 = Multiplier.fromValue(1);
      const m2 = Multiplier.fromValue(2.5);
      const m3 = Multiplier.fromValue(10.123);

      expect(m1.toString()).toBe('1.00x');
      expect(m2.toString()).toBe('2.50x');
      expect(m3.toString()).toBe('10.12x'); // 2 decimal places
    });

    test('should round very large multipliers', () => {
      const m = Multiplier.fromValue(999999.999);
      expect(m.toString()).toBe('1000000.00x');
    });
  });
});
