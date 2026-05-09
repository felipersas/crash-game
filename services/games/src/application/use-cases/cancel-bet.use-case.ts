import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import type { IEventPublisher } from '@crash/messaging';
import { BET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import { BetNotFoundError } from '@/domain/errors/domain.errors';
import { createBetCancelledEvent } from '@/domain/events/round.events';
import { GamesGateway } from '@/infrastructure/websocket/games.gateway';

export interface CancelBetInput {
  roundId: string;
  betId: string;
  playerId: string;
  reason: string;
}

export interface CancelBetOutput {
  betId: string;
  roundId: string;
  playerId: string;
  reason: string;
}

/**
 * Cancel Bet Use Case - Application Layer
 *
 * Cancels a bet after wallet debit failure.
 * Transitions the bet from PENDING to CANCELLED state.
 * Emits BetCancelledEvent for WebSocket notification to clients.
 *
 * Now uses BetRepository directly for better concurrency.
 */
@Injectable()
export class CancelBetUseCase implements IUseCase<CancelBetInput, CancelBetOutput> {
  private readonly logger = new Logger(CancelBetUseCase.name);

  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly gamesGateway: GamesGateway,
  ) {}

  async execute(input: CancelBetInput): Promise<CancelBetOutput> {
    // Find bet directly by player and round
    const bet = await this.betRepository.findByPlayerAndRound(
      input.playerId,
      input.roundId,
    );

    if (!bet) {
      throw new BetNotFoundError();
    }

    // Cancel the bet (PENDING → CANCELLED)
    bet.cancel(input.reason);

    // Save bet state change
    await this.betRepository.update(bet);

    // Emit event for WebSocket notification
    const event = createBetCancelledEvent(
      input.roundId,
      input.betId,
      input.playerId,
      bet.getAmount().toCents(),
      input.reason,
      1, // version for the event
    );
    await this.eventPublisher.publishBatch([event]);

    // Broadcast via WebSocket (fire-and-forget, non-blocking)
    try {
      this.gamesGateway.broadcastBetCancelled(
        input.roundId,
        input.betId,
        input.playerId,
        bet.getAmount().toCents(),
        input.reason,
      );
    } catch (error) {
      this.logger.error('Failed to broadcast bet cancelled event', error);
    }

    return {
      betId: input.betId,
      roundId: input.roundId,
      playerId: input.playerId,
      reason: input.reason,
    };
  }
}
