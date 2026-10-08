import { describe, it, expect } from 'vitest';
import { centsToDecimal, formatMoney, formatMultiplier, calculatePayout } from '../money';

describe('formatMoney', () => {
  it('formats zero cents', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('formats positive cents (number)', () => {
    expect(formatMoney(1000)).toBe('$10.00');
  });

  it('formats positive cents (bigint)', () => {
    expect(formatMoney(BigInt(1000))).toBe('$10.00');
  });

  it('formats single dollar', () => {
    expect(formatMoney(100)).toBe('$1.00');
  });

  it('formats sub-dollar', () => {
    expect(formatMoney(50)).toBe('$0.50');
  });

  it('formats single cent', () => {
    expect(formatMoney(1)).toBe('$0.01');
  });

  it('formats large amounts', () => {
    expect(formatMoney(10000000)).toBe('$100000.00');
  });

  it('formats negative amounts', () => {
    expect(formatMoney(-500)).toBe('-$5.00');
  });

  it('formats max bet', () => {
    expect(formatMoney(100000)).toBe('$1000.00');
  });

  it('formats min bet', () => {
    expect(formatMoney(100)).toBe('$1.00');
  });

  it('formats cents given as a string (wallet balance)', () => {
    expect(formatMoney('50000')).toBe('$500.00');
  });

  it('formats values beyond Number.MAX_SAFE_INTEGER exactly', () => {
    expect(formatMoney(BigInt('900719925474099312'))).toBe('$9007199254740993.12');
  });
});

describe('centsToDecimal', () => {
  it('converts cents to a 2-decimal string', () => {
    expect(centsToDecimal(1050)).toBe('10.50');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(0)).toBe('0.00');
  });

  it('keeps the sign for negatives', () => {
    expect(centsToDecimal(-500)).toBe('-5.00');
    expect(centsToDecimal(-1)).toBe('-0.01');
  });
});

describe('formatMultiplier', () => {
  it('formats 1 as "1.00x"', () => {
    expect(formatMultiplier(1)).toBe('1.00x');
  });

  it('formats 2.47 as "2.47x"', () => {
    expect(formatMultiplier(2.47)).toBe('2.47x');
  });

  it('formats 100.5 as "100.50x"', () => {
    expect(formatMultiplier(100.5)).toBe('100.50x');
  });
});

describe('calculatePayout', () => {
  it('returns original bet for 1x multiplier', () => {
    expect(calculatePayout(1000, 1)).toBe(1000);
  });

  it('calculates 2x multiplier correctly', () => {
    expect(calculatePayout(1000, 2)).toBe(2000);
  });

  it('calculates 1.5x multiplier correctly', () => {
    expect(calculatePayout(1000, 1.5)).toBe(1500);
  });

  it('floors result for fractional multipliers', () => {
    expect(calculatePayout(333, 2.47)).toBe(822);
  });

  it('truncates the multiplier to hundredths like the backend', () => {
    expect(calculatePayout(1000, 2.019)).toBe(2010);
    expect(calculatePayout(10000, 1.999)).toBe(19900);
  });

  it('is not affected by float representation error', () => {
    // 2.01 * 100 === 200.99999999999997 in IEEE-754
    expect(calculatePayout(100, 2.01)).toBe(201);
    expect(calculatePayout(100, 1.15)).toBe(115);
  });
});
