import { Inject, Injectable } from '@nestjs/common';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import { BET_REPOSITORY } from '@/infrastructure/di/tokens';
import { BetNotFoundError } from '@/domain/errors/domain.errors';
import { BetStatus } from '@/domain/entities/bet.entity';

export interface GetBetStatusInput {
  betId: string;
}

export interface BetStatusOutput {
  betId: string;
  roundId: string;
  playerId: string;
  amountCents: bigint;
  status: BetStatus;
  cashOutMultiplier: number | null;
  payoutCents: bigint | null;
  cashedOutAt: Date | null;
  cancelReason: string | null;
}

/**
 * Get Bet Status Use Case - Application Layer
 *
 * Retrieves the current status of a bet for polling.
 * Used by clients to check if a PENDING bet has been confirmed or cancelled.
 */
@Injectable()
export class GetBetStatusUseCase implements IUseCase<GetBetStatusInput, BetStatusOutput> {
  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
  ) {}

  async execute(input: GetBetStatusInput): Promise<BetStatusOutput> {
    const bet = await this.betRepository.findById(input.betId);

    if (!bet) {
      throw new BetNotFoundError();
    }

    return {
      betId: bet.id,
      roundId: bet.roundId,
      playerId: bet.playerId,
      amountCents: bet.getAmount().toCents(),
      status: bet.getStatus(),
      cashOutMultiplier: bet.getCashOutMultiplier()?.getValue() ?? null,
      payoutCents: bet.getCashOutAmount()?.toCents() ?? null,
      cashedOutAt: bet.getCashedOutAt(),
      cancelReason: bet.getCancelReason(),
    };
  }
}
