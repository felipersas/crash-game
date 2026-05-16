/**
 * Bet Placed Event Handler - Infrastructure Layer
 *
 * Handles BetPlacedEvent from the Games service by debiting
 * the bet amount from the player's wallet.
 *
 * Uses Inbox pattern for idempotency - prevents double debiting
 * if duplicate events are received from RabbitMQ.
 *
 * Emits confirmation events back to Games service via outbox:
 * - WalletDebitedEvent: Success → bet confirmed (PENDING → ACTIVE)
 * - WalletDebitFailedEvent: Failure → bet cancelled (PENDING → CANCELLED)
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PlayerId } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { DebitWalletUseCase } from '@/application/use-cases/debit-wallet.use-case';
import { PlayerWalletResolver } from '@/application/services/player-wallet-resolver.service';
import { PLAYER_WALLET_RESOLVER, INBOX_REPOSITORY } from '@/application/di.tokens';
import type { IInboxRepository } from '@/application/interfaces/inbox.repository';
import {
  createWalletDebitedEvent,
  createWalletDebitFailedEvent,
} from '@/domain/events/wallet.events';
import type { BetPlacedEvent } from '../../types/games.events';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';

/**
 * Handler for BetPlacedEvent.
 *
 * When a player places a bet in the Games service, this handler
 * debits the corresponding amount from their wallet and writes
 * a confirmation event to the outbox for reliable delivery.
 *
 * Uses Inbox pattern for idempotency:
 * 1. Try create inbox event (fails if duplicate)
 * 2. If duplicate → check status (PROCESSED skip, FAILED retry)
 * 3. Resolve wallet via PlayerWalletResolver
 * 4. Process debit (with compensating rollback on publish failure)
 * 5. Write confirmation event to outbox (atomic with inbox status)
 * 6. Mark inbox as PROCESSED/FAILED
 *
 * This is part of the saga pattern:
 * 1. Games creates the bet in PENDING state
 * 2. Wallets debits the amount (this handler)
 * 3. Wallets emits confirmation event via outbox (success or failure)
 * 4. Games consumes confirmation to confirm/cancel bet
 */
@Injectable()
export class BetPlacedEventHandler {
  private readonly logger = new Logger(BetPlacedEventHandler.name);

  constructor(
    private readonly debitWalletUseCase: DebitWalletUseCase,
    @Inject(PLAYER_WALLET_RESOLVER) private readonly playerWalletResolver: PlayerWalletResolver,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepository: IInboxRepository,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  /**
   * Handle the BetPlacedEvent with idempotency.
   *
   * @param event The event from Games service
   */
  async handle(event: BetPlacedEvent): Promise<void> {
    const idempotencyKey = `bet-${event.betId}`;

    this.metrics.incrRabbitConsumed('wallets.games.events', 'BetPlaced');

    this.logger.debug(
      `Processing BetPlacedEvent: player=${event.playerId}, amount=${event.amount}, betId=${event.betId}`,
    );

    // 1. Try to create inbox event (fails if duplicate - unique constraint)
    const inboxEvent = await this.inboxRepository.tryCreate({
      idempotencyKey,
      eventType: 'BetPlaced',
      payload: event,
    });

    // 2. If duplicate, check status and handle accordingly
    let eventId: string;
    if (!inboxEvent) {
      const existing = await this.inboxRepository.findByIdempotencyKey(idempotencyKey);

      if (existing?.status === 'PROCESSED') {
        this.logger.log(
          `Duplicate BetPlacedEvent detected (already processed): ${idempotencyKey}. Skipping.`,
        );
        return;
      }

      if (existing?.status === 'FAILED') {
        this.logger.warn(
          `Duplicate BetPlacedEvent detected (previously failed): ${idempotencyKey}. Retrying.`,
        );
        eventId = existing.id;
      } else {
        this.logger.log(
          `Duplicate BetPlacedEvent detected (pending): ${idempotencyKey}. Skipping.`,
        );
        return;
      }
    } else {
      eventId = inboxEvent.id;
    }

    try {
      // 3. Resolve wallet using PlayerWalletResolver
      const wallet = await this.playerWalletResolver.resolveWallet(PlayerId.from(event.playerId));

      // 4. Process debit
      await this.debitWalletUseCase.execute({
        walletId: wallet!.id,
        amount: typeof event.amount === 'string' ? BigInt(event.amount) : event.amount,
        reason: `Bet placed in round ${event.roundId} (bet: ${event.betId})`,
      });

      this.logger.log(
        `Debited ${event.amount} cents from player ${event.playerId} for bet ${event.betId}`,
      );

      // 5. Write WalletDebitedEvent to outbox for reliable delivery to Games service
      const confirmationEvent = createWalletDebitedEvent(
        event.roundId,
        event.betId,
        event.playerId,
        event.amount,
        event.version || 1,
      );

      let outboxIds: string[] = [];
      await this.prisma.$transaction(async (tx) => {
        outboxIds = await this.outboxWriter.writeWithinTransaction(tx, event.roundId, [
          confirmationEvent,
        ]);
      });

      // Best-effort immediate publish for low latency
      if (outboxIds.length > 0) {
        await this.outboxWriter.tryImmediatePublish([confirmationEvent], outboxIds);
      }

      this.logger.debug(`Wrote WalletDebitedEvent to outbox for bet ${event.betId}`);

      // 6. Mark inbox as PROCESSED (debit AND outbox write both succeeded)
      await this.inboxRepository.markAsProcessed(eventId, new Date());
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as FAILED for visibility
      await this.inboxRepository.markAsFailed(eventId, errorMessage, 0);

      // Write WalletDebitFailedEvent to outbox for reliable delivery to Games service
      try {
        const failureEvent = createWalletDebitFailedEvent(
          event.roundId,
          event.betId,
          event.playerId,
          event.amount,
          errorMessage,
          event.version || 1,
        );

        let outboxIds: string[] = [];
        await this.prisma.$transaction(async (tx) => {
          outboxIds = await this.outboxWriter.writeWithinTransaction(tx, event.roundId, [
            failureEvent,
          ]);
        });

        // Best-effort immediate publish for low latency
        if (outboxIds.length > 0) {
          await this.outboxWriter.tryImmediatePublish([failureEvent], outboxIds);
        }
      } catch (outboxError) {
        this.logger.error(
          `Failed to write WalletDebitFailedEvent to outbox for bet ${event.betId}: ${outboxError instanceof Error ? outboxError.message : String(outboxError)}`,
        );
      }

      this.logger.error(`Failed to debit wallet for bet ${event.betId}: ${errorMessage}`);

      // Don't re-throw - saga pattern: we've written the failure event to outbox
      // Consumer will ACK the message
    }
  }
}
