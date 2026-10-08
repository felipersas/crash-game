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
import { InvalidMultiplierError } from '../../src/domain/errors/domain.errors';

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
      expect(() => Multiplier.fromValue(0)).toThrow(InvalidMultiplierError);
      expect(() => Multiplier.fromValue(-1)).toThrow(InvalidMultiplierError);
    });

    test('should reject multipliers below 1.0 with InvalidMultiplierError', () => {
      expect(() => Multiplier.fromValue(0.99)).toThrow(InvalidMultiplierError);
      expect(() => Multiplier.fromValue(0.99)).toThrow('Multiplier 0.99 must be at least 1');
    });

    test('should accept exactly 1.0', () => {
      expect(Multiplier.fromValue(1).getValue()).toBe(1);
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

    test('should truncate the payout to whole cents', () => {
      // 333 * 1.50 = 499.5 → 499
      expect(Multiplier.fromValue(1.5).calculatePayout(333n)).toBe(499n);
    });

    test('should calculate payout from the multiplier after growth', () => {
      const multiplier = Multiplier.afterDuration(Math.log(2) / 0.06);

      expect(multiplier.calculatePayout(1000n)).toBe(2000n);
    });

    test('should calculate winning as payout minus stake', () => {
      expect(Multiplier.fromValue(2.5).calculateWinning(1000n)).toBe(1500n);
      expect(Multiplier.fromValue(1.0).calculateWinning(1000n)).toBe(0n);
    });
  });

  describe('Payout precision (regression)', () => {
    test('1000n at 2.01x pays 2010n (float error used to pay 2000n)', () => {
      expect(Multiplier.fromValue(2.01).calculatePayout(1000n)).toBe(2010n);
    });

    test('1000n at 2.019x pays 2010n (multiplier truncated to hundredths)', () => {
      expect(Multiplier.fromValue(2.019).calculatePayout(1000n)).toBe(2010n);
    });

    test('1000n at 1.0x pays 1000n', () => {
      expect(Multiplier.fromValue(1.0).calculatePayout(1000n)).toBe(1000n);
    });

    test('should not lose a hundredth on values with float representation error', () => {
      // In IEEE-754 each value * 100 lands just below the exact hundredths (e.g. 2.01 * 100 = 200.99…)
      const cases: Array<[number, bigint]> = [
        [1.13, 1130n],
        [1.15, 1150n],
        [2.01, 2010n],
        [4.35, 4350n],
        [8.2, 8200n],
      ];
      for (const [value, expected] of cases) {
        expect(Multiplier.fromValue(value).calculatePayout(1000n)).toBe(expected);
      }
    });

    test('should truncate (never round up) values just below the next hundredth', () => {
      expect(Multiplier.fromValue(1.999).calculatePayout(1000n)).toBe(1990n);
      expect(Multiplier.fromValue(2.0099).calculatePayout(1000n)).toBe(2000n);
    });
  });

  describe('Serialization', () => {
    test('should expose value and formatted string', () => {
      const m = Multiplier.fromValue(2.5);

      expect(m.toPersistence()).toEqual({ value: 2.5 });
      expect(m.toJSON()).toEqual({ value: 2.5, formatted: '2.50x' });
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

  test('afterDuration never goes below 1.00x for negative elapsed time', () => {
    expect(Multiplier.afterDuration(-5).getValue()).toBe(1);
  });
});
