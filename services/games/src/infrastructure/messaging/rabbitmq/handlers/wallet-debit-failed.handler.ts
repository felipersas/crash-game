/**
 * Wallet Debit Failed Event Handler - Infrastructure Layer
 *
 * Handles WalletDebitFailedEvent from the Wallets service by cancelling
 * the bet (PENDING → CANCELLED) in the Games service.
 *
 * Uses Inbox pattern for idempotency - prevents double cancelling
 * if duplicate events are received from RabbitMQ.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CancelBetUseCase } from '@/application/use-cases/cancel-bet.use-case';
import { INBOX_REPOSITORY } from '@/application/di.tokens';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import type { WalletDebitFailedEvent } from '../../types/wallet.events';

/**
 * Handler for WalletDebitFailedEvent.
 *
 * When the Wallets service fails to debit a bet amount, this handler
 * cancels the bet in the Games service, transitioning it from PENDING to CANCELLED.
 *
 * Uses Inbox pattern for idempotency:
 * 1. Try create inbox event (fails if duplicate)
 * 2. If duplicate → check status (PROCESSED skip, FAILED retry)
 * 3. Process: cancel bet via use case
 * 4. Mark inbox as PROCESSED/FAILED
 */
@Injectable()
export class WalletDebitFailedEventHandler {
  private readonly logger = new Logger(WalletDebitFailedEventHandler.name);

  constructor(
    private readonly cancelBetUseCase: CancelBetUseCase,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository,
  ) {}

  /**
   * Handle the WalletDebitFailedEvent with idempotency.
   *
   * @param event The event from Wallets service
   */
  async handle(event: WalletDebitFailedEvent): Promise<void> {
    const idempotencyKey = `wallet-debit-fail-${event.betId}`;

    this.logger.debug(
      `Processing WalletDebitFailedEvent: player=${event.playerId}, amount=${event.amount}, betId=${event.betId}, reason=${event.reason}`,
    );

    // 1. Try to create inbox event (fails if duplicate - unique constraint)
    const inboxEvent = await this.inboxRepository.tryCreate({
      idempotencyKey,
      eventType: 'WalletDebitFailed',
      payload: event,
    });

    // 2. If duplicate, check status and handle accordingly
    let eventId: string;
    if (!inboxEvent) {
      const existing = await this.inboxRepository.findByIdempotencyKey(idempotencyKey);

      if (existing?.status === 'PROCESSED') {
        this.logger.log(
          `Duplicate WalletDebitFailedEvent detected (already processed): ${idempotencyKey}. Skipping.`,
        );
        return;
      }

      if (existing?.status === 'FAILED') {
        this.logger.warn(
          `Duplicate WalletDebitFailedEvent detected (previously failed): ${idempotencyKey}. Retrying.`,
        );
        eventId = existing.id;
      } else {
        this.logger.log(
          `Duplicate WalletDebitFailedEvent detected (pending): ${idempotencyKey}. Skipping.`,
        );
        return;
      }
    } else {
      eventId = inboxEvent.id;
    }

    try {
      // 3. Process: cancel the bet
      await this.cancelBetUseCase.execute({
        roundId: event.roundId,
        betId: event.betId,
        playerId: event.playerId,
        reason: event.reason,
      });

      // 4. Mark inbox as PROCESSED
      await this.inboxRepository.markAsProcessed(eventId, new Date());

      this.logger.log(`Bet ${event.betId} cancelled for player ${event.playerId}: ${event.reason}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as FAILED for retry
      await this.inboxRepository.markAsFailed(eventId, errorMessage, 0);

      this.logger.error(`Failed to cancel bet ${event.betId}: ${errorMessage}`);
      throw error; // Re-throw for consumer to handle (nack)
    }
  }
}
