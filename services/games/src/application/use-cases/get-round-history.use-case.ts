import { Inject, Injectable } from '@nestjs/common';
import { type Round } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IUseCase } from '../interfaces/use-case';
import { ROUND_REPOSITORY } from '@/application/di.tokens';
import {
  computePagination,
  buildPaginationMeta,
  type PaginationMeta,
} from '../shared/pagination.util';

export { type PaginationMeta };

export interface GetRoundHistoryInput {
  page?: number;
  limit?: number;
}

export interface RoundSummaryOutput {
  roundId: string;
  crashPoint: number | null;
  status: string;
  startedAt: Date | null;
  crashedAt: Date | null;
  totalBets: number;
  totalWageredCents: number;
}

export interface GetRoundHistoryOutput {
  data: RoundSummaryOutput[];
  meta: PaginationMeta;
}

@Injectable()
export class GetRoundHistoryUseCase implements IUseCase<
  GetRoundHistoryInput,
  GetRoundHistoryOutput
> {
  constructor(@Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository) {}

  async execute(input: GetRoundHistoryInput = {}): Promise<GetRoundHistoryOutput> {
    const { page, limit, offset } = computePagination(input);

    const [rounds, total] = await Promise.all([
      this.roundRepository.findHistory(limit, offset),
      this.roundRepository.findHistoryCount(),
    ]);

    return {
      data: rounds.map(this.mapRoundToSummary),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  private mapRoundToSummary(round: Round): RoundSummaryOutput {
    const bets = round.getBets();
    const totalWageredCents = bets.reduce((sum, bet) => sum + Number(bet.getAmount().toCents()), 0);

    return {
      roundId: round.id,
      crashPoint: round.getCrashPoint(),
      status: round.getStatus(),
      startedAt: round.getStartedAt(),
      crashedAt: round.getCrashedAt(),
      totalBets: bets.length,
      totalWageredCents,
    };
  }
}
