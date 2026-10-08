import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IInboxRepository, InboxEvent } from '@/application/interfaces/inbox.repository';
import { INBOX_REPOSITORY } from '@/application/di.tokens';
import { WalletDebitedEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/wallet-debited.handler';
import { WalletDebitFailedEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/wallet-debit-failed.handler';
import type {
  WalletDebitedMessage,
  WalletDebitFailedMessage,
} from '@/infrastructure/messaging/types/wallet.events';

/**
 * Inbox Processor - Infrastructure Layer
 *
 * Retries FAILED inbox events (bounded by MAX_RETRIES) and purges old
 * processed ones.
 */
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

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldEvents(): Promise<void> {
    try {
      const deleted = await this.inboxRepository.deleteProcessedOlderThan(this.RETENTION_DAYS);
      if (deleted > 0) {
        this.logger.log(
          `Cleaned up ${deleted} inbox events older than ${this.RETENTION_DAYS} days`,
        );
      }
    } catch (error: unknown) {
      this.logger.error('Error cleaning up inbox events', error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailedEvents(): Promise<void> {
    try {
      const failed = await this.inboxRepository.findFailed(this.MAX_RETRIES);
      for (const event of failed) {
        await this.retry(event);
      }
    } catch (error: unknown) {
      this.logger.error('Error retrying failed inbox events', error);
    }
  }

  private async retry(event: InboxEvent): Promise<void> {
    this.logger.warn(
      `Retrying inbox event ${event.idempotencyKey} (attempt ${event.retryCount + 1})`,
    );

    try {
      switch (event.eventType) {
        case 'WalletDebited':
          await this.walletDebitedHandler.handle(event.payload as WalletDebitedMessage);
          break;
        case 'WalletDebitFailed':
          await this.walletDebitFailedHandler.handle(event.payload as WalletDebitFailedMessage);
          break;
        default:
          this.logger.warn(`No retry handler for inbox event type ${event.eventType}`);
      }
    } catch {
      // Already recorded by IdempotentInbox; the next run retries until MAX_RETRIES
    }
  }
}
