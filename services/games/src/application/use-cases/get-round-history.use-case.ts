import { Inject, Injectable } from '@nestjs/common';
import { Round } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IUseCase } from '../interfaces/use-case';

export interface GetRoundHistoryInput {
  limit?: number;
  offset?: number;
}

export interface RoundSummaryOutput {
  roundId: string;
  crashPoint: number | null;
  status: string;
  startedAt: Date | null;
  crashedAt: Date | null;
  totalBets: number;
}

export interface GetRoundHistoryOutput {
  rounds: RoundSummaryOutput[];
  total: number;
}

@Injectable()
export class GetRoundHistoryUseCase implements IUseCase<GetRoundHistoryInput, GetRoundHistoryOutput> {
  constructor(
    @Inject('ROUND_REPOSITORY') private readonly roundRepository: IRoundRepository,
  ) {}

  async execute(input: GetRoundHistoryInput = {}): Promise<GetRoundHistoryOutput> {
    const limit = input.limit || 20;
    const offset = input.offset || 0;

    const rounds = await this.roundRepository.findHistory(limit, offset);

    return {
      rounds: rounds.map(this.mapRoundToSummary),
      total: rounds.length,
    };
  }

  private mapRoundToSummary(round: Round): RoundSummaryOutput {
    const bets = round.getBets();

    return {
      roundId: round.id,
      crashPoint: round.getCrashPoint(),
      status: round.getStatus(),
      startedAt: round.getStartedAt(),
      crashedAt: round.getCrashedAt(),
      totalBets: bets.length,
    };
  }
}
