import { describe, test, expect } from 'bun:test';
import { computePagination, buildPaginationMeta } from '../../../src/application/shared/pagination.util';

describe('computePagination', () => {
  test('Should compute default pagination (page=1, limit=20)', () => {
    const result = computePagination({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  test('Should clamp page to minimum 1', () => {
    // page=0 is falsy, so || 1 applies
    expect(computePagination({ page: 0 }).page).toBe(1);
    // Negative page
    expect(computePagination({ page: -5 }).page).toBe(1);
  });

  test('Should clamp limit to range [1, 100]', () => {
    // Above maximum
    expect(computePagination({ limit: 200 }).limit).toBe(100);

    // Valid within range
    expect(computePagination({ limit: 1 }).limit).toBe(1);
    expect(computePagination({ limit: 50 }).limit).toBe(50);
    expect(computePagination({ limit: 100 }).limit).toBe(100);
  });

  test('Should calculate correct offset', () => {
    expect(computePagination({ page: 1, limit: 20 }).offset).toBe(0);
    expect(computePagination({ page: 2, limit: 20 }).offset).toBe(20);
    expect(computePagination({ page: 3, limit: 10 }).offset).toBe(20);
    expect(computePagination({ page: 5, limit: 25 }).offset).toBe(100);
  });
});

describe('buildPaginationMeta', () => {
  test('Should build correct pagination meta', () => {
    const meta = buildPaginationMeta(2, 20, 50);

    expect(meta.page).toBe(2);
    expect(meta.limit).toBe(20);
    expect(meta.total).toBe(50);
  });

  test('Should calculate totalPages correctly with ceiling division', () => {
    // Exact multiple
    expect(buildPaginationMeta(1, 20, 100).totalPages).toBe(5);

    // With remainder
    expect(buildPaginationMeta(1, 20, 101).totalPages).toBe(6);

    // Zero items
    expect(buildPaginationMeta(1, 20, 0).totalPages).toBe(0);

    // Fewer items than limit
    expect(buildPaginationMeta(1, 20, 15).totalPages).toBe(1);

    // One item short of full page
    expect(buildPaginationMeta(1, 10, 19).totalPages).toBe(2);
  });
});
