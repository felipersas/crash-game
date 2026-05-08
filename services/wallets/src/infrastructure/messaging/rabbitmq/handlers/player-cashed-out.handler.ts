/**
 * Player Cashed Out Event Handler - Infrastructure Layer
 *
 * Handles PlayerCashedOutEvent from the Games service by crediting
 * the winnings to the player's wallet.
 */

import { Injectable, Logger } from '@nestjs/common';
import { CreditWalletUseCase } from '@/application/use-cases/credit-wallet.use-case';
import type { PlayerCashedOutEvent } from '../../types/games.events';

/**
 * Handler for PlayerCashedOutEvent.
 *
 * When a player cashes out in the Games service, this handler
 * credits the winnings to their wallet.
 *
 * The winnings are calculated as: betAmount × cashOutMultiplier
 */
@Injectable()
export class PlayerCashedOutEventHandler {
  private readonly logger = new Logger(PlayerCashedOutEventHandler.name);

  constructor(private readonly creditWalletUseCase: CreditWalletUseCase) {}

  /**
   * Handle the PlayerCashedOutEvent.
   *
   * @param event The event from Games service
   * @throws Error if wallet not found (will be logged by consumer)
   */
  async handle(event: PlayerCashedOutEvent): Promise<void> {
    try {
      this.logger.debug(
        `Processing PlayerCashedOutEvent: player=${event.playerId}, winAmount=${event.winAmount}, betId=${event.betId}`,
      );

      await this.creditWalletUseCase.execute({
        walletId: event.playerId, // In this design, walletId = playerId
        amount: event.winAmount,
        reason: `Cash out at ${event.cashOutMultiplier}x in round ${event.roundId} (bet: ${event.betId})`,
        idempotencyKey: `cashout-${event.betId}`, // Prevent double crediting
      });

      this.logger.log(
        `Credited ${event.winAmount} cents to player ${event.playerId} for cash out at ${event.cashOutMultiplier}x`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to credit wallet for cash out ${event.betId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw for consumer to handle (nack)
    }
  }
}
