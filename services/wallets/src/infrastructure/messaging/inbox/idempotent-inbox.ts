import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import { INBOX_REPOSITORY } from '@/application/di.tokens';

/**
 * Applies the inbox pattern around an event handler:
 * - first delivery: record the event, run the handler, mark PROCESSED
 * - duplicate of a PROCESSED or in-flight event: skip
 * - duplicate of a FAILED or stale PENDING event: run the handler again (retry)
 * The handler receives the inbox event id so money movements can mark it
 * PROCESSED inside their own transaction (a retry can never apply them twice).
 * Failures are recorded (retry count incremented) and rethrown.
 */
/**
 * A PENDING row older than this means the process died mid-handling; the
 * event is retried instead of being skipped forever.
 */
const STALE_PENDING_MS = 60_000;

@Injectable()
export class IdempotentInbox {
  private readonly logger = new Logger(IdempotentInbox.name);

  constructor(@Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository) {}

  async process(
    idempotencyKey: string,
    eventType: string,
    payload: unknown,
    handler: (inboxEventId: string) => Promise<void>,
  ): Promise<void> {
    const inboxEventId = await this.claim(idempotencyKey, eventType, payload);
    if (!inboxEventId) return;

    try {
      await handler(inboxEventId);
      await this.inboxRepository.markAsProcessed(inboxEventId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.inboxRepository.markAsFailed(inboxEventId, message);
      this.logger.error(`${eventType} ${idempotencyKey} failed: ${message}`);
      throw error;
    }
  }

  /**
   * Returns the inbox row id to process, or null when the event must be skipped.
   */
  private async claim(
    idempotencyKey: string,
    eventType: string,
    payload: unknown,
  ): Promise<string | null> {
    const created = await this.inboxRepository.tryCreate({ idempotencyKey, eventType, payload });
    if (created) return created.id;

    const existing = await this.inboxRepository.findByIdempotencyKey(idempotencyKey);
    const isStalePending =
      existing?.status === 'PENDING' &&
      Date.now() - existing.createdAt.getTime() > STALE_PENDING_MS;
    if (existing?.status === 'FAILED' || isStalePending) {
      this.logger.warn(`Retrying ${existing.status} ${eventType}: ${idempotencyKey}`);
      return existing.id;
    }

    this.logger.log(`Skipping duplicate ${eventType} (${existing?.status}): ${idempotencyKey}`);
    return null;
  }
}
