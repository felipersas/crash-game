/**
 * Inbox Processor - Infrastructure Layer
 *
 * Background worker that cleans up old processed inbox events
 * and retries FAILED events up to a maximum number of attempts.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import { INBOX_REPOSITORY } from '@/application/di.tokens';
import { WalletDebitedEventHandler } from './handlers/wallet-debited.handler';
import { WalletDebitFailedEventHandler } from './handlers/wallet-debit-failed.handler';
import type { WalletDebitedEvent, WalletDebitFailedEvent } from '../types/wallet.events';

@Injectable()
export class InboxProcessor {
  private readonly logger = new Logger(InboxProcessor.name);
  private readonly RETENTION_DAYS = 30;
  private readonly MAX_RETRIES = 5;

  constructor(
    @Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository,
    private readonly walletDebitedHandler: WalletDebitedEventHandler,
    private readonly walletDebitFailedHandler: WalletDebitFailedEventHandler,
  ) {}

  /**
   * Clean up processed inbox events older than 30 days.
   * Runs daily at 2 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldEvents(): Promise<void> {
    try {
      const deletedCount = await this.inboxRepository.deleteOlderThan(this.RETENTION_DAYS);

      if (deletedCount > 0) {
        this.logger.log(
          `Cleaned up ${deletedCount} old inbox events (older than ${this.RETENTION_DAYS} days)`,
        );
      }
    } catch (error: unknown) {
      this.logger.error('Error cleaning up inbox events:', error);
    }
  }

  /**
   * Retry FAILED inbox events that haven't exceeded MAX_RETRIES.
   * Runs every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailedEvents(): Promise<void> {
    try {
      const failedEvents = await this.inboxRepository.findFailed(this.MAX_RETRIES);

      for (const event of failedEvents) {
        this.logger.warn(
          `Retrying failed inbox event: ${event.idempotencyKey} (attempt ${event.retryCount + 1})`,
        );

        try {
          if (event.eventType === 'WalletDebited') {
            await this.walletDebitedHandler.handle(event.payload as WalletDebitedEvent);
          } else if (event.eventType === 'WalletDebitFailed') {
            await this.walletDebitFailedHandler.handle(event.payload as WalletDebitFailedEvent);
          }
        } catch (retryError) {
          this.logger.error(
            `Retry failed for inbox event ${event.idempotencyKey}: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
          );
        }
      }
    } catch (error: unknown) {
      this.logger.error('Error retrying failed inbox events:', error);
    }
  }
}
