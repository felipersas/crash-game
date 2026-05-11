import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { IEventPublisher } from '@crash/messaging';
import type { WalletDomainEvent } from '@/domain/events/wallet.events';
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
 * Serializes WalletDomainEvent into outbox_events rows within a Prisma transaction.
 * The caller owns the transaction boundary — this service only writes rows.
 *
 * After the transaction commits, callers should invoke tryImmediatePublish()
 * for best-effort low-latency publishing. If that fails, the OutboxProcessor
 * polling loop will pick up PENDING events as a fallback.
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
    events: WalletDomainEvent[],
  ): Promise<string[]> {
    if (events.length === 0) return [];

    const outboxIds: string[] = [];

    for (const event of events) {
      const payload = JSON.parse(
        JSON.stringify(event, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      );

      const created = await tx.outboxEvent.create({
        data: {
          aggregateId,
          eventType: event.eventType,
          payload,
          status: 'PENDING',
        },
        select: { id: true },
      });

      outboxIds.push(created.id);

      this.logger.debug(`Wrote outbox event: ${event.eventType} for aggregate ${aggregateId}`);
    }

    return outboxIds;
  }

  /**
   * Best-effort immediate publish after the transaction commits.
   * For each event, tries to publish to RabbitMQ and marks the outbox row as SENT.
   * On failure, logs a warning and leaves the row as PENDING for the polling fallback.
   * Never throws — the OutboxProcessor will handle retries.
   */
  async tryImmediatePublish(
    events: WalletDomainEvent[],
    outboxIds: string[],
  ): Promise<void> {
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

        this.logger.debug(
          `Immediately published outbox event: ${event.eventType} (${outboxId})`,
        );
      } catch (error: unknown) {
        this.logger.warn(
          `Immediate publish failed for ${event.eventType} (${outboxId}), falling back to polling: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
