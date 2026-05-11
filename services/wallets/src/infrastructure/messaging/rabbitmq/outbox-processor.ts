import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import type { IEventPublisher } from '@crash/messaging';
import { EVENT_PUBLISHER } from '@/infrastructure/di/tokens';

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_SIZE = 50;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

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
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
      await this.eventPublisher.publish(payload);

      this.metrics.incrRabbitPublished('wallet.events', payload.eventType || 'unknown');

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
