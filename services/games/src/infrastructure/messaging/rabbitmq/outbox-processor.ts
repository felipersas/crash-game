import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IEventPublisher, SerializedEvent } from '@crash/messaging';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { RABBITMQ_PUBLISHER } from '@/infrastructure/di.tokens';

/**
 * Outbox Processor - Infrastructure Layer
 *
 * Polling fallback for events whose immediate publish failed.
 */
@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly MAX_RETRIES = 5;
  private readonly BATCH_SIZE = 50;
  private readonly RETENTION_DAYS = 30;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RABBITMQ_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async processPendingEvents(): Promise<void> {
    // Cron ticks can overlap with a slow batch; never publish the same row twice concurrently
    if (this.running) return;
    this.running = true;

    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { status: 'PENDING', retryCount: { lt: this.MAX_RETRIES } },
        orderBy: { createdAt: 'asc' },
        take: this.BATCH_SIZE,
      });

      for (const row of pending) {
        await this.publish(row.id, row.payload as SerializedEvent, row.retryCount ?? 0);
      }
    } catch (error: unknown) {
      this.logger.error('Error processing outbox events', error);
    } finally {
      this.running = false;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupSentEvents(): Promise<void> {
    const cutoff = new Date(Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.outboxEvent.deleteMany({
      where: { status: 'SENT', sentAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Cleaned up ${count} sent outbox events`);
    }
  }

  private async publish(id: string, event: SerializedEvent, retryCount: number): Promise<void> {
    try {
      await this.publisher.publish(event);
      await this.prisma.outboxEvent.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (error: unknown) {
      const attempts = retryCount + 1;
      this.logger.error(`Failed to publish outbox event ${id} (attempt ${attempts})`, error);
      await this.prisma.outboxEvent.update({
        where: { id },
        data: {
          retryCount: attempts,
          // Give up visibly instead of leaving an unpublishable row PENDING forever
          status: attempts >= this.MAX_RETRIES ? 'FAILED' : 'PENDING',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
