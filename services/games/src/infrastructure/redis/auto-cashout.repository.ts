import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@/application/di.tokens';

const LUA_FETCH_AND_REMOVE = `
local players = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if #players > 0 then
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
end
return players
`;

@Injectable()
export class AutoCashOutRepository {
  private readonly logger = new Logger(AutoCashOutRepository.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async addTarget(roundId: string, playerId: string, multiplier: number): Promise<void> {
    await this.redis.zadd(`round:${roundId}:cashouts`, multiplier, playerId);
  }

  async removeTarget(roundId: string, playerId: string): Promise<void> {
    await this.redis.zrem(`round:${roundId}:cashouts`, playerId);
  }

  async fetchAndRemoveEligible(roundId: string, currentMultiplier: number): Promise<string[]> {
    const players = await this.redis.eval(
      LUA_FETCH_AND_REMOVE,
      1,
      `round:${roundId}:cashouts`,
      currentMultiplier.toString(),
    );
    return players as string[];
  }

  async acquireLock(roundId: string, playerId: string): Promise<boolean> {
    const result = await this.redis.set(
      `cashout:${roundId}:${playerId}`,
      '',
      'NX',
      'EX',
      300,
    );
    return result === 'OK';
  }

  async getCachedResult(
    roundId: string,
    playerId: string,
  ): Promise<{ multiplier: number; payoutCents: bigint } | null> {
    const data = await this.redis.get(`cashout:${roundId}:${playerId}`);
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
      `cashout:${roundId}:${playerId}`,
      JSON.stringify({ multiplier: result.multiplier, payoutCents: result.payoutCents.toString() }),
      'EX',
      300,
    );
  }

  async clearRound(roundId: string): Promise<void> {
    await this.redis.del(`round:${roundId}:cashouts`);
  }
}
