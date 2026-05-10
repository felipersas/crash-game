/**
 * Wallet Debited Event Handler - Infrastructure Layer
 *
 * Handles WalletDebitedEvent from the Wallets service by confirming
 * the bet (PENDING → ACTIVE) in the Games service.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfirmBetUseCase } from '@/application/use-cases/confirm-bet.use-case';
import type { WalletDebitedEvent } from '../../types/wallet.events';

/**
 * Handler for WalletDebitedEvent.
 *
 * When the Wallets service successfully debits a bet amount, this handler
 * confirms the bet in the Games service, transitioning it from PENDING to ACTIVE.
 *
 * This is part of the saga pattern:
 * 1. Games creates the bet in PENDING state
 * 2. Wallets debits the amount
 * 3. Wallets emits WalletDebitedEvent (this handler)
 * 4. Games confirms the bet → ACTIVE
 */
@Injectable()
export class WalletDebitedEventHandler {
  private readonly logger = new Logger(WalletDebitedEventHandler.name);

  constructor(private readonly confirmBetUseCase: ConfirmBetUseCase) {}

  /**
   * Handle the WalletDebitedEvent.
   *
   * @param event The event from Wallets service
   * @throws Error if round or bet not found (will be logged by consumer)
   */
  async handle(event: WalletDebitedEvent): Promise<void> {
    try {
      this.logger.debug(
        `Processing WalletDebitedEvent: player=${event.playerId}, amount=${event.amount}, betId=${event.betId}`,
      );

      await this.confirmBetUseCase.execute({
        roundId: event.roundId,
        betId: event.betId,
        playerId: event.playerId,
      });

      this.logger.log(`Bet ${event.betId} confirmed for player ${event.playerId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to confirm bet ${event.betId}: ${errorMessage}`);
      throw error; // Re-throw for consumer to handle (nack)
    }
  }
}
