/**
 * Prisma Service - Infrastructure Layer
 *
 * Wraps PrismaClient for NestJS dependency injection.
 */

import { Injectable } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private prisma!: PrismaClient;

  async onModuleInit() {
    const databaseUrl = process.env.DATABASE_URL;
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    this.prisma = new PrismaClient({ adapter });
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  get client() {
    return this.prisma;
  }

  get wallet() {
    return this.prisma.wallet;
  }

  get inboxEvent() {
    return this.prisma.inboxEvent;
  }

  get outboxEvent() {
    return this.prisma.outboxEvent;
  }

  /**
   * Delegate $transaction to the underlying PrismaClient.
   * Used by OutboxWriter and use cases for atomic DB + outbox writes.
   */
  $transaction<R>(fn: (tx: any) => Promise<R>): Promise<R> {
    return this.prisma.$transaction(fn);
  }
}
