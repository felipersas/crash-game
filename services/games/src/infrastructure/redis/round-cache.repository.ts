import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@/application/di.tokens';

@Injectable()
export class RoundCacheRepository {
  private readonly logger = new Logger(RoundCacheRepository.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async setCurrentRound(data: {
    roundId: string;
    status: string;
    multiplier: number;
  }): Promise<void> {
    await this.redis.hset('round:current', {
      roundId: data.roundId,
      status: data.status,
      multiplier: data.multiplier.toString(),
    });
    await this.redis.expire('round:current', 60);
  }

  async getCurrentRound(): Promise<{ roundId: string; status: string; multiplier: number } | null> {
    const data = await this.redis.hgetall('round:current');
    if (!data || !data.roundId) return null;
    return {
      roundId: data.roundId,
      status: data.status,
      multiplier: parseFloat(data.multiplier),
    };
  }

  async clearCurrentRound(): Promise<void> {
    await this.redis.del('round:current');
  }
}
