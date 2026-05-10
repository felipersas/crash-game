import { Inject, Injectable } from '@nestjs/common';
import { BetStatus } from '@/domain/entities/bet.entity';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import { BET_REPOSITORY } from '@/infrastructure/di/tokens';
import {
  computePagination,
  buildPaginationMeta,
  type PaginationMeta,
} from '../shared/pagination.util';

export interface GetMyBetsInput {
  playerId: string;
  page?: number;
  limit?: number;
}

export interface MyBetOutput {
  id: string;
  roundId: string;
  amountCents: number;
  cashOutMultiplier: number | null;
  payoutCents: number | null;
  profitCents: number;
  status: string;
  cashedOutAt: Date | null;
  placedAt: Date;
}

export interface BetsSummary {
  totalWageredCents: number;
  wins: number;
  losses: number;
  profitCents: number;
}

export interface GetMyBetsOutput {
  data: MyBetOutput[];
  meta: PaginationMeta;
  summary: BetsSummary;
}

@Injectable()
export class GetMyBetsUseCase implements IUseCase<GetMyBetsInput, GetMyBetsOutput> {
  constructor(@Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository) {}

  async execute(input: GetMyBetsInput): Promise<GetMyBetsOutput> {
    const { page, limit, offset } = computePagination(input);

    const [bets, total] = await Promise.all([
      this.betRepository.findByPlayerPaginated(input.playerId, limit, offset),
      this.betRepository.countByPlayer(input.playerId),
    ]);

    const data = bets.map((bet) => {
      const amountCents = Number(bet.getAmount().toCents());
      const payoutCents = bet.getCashOutAmount()?.toCents()
        ? Number(bet.getCashOutAmount()!.toCents())
        : null;
      const profitCents = this.calculateProfit(bet.getStatus(), amountCents, payoutCents);

      return {
        id: bet.id,
        roundId: bet.roundId,
        amountCents,
        cashOutMultiplier: bet.getCashOutMultiplier()?.getValue() ?? null,
        payoutCents,
        profitCents,
        status: bet.getStatus(),
        cashedOutAt: bet.getCashedOutAt(),
        placedAt: bet.getCreatedAt(),
      };
    });

    const summary = await this.betRepository.getSummaryByPlayer(input.playerId);

    return {
      data,
      meta: buildPaginationMeta(page, limit, total),
      summary,
    };
  }

  private calculateProfit(
    status: BetStatus,
    amountCents: number,
    payoutCents: number | null,
  ): number {
    if (status === BetStatus.CASHED_OUT && payoutCents !== null) {
      return payoutCents - amountCents;
    }
    if (status === BetStatus.LOST) {
      return -amountCents;
    }
    return 0;
  }
}
