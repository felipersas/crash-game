import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { AUTO_CASHOUT_REPOSITORY } from '@/application/di.tokens';
import { REDIS_CLIENT } from '@/infrastructure/di.tokens';
import { RedisAutoCashOutRepository } from './auto-cashout.repository';

const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: redisUrl.hostname, port: Number(redisUrl.port || 6379) },
    }),
  ],
  providers: [
    { provide: REDIS_CLIENT, useFactory: () => new Redis(redisUrl.toString()) },
    { provide: AUTO_CASHOUT_REPOSITORY, useClass: RedisAutoCashOutRepository },
  ],
  exports: [AUTO_CASHOUT_REPOSITORY, REDIS_CLIENT, BullModule],
})
export class RedisModule {}
