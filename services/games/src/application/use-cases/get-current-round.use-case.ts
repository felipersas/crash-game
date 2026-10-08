import { Inject, Injectable } from '@nestjs/common';
import type { Bet, BetStatus } from '@/domain/entities/bet.entity';
import type { Round, RoundStatus } from '@/domain/entities/round.entity';
import { RoundNotFoundError } from '@/domain/errors/domain.errors';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IRoundStateProvider } from '@/application/interfaces/round-state-provider';
import type { IUseCase } from '@/application/interfaces/use-case';
import { ROUND_REPOSITORY, ROUND_STATE_PROVIDER } from '@/application/di.tokens';

export interface GetCurrentRoundInput {
  includeBets?: boolean;
}

export interface BetOutput {
  id: string;
  playerId: string;
  playerName: string;
  amountCents: bigint;
  status: BetStatus;
  cashOutMultiplier: number | null;
  cashOutAmountCents: bigint | null;
  cashedOutAt: Date | null;
  autoCashOutMultiplier: number | null;
}

export interface GetCurrentRoundOutput {
  roundId: string;
  status: RoundStatus;
  /** Never revealed while the round is in progress. */
  crashPoint: null;
  seedHash: string;
  currentMultiplier: number;
  bettingEndTime: Date | null;
  startedAt: Date | null;
  crashedAt: Date | null;
  bets: BetOutput[];
}

@Injectable()
export class GetCurrentRoundUseCase implements IUseCase<
  GetCurrentRoundInput,
  GetCurrentRoundOutput
> {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(ROUND_STATE_PROVIDER) private readonly roundStateProvider: IRoundStateProvider,
  ) {}

  async execute(input: GetCurrentRoundInput = {}): Promise<GetCurrentRoundOutput> {
    const round = await this.roundRepository.findCurrentRound();
    if (!round) {
      throw new RoundNotFoundError();
    }

    return {
      roundId: round.id,
      status: round.getStatus(),
      crashPoint: null,
      seedHash: round.getSeedHash(),
      currentMultiplier: this.liveMultiplier(round),
      bettingEndTime: round.getBettingEndTime(),
      startedAt: round.getStartedAt(),
      crashedAt: round.getCrashedAt(),
      bets: input.includeBets ? round.getBets().map(toBetOutput) : [],
    };
  }

  /** Persisted rounds don't track the multiplier; the live instance does. */
  private liveMultiplier(round: Round): number {
    const liveRound = this.roundStateProvider.getCurrentRound();
    return liveRound?.id === round.id
      ? liveRound.getCurrentMultiplier()
      : round.getCurrentMultiplier();
  }
}

function toBetOutput(bet: Bet): BetOutput {
  return {
    id: bet.id,
    playerId: bet.playerId,
    playerName: bet.playerName,
    amountCents: bet.getAmount().toCents(),
    status: bet.getStatus(),
    cashOutMultiplier: bet.getCashOutMultiplier()?.getValue() ?? null,
    cashOutAmountCents: bet.getCashOutAmount()?.toCents() ?? null,
    cashedOutAt: bet.getCashedOutAt(),
    autoCashOutMultiplier: bet.getAutoCashOutMultiplier(),
  };
}
