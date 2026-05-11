import { Injectable, Logger } from '@nestjs/common';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';
import type { GameDomainEvent } from '@/domain/events/round.events';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter, type PrismaTransaction } from './outbox-writer';

/**
 * TransactionalEventPublisher - Infrastructure Layer
 *
 * Implements IGameEventPublisher by writing events to the outbox_events table
 * instead of publishing directly to RabbitMQ. The OutboxProcessor polls the
 * table and publishes to RabbitMQ asynchronously.
 *
 * Two modes:
 * 1. publishBatch(events) — opens its own transaction and writes to outbox
 * 2. writeWithinTransaction(tx, events) — uses a caller-provided transaction
 *    for atomic DB save + outbox write
 */
@Injectable()
export class TransactionalEventPublisher implements IGameEventPublisher {
  private readonly logger = new Logger(TransactionalEventPublisher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async publish(event: GameDomainEvent): Promise<void> {
    await this.publishBatch([event]);
  }

  async publishBatch(events: GameDomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    const aggregateId = events[0].aggregateId;

    await this.prisma.$transaction(async (tx) => {
      await this.outboxWriter.writeWithinTransaction(tx, aggregateId, events);
    });

    this.logger.debug(`Wrote ${events.length} events to outbox for aggregate ${aggregateId}`);
  }

  /**
   * Write events to outbox within a caller-owned transaction.
   * Use this when the aggregate save and event write must be atomic.
   */
  async writeWithinTransaction(
    tx: PrismaTransaction,
    aggregateId: string,
    events: GameDomainEvent[],
  ): Promise<void> {
    await this.outboxWriter.writeWithinTransaction(tx, aggregateId, events);
  }

  isConnected(): boolean {
    return true;
  }
}
