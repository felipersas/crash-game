import { Inject, Injectable } from '@nestjs/common';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IUseCase } from '../interfaces/use-case';
import { ROUND_REPOSITORY } from '@/infrastructure/di/tokens';

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
 */
@Injectable()
export class CancelBetUseCase implements IUseCase<CancelBetInput, CancelBetOutput> {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
  ) {}

  async execute(input: CancelBetInput): Promise<CancelBetOutput> {
    const round = await this.roundRepository.findById(input.roundId);

    if (!round) {
      throw new Error(`Round ${input.roundId} not found for bet ${input.betId}`);
    }

    const bet = round.getBetByPlayer(input.playerId);

    if (!bet) {
      throw new Error(`Bet ${input.betId} not found in round ${input.roundId}`);
    }

    // Cancel the bet (PENDING → CANCELLED)
    bet.cancel(input.reason);

    // Save and emit events
    await this.roundRepository.save(round);

    return {
      betId: input.betId,
      roundId: input.roundId,
      playerId: input.playerId,
      reason: input.reason,
    };
  }
}
