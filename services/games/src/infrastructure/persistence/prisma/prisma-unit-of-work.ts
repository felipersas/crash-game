import { Injectable } from '@nestjs/common';
import type { GameDomainEvent } from '@/domain/events/round.events';
import type { IUnitOfWork, TransactionContext } from '@/application/interfaces/unit-of-work';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';
import { PrismaService } from './prisma.service';
import { toTransactionContext } from './transaction-context';

/**
 * Prisma implementation of the Unit of Work: one database transaction for the
 * aggregate changes plus their outbox rows, then a best-effort publish.
 */
@Injectable()
export class PrismaUnitOfWork implements IUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async commit(
    aggregateId: string,
    events: GameDomainEvent[],
    work?: (tx: TransactionContext) => Promise<void>,
  ): Promise<void> {
    const entries = await this.prisma.$transaction(async (tx) => {
      await work?.(toTransactionContext(tx));
      return this.outboxWriter.write(tx, aggregateId, events);
    });

    await this.outboxWriter.publishNow(entries);
  }
}
