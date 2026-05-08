import { Inject, Injectable } from '@nestjs/common';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IUseCase } from '../interfaces/use-case';
import { ROUND_REPOSITORY } from '@/infrastructure/di/tokens';

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
 */
@Injectable()
export class ConfirmBetUseCase implements IUseCase<ConfirmBetInput, ConfirmBetOutput> {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
  ) {}

  async execute(input: ConfirmBetInput): Promise<ConfirmBetOutput> {
    const round = await this.roundRepository.findById(input.roundId);

    if (!round) {
      throw new Error(`Round ${input.roundId} not found for bet ${input.betId}`);
    }

    const bet = round.getBetByPlayer(input.playerId);

    if (!bet) {
      throw new Error(`Bet ${input.betId} not found in round ${input.roundId}`);
    }

    // Confirm the bet (PENDING → ACTIVE)
    bet.confirm();

    // Save and emit events
    await this.roundRepository.save(round);

    return {
      betId: input.betId,
      roundId: input.roundId,
      playerId: input.playerId,
    };
  }
}
