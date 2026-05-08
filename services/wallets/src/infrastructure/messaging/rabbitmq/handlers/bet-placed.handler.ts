/**
 * Bet Placed Event Handler - Infrastructure Layer
 *
 * Handles BetPlacedEvent from the Games service by debiting
 * the bet amount from the player's wallet.
 *
 * Uses Inbox pattern for idempotency - prevents double debiting
 * if duplicate events are received from RabbitMQ.
 *
 * Emits confirmation events back to Games service:
 * - WalletDebitedEvent: Success → bet confirmed (PENDING → ACTIVE)
 * - WalletDebitFailedEvent: Failure → bet cancelled (PENDING → CANCELLED)
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DebitWalletUseCase } from '@/application/use-cases/debit-wallet.use-case';
import { EVENT_PUBLISHER, WALLET_REPOSITORY, INBOX_REPOSITORY } from '@/infrastructure/di/tokens';
import type { IEventPublisher } from '@crash/messaging';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import {
  createWalletDebitedEvent,
  createWalletDebitFailedEvent,
} from '@/domain/events/wallet.events';
import type { BetPlacedEvent } from '../../types/games.events';
import { WalletNotFoundError } from '@/domain/errors/domain.errors';

/**
 * Handler for BetPlacedEvent.
 *
 * When a player places a bet in the Games service, this handler
 * debits the corresponding amount from their wallet and emits
 * a confirmation event.
 *
 * Uses Inbox pattern for idempotency:
 * 1. Try create inbox event (fails if duplicate)
 * 2. If duplicate → check if already processed (skip) or failed (maybe retry)
 * 3. Process debit
 * 4. Mark inbox as PROCESSED
 * 5. Emit confirmation event
 *
 * This is part of the saga pattern:
 * 1. Games creates the bet in PENDING state
 * 2. Wallets debits the amount (this handler)
 * 3. Wallets emits confirmation event (success or failure)
 * 4. Games consumes confirmation to confirm/cancel bet
 */
@Injectable()
export class BetPlacedEventHandler {
  private readonly logger = new Logger(BetPlacedEventHandler.name);

  constructor(
    private readonly debitWalletUseCase: DebitWalletUseCase,
    @Inject(WALLET_REPOSITORY) private readonly walletRepository: IWalletRepository,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  /**
   * Handle the BetPlacedEvent with idempotency.
   *
   * @param event The event from Games service
   */
  async handle(event: BetPlacedEvent): Promise<void> {
    const idempotencyKey = `bet-${event.betId}`;

    this.logger.debug(
      `Processing BetPlacedEvent: player=${event.playerId}, amount=${event.amount}, betId=${event.betId}`,
    );

    // 1. Try to create inbox event (fails if duplicate - unique constraint)
    const inboxEvent = await this.inboxRepository.tryCreate({
      idempotencyKey,
      eventType: 'BetPlaced',
      payload: event,
    });

    // 2. If duplicate exists, check its status
    let eventId: string;
    if (!inboxEvent) {
      const existing = await this.inboxRepository.findByIdempotencyKey(idempotencyKey);

      if (existing?.status === 'PROCESSED') {
        this.logger.log(`Duplicate BetPlacedEvent detected (already processed): ${idempotencyKey}. Skipping.`);
        return;
      }

      if (existing?.status === 'FAILED') {
        this.logger.warn(`Duplicate BetPlacedEvent detected (previously failed): ${idempotencyKey}. Retrying.`);
        eventId = existing.id;
        // Continue to retry the failed operation
      } else {
        this.logger.log(`Duplicate BetPlacedEvent detected (pending): ${idempotencyKey}. Skipping.`);
        return;
      }
    } else {
      eventId = inboxEvent.id;
    }

    try {
      // 3. Find wallet by playerId (Wallets service owns the playerId → walletId mapping)
      const wallet = await this.walletRepository.findByPlayerId(event.playerId);
      if (!wallet) {
        throw new WalletNotFoundError(`playerId=${event.playerId}`);
      }

      // 4. Process debit (no idempotencyKey needed here - inbox handles it)
      await this.debitWalletUseCase.execute({
        walletId: wallet.id,
        amount: typeof event.amount === 'string' ? BigInt(event.amount) : event.amount,
        reason: `Bet placed in round ${event.roundId} (bet: ${event.betId})`,
      });

      // 5. Mark inbox as PROCESSED
      await this.inboxRepository.markAsProcessed(eventId, new Date());

      this.logger.log(
        `Debited ${event.amount} cents from player ${event.playerId} for bet ${event.betId}`,
      );

      // 6. Emit success confirmation event
      await this.eventPublisher.publish(
        createWalletDebitedEvent(
          event.roundId,
          event.betId,
          event.playerId,
          event.amount,
          event.version || 1,
        ),
      );

      this.logger.debug(
        `Emitted WalletDebitedEvent for bet ${event.betId}`,
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as FAILED for visibility
      await this.inboxRepository.markAsFailed(eventId, errorMessage, 0);

      this.logger.error(
        `Failed to debit wallet for bet ${event.betId}: ${errorMessage}`,
      );

      // Emit failure confirmation event
      await this.eventPublisher.publish(
        createWalletDebitFailedEvent(
          event.roundId,
          event.betId,
          event.playerId,
          event.amount,
          errorMessage,
          event.version || 1,
        ),
      );

      this.logger.debug(
        `Emitted WalletDebitFailedEvent for bet ${event.betId}`,
      );

      // Don't re-throw - we've emitted the failure event
      // The consumer should ack the message since we handled it
    }
  }
}
