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

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') return;

    const tables = await this.prisma.$queryRaw`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;

    for (const { tablename } of tables as Array<{ tablename: string }>) {
      if (tablename !== '_prisma_migrations') {
        try {
          await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
        } catch (error) {
          console.error(`Could not truncate ${tablename}:`, error);
        }
      }
    }
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
}
