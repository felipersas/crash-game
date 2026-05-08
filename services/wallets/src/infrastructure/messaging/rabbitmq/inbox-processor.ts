/**
 * Inbox Processor - Infrastructure Layer
 *
 * Background worker that cleans up old processed inbox events.
 * Keeps the inbox table size manageable by removing events older than 30 days.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import { INBOX_REPOSITORY } from '@/infrastructure/di/tokens';
import { Inject } from '@nestjs/common';

@Injectable()
export class InboxProcessor {
  private readonly logger = new Logger(InboxProcessor.name);
  private readonly RETENTION_DAYS = 30;

  constructor(@Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository) {}

  /**
   * Clean up processed inbox events older than 30 days.
   * Runs daily at 2 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldEvents(): Promise<void> {
    try {
      const deletedCount = await this.inboxRepository.deleteOlderThan(this.RETENTION_DAYS);

      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} old inbox events (older than ${this.RETENTION_DAYS} days)`);
      }
    } catch (error: unknown) {
      this.logger.error('Error cleaning up inbox events:', error);
    }
  }
}
