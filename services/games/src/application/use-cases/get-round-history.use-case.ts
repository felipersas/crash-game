import { Inject, Injectable } from '@nestjs/common';
import { Pagination, type PaginationMeta } from '@crash/domain';
import type { Round, RoundStatus } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IUseCase } from '@/application/interfaces/use-case';
import { ROUND_REPOSITORY } from '@/application/di.tokens';

export interface GetRoundHistoryInput {
  page?: number;
  limit?: number;
}

export interface RoundSummaryOutput {
  roundId: string;
  crashPoint: number | null;
  status: RoundStatus;
  startedAt: Date | null;
  crashedAt: Date | null;
  totalBets: number;
  totalWageredCents: bigint;
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
    const { page, limit, offset } = Pagination.compute(input);

    const [rounds, total] = await Promise.all([
      this.roundRepository.findHistory(limit, offset),
      this.roundRepository.countHistory(),
    ]);

    return {
      data: rounds.map(toRoundSummary),
      meta: Pagination.buildMeta(page, limit, total),
    };
  }
}

function toRoundSummary(round: Round): RoundSummaryOutput {
  return {
    roundId: round.id,
    crashPoint: round.getCrashPoint(),
    status: round.getStatus(),
    startedAt: round.getStartedAt(),
    crashedAt: round.getCrashedAt(),
    totalBets: round.getBets().filter((bet) => !bet.isCancelled()).length,
    totalWageredCents: round.getTotalWagered().toCents(),
  };
}
