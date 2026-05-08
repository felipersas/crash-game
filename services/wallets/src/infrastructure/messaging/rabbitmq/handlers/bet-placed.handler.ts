/**
 * Bet Placed Event Handler - Infrastructure Layer
 *
 * Handles BetPlacedEvent from the Games service by debiting
 * the bet amount from the player's wallet.
 */

import { Injectable, Logger } from '@nestjs/common';
import { DebitWalletUseCase } from '@/application/use-cases/debit-wallet.use-case';
import type { BetPlacedEvent } from '../../types/games.events';

/**
 * Handler for BetPlacedEvent.
 *
 * When a player places a bet in the Games service, this handler
 * debits the corresponding amount from their wallet.
 *
 * This is part of the saga pattern:
 * 1. Games creates the bet
 * 2. Wallets debits the amount (this handler)
 * 3. If debit fails, the bet should be cancelled (compensation)
 */
@Injectable()
export class BetPlacedEventHandler {
  private readonly logger = new Logger(BetPlacedEventHandler.name);

  constructor(private readonly debitWalletUseCase: DebitWalletUseCase) {}

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
    } catch (error: unknown) {
      this.logger.error(
        `Failed to debit wallet for bet ${event.betId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw for consumer to handle ( nack)
    }
  }
}
