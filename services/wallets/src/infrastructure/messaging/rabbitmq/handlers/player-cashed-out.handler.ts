/**
 * Player Cashed Out Event Handler - Infrastructure Layer
 *
 * Handles PlayerCashedOutEvent from the Games service by crediting
 * the winnings to the player's wallet.
 *
 * Uses Inbox pattern for idempotency - prevents double crediting
 * if duplicate events are received from RabbitMQ.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreditWalletUseCase } from '@/application/use-cases/credit-wallet.use-case';
import { WALLET_REPOSITORY, INBOX_REPOSITORY } from '@/infrastructure/di/tokens';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import type { PlayerCashedOutEvent } from '../../types/games.events';
import { WalletNotFoundError } from '@/domain/errors/domain.errors';

/**
 * Handler for PlayerCashedOutEvent.
 *
 * When a player cashes out in the Games service, this handler
 * credits the winnings to their wallet.
 *
 * Uses Inbox pattern for idempotency:
 * 1. Try create inbox event (fails if duplicate)
 * 2. If duplicate → skip (already processed)
 * 3. Process credit
 * 4. Mark inbox as PROCESSED
 */
@Injectable()
export class PlayerCashedOutEventHandler {
  private readonly logger = new Logger(PlayerCashedOutEventHandler.name);

  constructor(
    private readonly creditWalletUseCase: CreditWalletUseCase,
    @Inject(WALLET_REPOSITORY) private readonly walletRepository: IWalletRepository,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository,
  ) {}

  /**
   * Handle the PlayerCashedOutEvent with idempotency.
   *
   * @param event The event from Games service
   * @throws Error if wallet not found (will be logged by consumer)
   */
  async handle(event: PlayerCashedOutEvent): Promise<void> {
    const idempotencyKey = `cashout-${event.betId}`;

    this.logger.debug(
      `Processing PlayerCashedOutEvent: player=${event.playerId}, winAmount=${event.winAmount}, betId=${event.betId}`,
    );

    // 1. Try to create inbox event (fails if duplicate - unique constraint)
    const inboxEvent = await this.inboxRepository.tryCreate({
      idempotencyKey,
      eventType: 'PlayerCashedOut',
      payload: event,
    });

    // 2. If duplicate, skip processing (already processed)
    if (!inboxEvent) {
      this.logger.log(`Duplicate PlayerCashedOutEvent detected: ${idempotencyKey}. Skipping.`);
      return;
    }

    try {
      // 3. Find wallet by playerId (Wallets service owns the playerId → walletId mapping)
      const wallet = await this.walletRepository.findByPlayerId(event.playerId);
      if (!wallet) {
        throw new WalletNotFoundError(`playerId=${event.playerId}`);
      }

      // 4. Process credit (no idempotencyKey needed here - inbox handles it)
      await this.creditWalletUseCase.execute({
        walletId: wallet.id,
        amount: typeof event.winAmount === 'string' ? BigInt(event.winAmount) : event.winAmount,
        reason: `Cash out at ${event.cashOutMultiplier}x in round ${event.roundId} (bet: ${event.betId})`,
      });

      // 5. Mark inbox as PROCESSED
      await this.inboxRepository.markAsProcessed(inboxEvent.id, new Date());

      this.logger.log(
        `Credited ${event.winAmount} cents to player ${event.playerId} for cash out at ${event.cashOutMultiplier}x`,
      );
    } catch (error: unknown) {
      // Mark as FAILED for visibility
      await this.inboxRepository.markAsFailed(
        inboxEvent.id,
        error instanceof Error ? error.message : String(error),
        0,
      );

      this.logger.error(
        `Failed to credit wallet for cash out ${event.betId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw for consumer to handle (nack/retry)
    }
  }
}
