import { Inject, Injectable } from '@nestjs/common';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import { BET_REPOSITORY } from '@/infrastructure/di/tokens';
import { BetNotFoundError } from '@/domain/errors/domain.errors';

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
 *
 * Now uses BetRepository directly for better concurrency.
 */
@Injectable()
export class ConfirmBetUseCase implements IUseCase<ConfirmBetInput, ConfirmBetOutput> {
  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
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

    return {
      betId: input.betId,
      roundId: input.roundId,
      playerId: input.playerId,
    };
  }
}
