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
import { PlayerId } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { CreditWalletUseCase } from '@/application/use-cases/credit-wallet.use-case';
import { PlayerWalletResolver } from '@/application/services/player-wallet-resolver.service';
import { INBOX_REPOSITORY, PLAYER_WALLET_RESOLVER } from '@/application/di.tokens';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import type { PlayerCashedOutEvent } from '../../types/games.events';

/**
 * Handler for PlayerCashedOutEvent.
 *
 * When a player cashes out in the Games service, this handler
 * credits the winnings to their wallet.
 *
 * Uses Inbox pattern for idempotency:
 * 1. Try create inbox event (fails if duplicate)
 * 2. If duplicate → check status (PROCESSED skip, FAILED retry)
 * 3. Resolve wallet via PlayerWalletResolver
 * 4. Process credit
 * 5. Mark inbox as PROCESSED
 */
@Injectable()
export class PlayerCashedOutEventHandler {
  private readonly logger = new Logger(PlayerCashedOutEventHandler.name);

  constructor(
    private readonly creditWalletUseCase: CreditWalletUseCase,
    @Inject(PLAYER_WALLET_RESOLVER) private readonly playerWalletResolver: PlayerWalletResolver,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  /**
   * Handle the PlayerCashedOutEvent with idempotency.
   *
   * @param event The event from Games service
   */
  async handle(event: PlayerCashedOutEvent): Promise<void> {
    const idempotencyKey = `cashout-${event.betId}`;

    this.metrics.incrRabbitConsumed('wallets.games.events', 'PlayerCashedOut');

    this.logger.debug(
      `Processing PlayerCashedOutEvent: player=${event.playerId}, winAmount=${event.winAmount}, betId=${event.betId}`,
    );

    // 1. Try to create inbox event (fails if duplicate - unique constraint)
    const inboxEvent = await this.inboxRepository.tryCreate({
      idempotencyKey,
      eventType: 'PlayerCashedOut',
      payload: event,
    });

    // 2. If duplicate, check status and handle accordingly
    let eventId: string;
    if (!inboxEvent) {
      const existing = await this.inboxRepository.findByIdempotencyKey(idempotencyKey);

      if (existing?.status === 'PROCESSED') {
        this.logger.log(
          `Duplicate PlayerCashedOutEvent detected (already processed): ${idempotencyKey}. Skipping.`,
        );
        return;
      }

      if (existing?.status === 'FAILED') {
        this.logger.warn(
          `Duplicate PlayerCashedOutEvent detected (previously failed): ${idempotencyKey}. Retrying.`,
        );
        eventId = existing.id;
        // Continue to retry the failed operation
      } else {
        this.logger.log(
          `Duplicate PlayerCashedOutEvent detected (pending): ${idempotencyKey}. Skipping.`,
        );
        return;
      }
    } else {
      eventId = inboxEvent.id;
    }

    try {
      // 3. Resolve wallet using PlayerWalletResolver
      const wallet = await this.playerWalletResolver.resolveWallet(PlayerId.from(event.playerId));

      // 4. Process credit
      await this.creditWalletUseCase.execute({
        walletId: wallet!.id,
        amount: typeof event.winAmount === 'string' ? BigInt(event.winAmount) : event.winAmount,
        reason: `Cash out at ${event.cashOutMultiplier}x in round ${event.roundId} (bet: ${event.betId})`,
      });

      // 5. Mark inbox as PROCESSED
      await this.inboxRepository.markAsProcessed(eventId, new Date());

      this.logger.log(
        `Credited ${event.winAmount} cents to player ${event.playerId} for cash out at ${event.cashOutMultiplier}x`,
      );
    } catch (error: unknown) {
      // Mark as FAILED for visibility and retry
      await this.inboxRepository.markAsFailed(
        eventId,
        error instanceof Error ? error.message : String(error),
        0,
      );

      this.logger.error(
        `Failed to credit wallet for cash out ${event.betId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Re-throw to trigger nack — prevents silently losing player winnings.
      // The consumer will nack the message, enabling retry or DLQ processing.
      throw error;
    }
  }
}
