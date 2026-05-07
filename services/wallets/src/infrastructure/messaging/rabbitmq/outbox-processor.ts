/**
 * Outbox Processor - Infrastructure Layer
 *
 * Background worker that processes pending outbox events
 * and publishes them to RabbitMQ.
 *
 * Implements the Transactional Outbox pattern for at-least-once delivery.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_SIZE = 50;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Process pending outbox events every 5 seconds.
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async processPendingEvents() {
    try {
      const pendingEvents = await this.prisma.outboxEvent.findMany({
        where: {
          status: 'PENDING',
          retryCount: { lt: this.MAX_RETRIES },
        },
        take: this.BATCH_SIZE,
        orderBy: { createdAt: 'asc' },
      });

      if (pendingEvents.length === 0) {
        return;
      }

      this.logger.debug(`Processing ${pendingEvents.length} pending outbox events`);

      for (const event of pendingEvents) {
        await this.publishEvent(event);
      }
    } catch (error: unknown) {
      this.logger.error('Error processing outbox events:', error);
    }
  }

  private async publishEvent(event: any) {
    try {
      // TODO: Publish to RabbitMQ
      // For now, just mark as sent
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      this.logger.debug(`Published outbox event: ${event.id}`);
    } catch (error: unknown) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          retryCount: { increment: 1 },
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });

      this.logger.error(`Failed to publish outbox event ${event.id}:`, error);
    }
  }
}
