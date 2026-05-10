import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly RETRY_DELAY_MS = 1000; // Start with 1 second

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_SECOND)
  async processPendingEvents() {
    const pendingEvents = await this.prisma.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        retryCount: {
          lt: this.MAX_RETRY_ATTEMPTS,
        },
      },
      take: 10,
      orderBy: {
        createdAt: 'asc',
      },
    });

    for (const event of pendingEvents) {
      await this.processEvent(event);
    }
  }

  private async processEvent(event: any) {
    try {
      // In a real implementation, this would publish to RabbitMQ
      // For now, we'll just mark as sent
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      this.logger.debug(`Processed outbox event: ${event.eventType}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to process outbox event ${event.id}:`, error);

      const retryCount = (event.retryCount || 0) + 1;
      const delay = this.RETRY_DELAY_MS * Math.pow(2, retryCount - 1);

      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          retryCount,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      // Exponential backoff - don't retry immediately
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  async cleanupOldSentEvents() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await this.prisma.outboxEvent.deleteMany({
      where: {
        status: 'SENT',
        sentAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    this.logger.debug('Cleaned up old sent events');
  }
}
