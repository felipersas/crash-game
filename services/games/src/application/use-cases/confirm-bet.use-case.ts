import { Inject, Injectable } from '@nestjs/common';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import type { IEventPublisher } from '@crash/messaging';
import { BET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import { BetNotFoundError } from '@/domain/errors/domain.errors';
import { createBetConfirmedEvent } from '@/domain/events/round.events';

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
  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: ConfirmBetInput): Promise<ConfirmBetOutput> {
    // Find bet directly by player and round
    const bet = await this.betRepository.findByPlayerAndRound(
      input.playerId,
      input.roundId,
    );

    if (!bet) {
      throw new BetNotFoundError(input.betId);
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

    return {
      betId: input.betId,
      roundId: input.roundId,
      playerId: input.playerId,
    };
  }
}
