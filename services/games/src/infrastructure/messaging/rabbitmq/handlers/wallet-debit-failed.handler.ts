/**
 * Wallet Debit Failed Event Handler - Infrastructure Layer
 *
 * Handles WalletDebitFailedEvent from the Wallets service by cancelling
 * the bet (PENDING → CANCELLED) in the Games service.
 */

import { Injectable, Logger } from '@nestjs/common';
import { CancelBetUseCase } from '@/application/use-cases/cancel-bet.use-case';
import type { WalletDebitFailedEvent } from '../../types/wallet.events';

/**
 * Handler for WalletDebitFailedEvent.
 *
 * When the Wallets service fails to debit a bet amount, this handler
 * cancels the bet in the Games service, transitioning it from PENDING to CANCELLED.
 *
 * This is part of the saga pattern:
 * 1. Games creates the bet in PENDING state
 * 2. Wallets attempts to debit but fails
 * 3. Wallets emits WalletDebitFailedEvent (this handler)
 * 4. Games cancels the bet → CANCELLED
 */
@Injectable()
export class WalletDebitFailedEventHandler {
  private readonly logger = new Logger(WalletDebitFailedEventHandler.name);

  constructor(private readonly cancelBetUseCase: CancelBetUseCase) {}

  /**
   * Handle the WalletDebitFailedEvent.
   *
   * @param event The event from Wallets service
   * @throws Error if round or bet not found (will be logged by consumer)
   */
  async handle(event: WalletDebitFailedEvent): Promise<void> {
    try {
      this.logger.debug(
        `Processing WalletDebitFailedEvent: player=${event.playerId}, amount=${event.amount}, betId=${event.betId}, reason=${event.reason}`,
      );

      await this.cancelBetUseCase.execute({
        roundId: event.roundId,
        betId: event.betId,
        playerId: event.playerId,
        reason: event.reason,
      });

      this.logger.log(`Bet ${event.betId} cancelled for player ${event.playerId}: ${event.reason}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to cancel bet ${event.betId}: ${errorMessage}`);
      throw error; // Re-throw for consumer to handle (nack)
    }
  }
}
