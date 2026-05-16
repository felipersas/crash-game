import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { AUTO_CASHOUT_REPOSITORY, ROUND_CACHE_REPOSITORY, REDIS_CLIENT } from '@/application/di.tokens';
import { AutoCashOutRepository } from './auto-cashout.repository';
import { RoundCacheRepository } from './round-cache.repository';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : 'localhost',
        port: process.env.REDIS_URL ? parseInt(new URL(process.env.REDIS_URL).port || '6379') : 6379,
      },
    }),
    BullModule.registerQueue(
      { name: 'cashout' },
      { name: 'cashout-dlq' },
    ),
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const url = process.env.REDIS_URL || 'redis://localhost:6379';
        return new Redis(url);
      },
    },
    {
      provide: AUTO_CASHOUT_REPOSITORY,
      useExisting: AutoCashOutRepository,
    },
    {
      provide: ROUND_CACHE_REPOSITORY,
      useExisting: RoundCacheRepository,
    },
    AutoCashOutRepository,
    RoundCacheRepository,
  ],
  exports: [
    AUTO_CASHOUT_REPOSITORY,
    ROUND_CACHE_REPOSITORY,
    REDIS_CLIENT,
    BullModule,
  ],
})
export class RedisModule {}
