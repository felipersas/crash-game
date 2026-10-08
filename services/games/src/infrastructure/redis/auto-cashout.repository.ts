import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import type { IAutoCashOutRepository } from '@/application/interfaces/auto-cashout.repository';
import { REDIS_CLIENT } from '@/infrastructure/di.tokens';

const LOCK_TTL_SECONDS = 300;
const RESULT_TTL_SECONDS = 300;

const targetsKey = (roundId: string) => `round:${roundId}:cashouts`;
const lockKey = (roundId: string, playerId: string) => `cashout:lock:${roundId}:${playerId}`;
const resultKey = (roundId: string, playerId: string) => `cashout:result:${roundId}:${playerId}`;

const LUA_FETCH_AND_REMOVE = `
local players = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local results = {}
if #players > 0 then
  for i, player in ipairs(players) do
    local score = redis.call('ZSCORE', KEYS[1], player)
    table.insert(results, {player, score})
  end
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
end
return results
`;

/**
 * Redis-backed auto cash-out targets (sorted set scored by target multiplier)
 * plus the lock/result cache that keeps the BullMQ worker idempotent.
 */
@Injectable()
export class RedisAutoCashOutRepository implements IAutoCashOutRepository {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async addTarget(roundId: string, playerId: string, multiplier: number): Promise<void> {
    await this.redis.zadd(targetsKey(roundId), multiplier, playerId);
  }

  async removeTarget(roundId: string, playerId: string): Promise<void> {
    await this.redis.zrem(targetsKey(roundId), playerId);
  }

  async fetchAndRemoveEligible(
    roundId: string,
    currentMultiplier: number,
  ): Promise<Array<{ playerId: string; targetMultiplier: number }>> {
    const results = (await this.redis.eval(
      LUA_FETCH_AND_REMOVE,
      1,
      targetsKey(roundId),
      currentMultiplier.toString(),
    )) as Array<[string, string]>;

    return results.map(([playerId, score]) => ({
      playerId,
      targetMultiplier: parseFloat(score),
    }));
  }

  async acquireLock(roundId: string, playerId: string): Promise<boolean> {
    const result = await this.redis.set(
      lockKey(roundId, playerId),
      '',
      'EX',
      LOCK_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseLock(roundId: string, playerId: string): Promise<void> {
    await this.redis.del(lockKey(roundId, playerId));
  }

  async getCachedResult(
    roundId: string,
    playerId: string,
  ): Promise<{ multiplier: number; payoutCents: bigint } | null> {
    const data = await this.redis.get(resultKey(roundId, playerId));
    if (!data) return null;
    try {
      const parsed = JSON.parse(data);
      if (parsed.multiplier !== undefined) {
        return { multiplier: parsed.multiplier, payoutCents: BigInt(parsed.payoutCents) };
      }
    } catch {
      return null;
    }
    return null;
  }

  async cacheResult(
    roundId: string,
    playerId: string,
    result: { multiplier: number; payoutCents: bigint },
  ): Promise<void> {
    await this.redis.set(
      resultKey(roundId, playerId),
      JSON.stringify({ multiplier: result.multiplier, payoutCents: result.payoutCents.toString() }),
      'EX',
      RESULT_TTL_SECONDS,
    );
  }

  async clearRound(roundId: string): Promise<void> {
    await this.redis.del(targetsKey(roundId));
  }
}
