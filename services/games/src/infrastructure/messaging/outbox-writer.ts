import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { GameDomainEvent } from '@/domain/events/round.events';
import type { IEventPublisher } from '@crash/messaging';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { RABBITMQ_PUBLISHER } from '@/application/di.tokens';

/**
 * Prisma transaction handle type.
 * Excludes lifecycle and transaction methods from PrismaClient.
 */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
>;

/**
 * OutboxWriter - Infrastructure Layer
 *
 * Serializes GameDomainEvent into outbox_events rows within a Prisma transaction.
 * The caller owns the transaction boundary — this service only writes rows.
 *
 * After the transaction commits, tryImmediatePublish() can be called to publish
 * events directly to RabbitMQ for low latency. If that fails, the OutboxProcessor
 * polling fallback will pick them up.
 */
@Injectable()
export class OutboxWriter {
  private readonly logger = new Logger(OutboxWriter.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RABBITMQ_PUBLISHER) private readonly rabbitMQPublisher: IEventPublisher,
  ) {}

  async writeWithinTransaction(
    tx: PrismaTransaction,
    aggregateId: string,
    events: GameDomainEvent[],
  ): Promise<string[]> {
    if (events.length === 0) return [];

    const outboxIds: string[] = [];

    for (const event of events) {
      const payload = JSON.parse(
        JSON.stringify(event, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      );

      const outboxEvent = await tx.outboxEvent.create({
        data: {
          aggregateId,
          eventType: event.eventType,
          payload,
          status: 'PENDING',
        },
      });

      outboxIds.push(outboxEvent.id);

      this.logger.debug(`Wrote outbox event: ${event.eventType} for aggregate ${aggregateId}`);
    }

    return outboxIds;
  }

  /**
   * Best-effort immediate publish after transaction commits.
   *
   * Tries to publish each event to RabbitMQ directly. On success, marks the
   * outbox event as SENT. On failure, logs a warning and leaves the event as
   * PENDING so the OutboxProcessor polling fallback picks it up.
   *
   * This method NEVER throws — it is purely best-effort.
   */
  async tryImmediatePublish(events: GameDomainEvent[], outboxIds: string[]): Promise<void> {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const outboxId = outboxIds[i];

      try {
        const serialized = JSON.parse(
          JSON.stringify(event, (_key, value) =>
            typeof value === 'bigint' ? value.toString() : value,
          ),
        );

        await this.rabbitMQPublisher.publish(serialized);

        await this.prisma.outboxEvent.update({
          where: { id: outboxId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        this.logger.debug(`Immediate publish succeeded: ${event.eventType}`);
      } catch (error: unknown) {
        this.logger.warn(
          `Immediate publish failed for ${event.eventType} (outbox ${outboxId}), ` +
            `falling back to polling: ${error instanceof Error ? error.message : error}`,
        );
        // Leave as PENDING — OutboxProcessor will pick it up
      }
    }
  }
}
