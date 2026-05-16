import { describe, test, expect, beforeEach } from 'bun:test';
import { AutoCashOutRepository } from '../../../src/infrastructure/redis/auto-cashout.repository';

function mockFn<T extends (...args: any[]) => any>(impl?: T) {
  const fn: any = (...args: any[]) => {
    if (!fn._calls) fn._calls = [];
    fn._calls.push(args);
    return impl ? impl(...args) : 'OK';
  };
  fn._calls = [] as any[][];
  return fn as T & { _calls: any[][] };
}

function createMockRedis(overrides: Record<string, any> = {}) {
  return {
    zadd: mockFn(() => 1),
    zrem: mockFn(() => 1),
    eval: mockFn(() => []),
    set: mockFn(() => 'OK'),
    get: mockFn(() => null),
    del: mockFn(() => 1),
    ...overrides,
  };
}

describe('AutoCashOutRepository', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let repo: AutoCashOutRepository;

  beforeEach(() => {
    redis = createMockRedis();
    repo = new AutoCashOutRepository(redis as any);
  });

  test('should add player to sorted set', async () => {
    await repo.addTarget('round-1', 'player-1', 2.5);
    expect(redis.zadd._calls).toHaveLength(1);
    expect(redis.zadd._calls[0]).toEqual(['round:round-1:cashouts', 2.5, 'player-1']);
  });

  test('should remove player from sorted set', async () => {
    await repo.removeTarget('round-1', 'player-1');
    expect(redis.zrem._calls).toHaveLength(1);
    expect(redis.zrem._calls[0]).toEqual(['round:round-1:cashouts', 'player-1']);
  });

  test('should fetch and remove eligible players via Lua with scores', async () => {
    redis = createMockRedis({
      eval: mockFn(() => [
        ['player-1', '2.5'],
        ['player-2', '3.0'],
      ]),
    });
    repo = new AutoCashOutRepository(redis as any);

    const eligible = await repo.fetchAndRemoveEligible('round-1', 3.0);
    expect(eligible).toEqual([
      { playerId: 'player-1', targetMultiplier: 2.5 },
      { playerId: 'player-2', targetMultiplier: 3.0 },
    ]);
    expect(redis.eval._calls).toHaveLength(1);
  });

  test('should return empty array when no eligible players', async () => {
    redis = createMockRedis({ eval: mockFn(() => []) });
    repo = new AutoCashOutRepository(redis as any);

    const eligible = await repo.fetchAndRemoveEligible('round-1', 1.5);
    expect(eligible).toEqual([]);
  });

  test('should acquire idempotency lock', async () => {
    redis = createMockRedis({ set: mockFn(() => 'OK') });
    repo = new AutoCashOutRepository(redis as any);

    const acquired = await repo.acquireLock('round-1', 'player-1');
    expect(acquired).toBe(true);
    expect(redis.set._calls[0]).toEqual(['cashout:lock:round-1:player-1', '', 'EX', 300, 'NX']);
  });

  test('should fail to acquire lock if already held', async () => {
    redis = createMockRedis({ set: mockFn(() => null) });
    repo = new AutoCashOutRepository(redis as any);

    const acquired = await repo.acquireLock('round-1', 'player-1');
    expect(acquired).toBe(false);
  });

  test('should cache cash-out result', async () => {
    await repo.cacheResult('round-1', 'player-1', { multiplier: 2.5, payoutCents: 2500n });
    expect(redis.set._calls).toHaveLength(1);
    const [key, value, ...rest] = redis.set._calls[0];
    expect(key).toBe('cashout:result:round-1:player-1');
    expect(JSON.parse(value)).toEqual({ multiplier: 2.5, payoutCents: '2500' });
  });

  test('should get cached result', async () => {
    redis = createMockRedis({
      get: mockFn(() => JSON.stringify({ multiplier: 2.5, payoutCents: '2500' })),
    });
    repo = new AutoCashOutRepository(redis as any);

    const result = await repo.getCachedResult('round-1', 'player-1');
    expect(result).toEqual({ multiplier: 2.5, payoutCents: 2500n });
  });

  test('should return null when no cached result', async () => {
    redis = createMockRedis({ get: mockFn(() => null) });
    repo = new AutoCashOutRepository(redis as any);

    const result = await repo.getCachedResult('round-1', 'player-1');
    expect(result).toBeNull();
  });

  test('should clear round keys', async () => {
    await repo.clearRound('round-1');
    expect(redis.del._calls).toHaveLength(1);
    expect(redis.del._calls[0]).toEqual(['round:round-1:cashouts']);
  });
});
