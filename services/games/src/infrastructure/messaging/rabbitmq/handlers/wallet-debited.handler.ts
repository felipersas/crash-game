/**
 * Wallet Debited Event Handler - Infrastructure Layer
 *
 * Handles WalletDebitedEvent from the Wallets service by confirming
 * the bet (PENDING → ACTIVE) in the Games service.
 *
 * Uses Inbox pattern for idempotency - prevents double confirming
 * if duplicate events are received from RabbitMQ.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfirmBetUseCase } from '@/application/use-cases/confirm-bet.use-case';
import { INBOX_REPOSITORY } from '@/application/di.tokens';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import type { WalletDebitedEvent } from '../../types/wallet.events';
import { RoundId, BetId, PlayerId } from '@crash/domain';

/**
 * Handler for WalletDebitedEvent.
 *
 * When the Wallets service successfully debits a bet amount, this handler
 * confirms the bet in the Games service, transitioning it from PENDING to ACTIVE.
 *
 * Uses Inbox pattern for idempotency:
 * 1. Try create inbox event (fails if duplicate)
 * 2. If duplicate → check status (PROCESSED skip, FAILED retry)
 * 3. Process: confirm bet via use case
 * 4. Mark inbox as PROCESSED/FAILED
 */
@Injectable()
export class WalletDebitedEventHandler {
  private readonly logger = new Logger(WalletDebitedEventHandler.name);

  constructor(
    private readonly confirmBetUseCase: ConfirmBetUseCase,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository,
  ) {}

  /**
   * Handle the WalletDebitedEvent with idempotency.
   *
   * @param event The event from Wallets service
   */
  async handle(event: WalletDebitedEvent): Promise<void> {
    const idempotencyKey = `wallet-debit-${event.betId}`;

    this.logger.debug(
      `Processing WalletDebitedEvent: player=${event.playerId}, amount=${event.amount}, betId=${event.betId}`,
    );

    // 1. Try to create inbox event (fails if duplicate - unique constraint)
    const inboxEvent = await this.inboxRepository.tryCreate({
      idempotencyKey,
      eventType: 'WalletDebited',
      payload: event,
    });

    // 2. If duplicate, check status and handle accordingly
    let eventId: string;
    if (!inboxEvent) {
      const existing = await this.inboxRepository.findByIdempotencyKey(idempotencyKey);

      if (existing?.status === 'PROCESSED') {
        this.logger.log(
          `Duplicate WalletDebitedEvent detected (already processed): ${idempotencyKey}. Skipping.`,
        );
        return;
      }

      if (existing?.status === 'FAILED') {
        this.logger.warn(
          `Duplicate WalletDebitedEvent detected (previously failed): ${idempotencyKey}. Retrying.`,
        );
        eventId = existing.id;
      } else {
        this.logger.log(
          `Duplicate WalletDebitedEvent detected (pending): ${idempotencyKey}. Skipping.`,
        );
        return;
      }
    } else {
      eventId = inboxEvent.id;
    }

    try {
      // 3. Process: confirm the bet
      await this.confirmBetUseCase.execute({
        roundId: RoundId.from(event.roundId),
        betId: BetId.from(event.betId),
        playerId: PlayerId.from(event.playerId),
      });

      // 4. Mark inbox as PROCESSED
      await this.inboxRepository.markAsProcessed(eventId, new Date());

      this.logger.log(`Bet ${event.betId} confirmed for player ${event.playerId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as FAILED for retry
      await this.inboxRepository.markAsFailed(eventId, errorMessage, 0);

      this.logger.error(`Failed to confirm bet ${event.betId}: ${errorMessage}`);
      throw error; // Re-throw for consumer to handle (nack)
    }
  }
}
