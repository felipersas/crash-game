/**
 * Unit tests for Money Value Object.
 *
 * Tests cover:
 * - Happy paths: creation, arithmetic, conversions, comparisons
 * - Errors: negative amounts, invalid formats
 * - Edge cases: rounding, boundary values, equality
 */

/// <reference types="bun-types" />
import { describe, test, expect } from 'bun:test';
import { Money } from '@crash/domain';
import {
  InvalidMoneyAmountError,
  NegativeMoneyError,
} from '../../src/domain/errors/domain.errors';

describe('Money Value Object', () => {
  describe('Factory Methods', () => {
    describe('fromCents', () => {
      test('should create Money from bigint cents', () => {
        const money = Money.fromCents(1099n);
        expect(money.toDecimal()).toBe('10.99');
        expect(money.toCents()).toBe(1099n);
      });

      test('should create zero Money', () => {
        const money = Money.fromCents(0n);
        expect(money.toDecimal()).toBe('0.00');
        expect(money.isZero()).toBe(true);
      });

      test('should throw NegativeMoneyError for negative cents', () => {
        expect(() => Money.fromCents(-100n)).toThrow(/Negative money/);
      });
    });

    describe('fromDecimal', () => {
      test('should create Money from decimal string with 2 decimals', () => {
        const money = Money.fromDecimal('10.99');
        expect(money.toCents()).toBe(1099n);
        expect(money.toDecimal()).toBe('10.99');
      });

      test('should create Money from whole number', () => {
        const money = Money.fromDecimal('10');
        expect(money.toCents()).toBe(1000n);
        expect(money.toDecimal()).toBe('10.00');
      });

      test('should create Money from single decimal', () => {
        const money = Money.fromDecimal('10.5');
        expect(money.toCents()).toBe(1050n);
        expect(money.toDecimal()).toBe('10.50');
      });

      test('should truncate to 2 decimals (excess digits dropped)', () => {
        const money = Money.fromDecimal('10.999');
        expect(money.toCents()).toBe(1099n);
        expect(money.toDecimal()).toBe('10.99');
      });

      test('should handle large values', () => {
        const money = Money.fromDecimal('1000000.00');
        expect(money.toCents()).toBe(100000000n);
        expect(money.toDecimal()).toBe('1000000.00');
      });

      test('should trim whitespace', () => {
        const money = Money.fromDecimal('  10.99  ');
        expect(money.toDecimal()).toBe('10.99');
      });

      test('should throw InvalidMoneyAmountError for non-numeric strings', () => {
        expect(() => Money.fromDecimal('abc')).toThrow(/Invalid money amount/);
        expect(() => Money.fromDecimal('10.99.99')).toThrow(/Invalid money amount/);
        expect(() => Money.fromDecimal('')).toThrow(/Invalid money amount/);
      });

      test('should throw NegativeMoneyError for negative values', () => {
        expect(() => Money.fromDecimal('-10.00')).toThrow(/Negative money/);
      });
    });

    describe('zero', () => {
      test('should create Money with zero amount', () => {
        const money = Money.zero();
        expect(money.toCents()).toBe(0n);
        expect(money.toDecimal()).toBe('0.00');
        expect(money.isZero()).toBe(true);
      });
    });
  });

  describe('Arithmetic Operations', () => {
    describe('add', () => {
      test('should add two Money values', () => {
        const money1 = Money.fromDecimal('10.99');
        const money2 = Money.fromDecimal('5.01');
        const sum = money1.add(money2);

        expect(sum.toDecimal()).toBe('16.00');
        expect(sum.toCents()).toBe(1600n);
      });

      test('should return new Money instance (immutable)', () => {
        const money1 = Money.fromDecimal('10.00');
        const money2 = Money.fromDecimal('5.00');
        const sum = money1.add(money2);

        expect(money1.toDecimal()).toBe('10.00');
        expect(money2.toDecimal()).toBe('5.00');
      });

      test('should handle zero addition', () => {
        const money = Money.fromDecimal('10.00');
        const result = money.add(Money.zero());

        expect(result.toDecimal()).toBe('10.00');
      });
    });

    describe('subtract', () => {
      test('should subtract two Money values', () => {
        const money1 = Money.fromDecimal('10.00');
        const money2 = Money.fromDecimal('3.50');
        const difference = money1.subtract(money2);

        expect(difference.toDecimal()).toBe('6.50');
        expect(difference.toCents()).toBe(650n);
      });

      test('should throw NegativeMoneyError when result is negative', () => {
        const money1 = Money.fromDecimal('5.00');
        const money2 = Money.fromDecimal('10.00');

        expect(() => money1.subtract(money2)).toThrow(/Negative money/);
      });

      test('should handle zero subtraction', () => {
        const money = Money.fromDecimal('10.00');
        const result = money.subtract(Money.zero());

        expect(result.toDecimal()).toBe('10.00');
      });
    });

    describe('multiply', () => {
      test('should multiply by positive factor', () => {
        const money = Money.fromDecimal('10.00');
        const result = money.multiply(1.5);

        expect(result.toDecimal()).toBe('15.00');
      });

      test('should multiply by fractional factor', () => {
        const money = Money.fromDecimal('100.00');
        const result = money.multiply(0.07);

        expect(result.toDecimal()).toBe('7.00');
      });

      test('should multiply by zero', () => {
        const money = Money.fromDecimal('10.00');
        const result = money.multiply(0);

        expect(result.toDecimal()).toBe('0.00');
      });

      test('should multiply by 1 (identity)', () => {
        const money = Money.fromDecimal('10.00');
        const result = money.multiply(1);

        expect(result.toDecimal()).toBe('10.00');
      });

      test('should throw InvalidMoneyAmountError for negative factor', () => {
        const money = Money.fromDecimal('10.00');

        expect(() => money.multiply(-1)).toThrow(/Invalid money amount/);
      });
    });
  });

  describe('Comparison Operations', () => {
    describe('isGreaterThan', () => {
      test('should return true when greater', () => {
        const money1 = Money.fromDecimal('10.00');
        const money2 = Money.fromDecimal('5.00');

        expect(money1.isGreaterThan(money2)).toBe(true);
      });

      test('should return false when equal', () => {
        const money1 = Money.fromDecimal('10.00');
        const money2 = Money.fromDecimal('10.00');

        expect(money1.isGreaterThan(money2)).toBe(false);
      });

      test('should return false when less', () => {
        const money1 = Money.fromDecimal('5.00');
        const money2 = Money.fromDecimal('10.00');

        expect(money1.isGreaterThan(money2)).toBe(false);
      });
    });

    describe('isLessThan', () => {
      test('should return true when less', () => {
        const money1 = Money.fromDecimal('5.00');
        const money2 = Money.fromDecimal('10.00');

        expect(money1.isLessThan(money2)).toBe(true);
      });

      test('should return false when equal', () => {
        const money1 = Money.fromDecimal('10.00');
        const money2 = Money.fromDecimal('10.00');

        expect(money1.isLessThan(money2)).toBe(false);
      });

      test('should return false when greater', () => {
        const money1 = Money.fromDecimal('10.00');
        const money2 = Money.fromDecimal('5.00');

        expect(money1.isLessThan(money2)).toBe(false);
      });
    });

    describe('equals', () => {
      test('should return true for equal values', () => {
        const money1 = Money.fromDecimal('10.00');
        const money2 = Money.fromDecimal('10.00');

        expect(money1.equals(money2)).toBe(true);
      });

      test('should return false for different values', () => {
        const money1 = Money.fromDecimal('10.00');
        const money2 = Money.fromDecimal('5.00');

        expect(money1.equals(money2)).toBe(false);
      });

      test('should use value-based equality (not reference)', () => {
        const money1 = Money.fromDecimal('10.00');
        const money2 = Money.fromDecimal('10.00');

        expect(money1 === money2).toBe(false);
        expect(money1.equals(money2)).toBe(true);
      });
    });
  });

  describe('State Checks', () => {
    test('isNegative should return false for non-negative values', () => {
      const money = Money.fromDecimal('10.00');
      expect(money.isNegative()).toBe(false);
    });

    test('isZero should return true for zero', () => {
      const money = Money.zero();
      expect(money.isZero()).toBe(true);
    });

    test('isZero should return false for non-zero', () => {
      const money = Money.fromDecimal('0.01');
      expect(money.isZero()).toBe(false);
    });

    test('isPositive should return true for positive values', () => {
      const money = Money.fromDecimal('10.00');
      expect(money.isPositive()).toBe(true);
    });

    test('isPositive should return false for zero', () => {
      const money = Money.zero();
      expect(money.isPositive()).toBe(false);
    });
  });

  describe('Conversions', () => {
    describe('toCents', () => {
      test('should return bigint of cents', () => {
        const money = Money.fromDecimal('10.99');
        expect(money.toCents()).toBe(1099n);
      });
    });

    describe('toDecimal', () => {
      test('should return decimal string with 2 places', () => {
        const money = Money.fromDecimal('10.99');
        expect(money.toDecimal()).toBe('10.99');
      });

      test('should pad single decimal to 2 places', () => {
        const money = Money.fromDecimal('10.5');
        expect(money.toDecimal()).toBe('10.50');
      });

      test('should pad zero to 2 places', () => {
        const money = Money.zero();
        expect(money.toDecimal()).toBe('0.00');
      });
    });

    describe('toString', () => {
      test('should return formatted string with $ prefix', () => {
        const money = Money.fromDecimal('10.99');
        expect(money.toString()).toBe('$10.99');
      });
    });

    describe('toJSON', () => {
      test('should return object with cents and decimal', () => {
        const money = Money.fromDecimal('10.99');
        const json = money.toJSON();

        expect(json).toEqual({
          cents: 1099n,
          decimal: '10.99',
        });
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle maximum safe integer values', () => {
      const money = Money.fromDecimal('9007199254740991.00');
      expect(money.toCents()).toBe(900719925474099100n);
    });

    test('should handle minimum precision (1 cent)', () => {
      const money = Money.fromDecimal('0.01');
      expect(money.toCents()).toBe(1n);
      expect(money.toDecimal()).toBe('0.01');
    });

    test('should maintain precision through operations', () => {
      const money1 = Money.fromDecimal('0.01');
      const money2 = Money.fromDecimal('0.02');
      const sum = money1.add(money2);

      expect(sum.toDecimal()).toBe('0.03');
    });

    test('should handle rounding in multiplication correctly', () => {
      const money = Money.fromDecimal('10.00');
      const result = money.multiply(0.333);

      // 10.00 * 0.333 = 3.30 (Math.round(33.3) = 33)
      expect(result.toDecimal()).toBe('3.30');
    });
  });
});
