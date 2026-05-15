import { describe, test, expect } from 'bun:test';
import { Pagination } from '@crash/domain';

describe('Pagination.compute', () => {
  test('Should compute default pagination (page=1, limit=20)', () => {
    const result = Pagination.compute({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  test('Should clamp page to minimum 1', () => {
    expect(Pagination.compute({ page: 0 }).page).toBe(1);
    expect(Pagination.compute({ page: -5 }).page).toBe(1);
  });

  test('Should clamp limit to range [1, 100]', () => {
    expect(Pagination.compute({ limit: 200 }).limit).toBe(100);
    expect(Pagination.compute({ limit: 1 }).limit).toBe(1);
    expect(Pagination.compute({ limit: 50 }).limit).toBe(50);
    expect(Pagination.compute({ limit: 100 }).limit).toBe(100);
  });

  test('Should calculate correct offset', () => {
    expect(Pagination.compute({ page: 1, limit: 20 }).offset).toBe(0);
    expect(Pagination.compute({ page: 2, limit: 20 }).offset).toBe(20);
    expect(Pagination.compute({ page: 3, limit: 10 }).offset).toBe(20);
    expect(Pagination.compute({ page: 5, limit: 25 }).offset).toBe(100);
  });
});

describe('Pagination.buildMeta', () => {
  test('Should build correct pagination meta', () => {
    const meta = Pagination.buildMeta(2, 20, 50);

    expect(meta.page).toBe(2);
    expect(meta.limit).toBe(20);
    expect(meta.total).toBe(50);
  });

  test('Should calculate totalPages correctly with ceiling division', () => {
    expect(Pagination.buildMeta(1, 20, 100).totalPages).toBe(5);
    expect(Pagination.buildMeta(1, 20, 101).totalPages).toBe(6);
    expect(Pagination.buildMeta(1, 20, 0).totalPages).toBe(0);
    expect(Pagination.buildMeta(1, 20, 15).totalPages).toBe(1);
    expect(Pagination.buildMeta(1, 10, 19).totalPages).toBe(2);
  });
});
