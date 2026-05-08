import { Inject, Injectable } from '@nestjs/common';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import { BET_REPOSITORY } from '@/infrastructure/di/tokens';

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
 *
 * Now uses BetRepository directly for better concurrency.
 */
@Injectable()
export class CancelBetUseCase implements IUseCase<CancelBetInput, CancelBetOutput> {
  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
  ) {}

  async execute(input: CancelBetInput): Promise<CancelBetOutput> {
    // Find bet directly by player and round
    const bet = await this.betRepository.findByPlayerAndRound(
      input.playerId,
      input.roundId,
    );

    if (!bet) {
      throw new Error(`Bet ${input.betId} not found in round ${input.roundId}`);
    }

    // Cancel the bet (PENDING → CANCELLED)
    bet.cancel(input.reason);

    // Save bet state change
    await this.betRepository.update(bet);

    return {
      betId: input.betId,
      roundId: input.roundId,
      playerId: input.playerId,
      reason: input.reason,
    };
  }
}
