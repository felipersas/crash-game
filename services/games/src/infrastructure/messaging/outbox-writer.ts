import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { serializeEvent, type IEventPublisher, type SerializedEvent } from '@crash/messaging';
import type { GameDomainEvent } from '@/domain/events/round.events';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import type { PrismaTransaction } from '@/infrastructure/persistence/prisma/transaction-context';
import { RABBITMQ_PUBLISHER } from '@/infrastructure/di.tokens';

export interface OutboxEntry {
  id: string;
  event: SerializedEvent;
}

/**
 * OutboxWriter - Infrastructure Layer
 *
 * Appends serialized events to the outbox_events table inside the caller's
 * transaction. After commit, publishNow() pushes them to RabbitMQ for low
 * latency; anything it cannot publish stays PENDING for the OutboxProcessor.
 */
@Injectable()
export class OutboxWriter {
  private readonly logger = new Logger(OutboxWriter.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RABBITMQ_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async write(
    tx: PrismaTransaction,
    aggregateId: string,
    events: GameDomainEvent[],
  ): Promise<OutboxEntry[]> {
    const entries: OutboxEntry[] = [];

    for (const domainEvent of events) {
      const event = serializeEvent(domainEvent);
      const row = await tx.outboxEvent.create({
        data: {
          aggregateId,
          eventType: event.eventType,
          payload: event as Prisma.InputJsonObject,
          status: 'PENDING',
        },
        select: { id: true },
      });
      entries.push({ id: row.id, event });
    }

    return entries;
  }

  /**
   * Best-effort publish after the transaction commits. Never throws.
   */
  async publishNow(entries: OutboxEntry[]): Promise<void> {
    for (const { id, event } of entries) {
      try {
        await this.publisher.publish(event);
        await this.prisma.outboxEvent.update({
          where: { id },
          data: { status: 'SENT', sentAt: new Date() },
        });
      } catch (error: unknown) {
        this.logger.warn(
          `Immediate publish failed for ${event.eventType} (outbox ${id}), falling back to polling: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
