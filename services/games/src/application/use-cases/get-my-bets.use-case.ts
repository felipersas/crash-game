import { Inject, Injectable } from '@nestjs/common';
import { Pagination, type PaginationMeta, type PlayerId } from '@crash/domain';
import type { Bet, BetStatus } from '@/domain/entities/bet.entity';
import type { IBetRepository, PlayerBetsSummary } from '@/application/interfaces/bet.repository';
import type { IUseCase } from '@/application/interfaces/use-case';
import { BET_REPOSITORY } from '@/application/di.tokens';

export interface GetMyBetsInput {
  playerId: PlayerId;
  page?: number;
  limit?: number;
}

export interface MyBetOutput {
  id: string;
  roundId: string;
  amountCents: bigint;
  cashOutMultiplier: number | null;
  payoutCents: bigint | null;
  profitCents: bigint;
  status: BetStatus;
  cashedOutAt: Date | null;
  placedAt: Date;
}

export interface GetMyBetsOutput {
  data: MyBetOutput[];
  meta: PaginationMeta;
  summary: PlayerBetsSummary;
}

@Injectable()
export class GetMyBetsUseCase implements IUseCase<GetMyBetsInput, GetMyBetsOutput> {
  constructor(@Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository) {}

  async execute(input: GetMyBetsInput): Promise<GetMyBetsOutput> {
    const { page, limit, offset } = Pagination.compute(input);

    const [bets, total, summary] = await Promise.all([
      this.betRepository.findByPlayerPaginated(input.playerId, limit, offset),
      this.betRepository.countByPlayer(input.playerId),
      this.betRepository.getSummaryByPlayer(input.playerId),
    ]);

    return {
      data: bets.map(toMyBetOutput),
      meta: Pagination.buildMeta(page, limit, total),
      summary,
    };
  }
}

function toMyBetOutput(bet: Bet): MyBetOutput {
  return {
    id: bet.id,
    roundId: bet.roundId,
    amountCents: bet.getAmount().toCents(),
    cashOutMultiplier: bet.getCashOutMultiplier()?.getValue() ?? null,
    payoutCents: bet.getCashOutAmount()?.toCents() ?? null,
    profitCents: bet.getProfitCents(),
    status: bet.getStatus(),
    cashedOutAt: bet.getCashedOutAt(),
    placedAt: bet.getCreatedAt(),
  };
}
