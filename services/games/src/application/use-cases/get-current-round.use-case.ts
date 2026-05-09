import { Inject, Injectable } from '@nestjs/common';
import { Bet } from '@/domain/entities/bet.entity';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IUseCase } from '../interfaces/use-case';
import { ROUND_REPOSITORY } from '@/infrastructure/di/tokens';
import { RoundNotFoundError } from '@/domain/errors/domain.errors';

export interface GetCurrentRoundInput {
  includeBets?: boolean;
}

export interface BetOutput {
  id: string;
  playerId: string;
  amountCents: bigint;
  amountDecimal: string;
  status: string;
  cashOutMultiplier: number | null;
  cashOutAmountCents: bigint | null;
  cashedOutAt: Date | null;
}

export interface GetCurrentRoundOutput {
  roundId: string;
  status: string;
  crashPoint: number | null;
  seedHash: string;
  currentMultiplier: number;
  bettingEndTime: Date | null;
  startedAt: Date | null;
  crashedAt: Date | null;
  bets: BetOutput[];
}

@Injectable()
export class GetCurrentRoundUseCase implements IUseCase<GetCurrentRoundInput, GetCurrentRoundOutput> {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
  ) {}

  async execute(input: GetCurrentRoundInput = {}): Promise<GetCurrentRoundOutput> {
    const round = await this.roundRepository.findCurrentRound();

    if (!round) {
      throw new RoundNotFoundError();
    }

    const bets = input.includeBets ? round.getBets() : [];

    return {
      roundId: round.id,
      status: round.getStatus(),
      crashPoint: round.getCrashPoint(),
      seedHash: round.getSeedHash(),
      currentMultiplier: round.getCurrentMultiplier(),
      bettingEndTime: round.getBettingEndTime(),
      startedAt: round.getStartedAt(),
      crashedAt: round.getCrashedAt(),
      bets: bets.map(this.mapBetToOutput),
    };
  }

  private mapBetToOutput(bet: Bet): BetOutput {
    return {
      id: bet.id,
      playerId: bet.playerId,
      amountCents: bet.getAmount().toCents(),
      amountDecimal: bet.getAmount().toDecimal(),
      status: bet.getStatus(),
      cashOutMultiplier: bet.getCashOutMultiplier()?.getValue() || null,
      cashOutAmountCents: bet.getCashOutAmount()?.toCents() || null,
      cashedOutAt: bet.getCashedOutAt(),
    };
  }
}
