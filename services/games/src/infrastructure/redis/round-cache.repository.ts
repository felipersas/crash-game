import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

@Injectable()
export class RoundCacheRepository {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}
}
