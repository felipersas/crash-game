import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import type { IEventPublisher } from '@crash/messaging';
import { BET_REPOSITORY, EVENT_PUBLISHER, GAME_BROADCASTER } from '@/infrastructure/di/tokens';
import { BetNotFoundError } from '@/domain/errors/domain.errors';
import { createBetConfirmedEvent } from '@/domain/events/round.events';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';

export interface ConfirmBetInput {
  roundId: string;
  betId: string;
  playerId: string;
}

export interface ConfirmBetOutput {
  betId: string;
  roundId: string;
  playerId: string;
}

/**
 * Confirm Bet Use Case - Application Layer
 *
 * Confirms a bet after successful wallet debit.
 * Transitions the bet from PENDING to ACTIVE state.
 * Emits BetConfirmedEvent for WebSocket notification to clients.
 *
 * Now uses BetRepository directly for better concurrency.
 */
@Injectable()
export class ConfirmBetUseCase implements IUseCase<ConfirmBetInput, ConfirmBetOutput> {
  private readonly logger = new Logger(ConfirmBetUseCase.name);

  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
  ) {}

  async execute(input: ConfirmBetInput): Promise<ConfirmBetOutput> {
    // Find bet directly by player and round
    const bet = await this.betRepository.findByPlayerAndRound(input.playerId, input.roundId);

    if (!bet) {
      throw new BetNotFoundError();
    }

    // Confirm the bet (PENDING → ACTIVE)
    bet.confirm();

    // Save bet state change
    await this.betRepository.update(bet);

    // Emit event for WebSocket notification
    const event = createBetConfirmedEvent(
      input.roundId,
      input.betId,
      input.playerId,
      bet.getAmount().toCents(),
      1, // version for the event
    );
    await this.eventPublisher.publishBatch([event]);

    // Broadcast via WebSocket (fire-and-forget, non-blocking)
    try {
      this.broadcaster.broadcastBetConfirmed(
        input.roundId,
        input.betId,
        input.playerId,
        bet.getAmount().toCents(),
      );
    } catch (error) {
      this.logger.error('Failed to broadcast bet confirmed event', error);
    }

    return {
      betId: input.betId,
      roundId: input.roundId,
      playerId: input.playerId,
    };
  }
}
