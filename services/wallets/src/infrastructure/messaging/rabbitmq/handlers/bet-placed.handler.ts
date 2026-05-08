/**
 * Bet Placed Event Handler - Infrastructure Layer
 *
 * Handles BetPlacedEvent from the Games service by debiting
 * the bet amount from the player's wallet.
 *
 * Emits confirmation events back to Games service:
 * - WalletDebitedEvent: Success → bet confirmed (PENDING → ACTIVE)
 * - WalletDebitFailedEvent: Failure → bet cancelled (PENDING → CANCELLED)
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DebitWalletUseCase } from '@/application/use-cases/debit-wallet.use-case';
import { EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import type { IEventPublisher } from '@crash/messaging';
import {
  createWalletDebitedEvent,
  createWalletDebitFailedEvent,
} from '@/domain/events/wallet.events';
import type { BetPlacedEvent } from '../../types/games.events';

/**
 * Handler for BetPlacedEvent.
 *
 * When a player places a bet in the Games service, this handler
 * debits the corresponding amount from their wallet and emits
 * a confirmation event.
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
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  /**
   * Handle the BetPlacedEvent.
   *
   * @param event The event from Games service
   * @throws Error if wallet not found or insufficient funds (will be logged by consumer)
   */
  async handle(event: BetPlacedEvent): Promise<void> {
    try {
      this.logger.debug(
        `Processing BetPlacedEvent: player=${event.playerId}, amount=${event.amount}, betId=${event.betId}`,
      );

      await this.debitWalletUseCase.execute({
        walletId: event.playerId, // In this design, walletId = playerId
        amount: event.amount,
        reason: `Bet placed in round ${event.roundId} (bet: ${event.betId})`,
        idempotencyKey: `bet-${event.betId}`, // Prevent double debiting
      });

      this.logger.log(
        `Debited ${event.amount} cents from player ${event.playerId} for bet ${event.betId}`,
      );

      // Emit success confirmation event
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
