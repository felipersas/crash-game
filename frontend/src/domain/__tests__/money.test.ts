import { describe, it, expect } from 'vitest';
import { formatMoney, formatMultiplier, calculatePayout } from '../money';

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
    expect(formatMoney(-500)).toBe('$-5.00');
  });

  it('formats max bet', () => {
    expect(formatMoney(100000)).toBe('$1000.00');
  });

  it('formats min bet', () => {
    expect(formatMoney(100)).toBe('$1.00');
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
});
