import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import type { IEventPublisher } from '@crash/messaging';
import { EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import { Inject } from '@nestjs/common';

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly RETRY_DELAY_MS = 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

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
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
      await this.eventPublisher.publish(payload);

      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      this.logger.debug(`Published outbox event: ${event.eventType}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to publish outbox event ${event.id}:`, error);

      const retryCount = (event.retryCount || 0) + 1;
      const delay = this.RETRY_DELAY_MS * Math.pow(2, retryCount - 1);

      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          retryCount,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

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
