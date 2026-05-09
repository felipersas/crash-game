import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import { Bet, BetStatus } from '@/domain/entities/bet.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import { OptimisticLockError } from '@/domain/errors/domain.errors';

@Injectable()
export class PrismaRoundRepository implements IRoundRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrentRound(): Promise<Round | null> {
    const record = await this.prisma.round.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { bets: true },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async findById(id: string): Promise<Round | null> {
    const record = await this.prisma.round.findUnique({
      where: { id },
      include: { bets: true },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async save(round: Round): Promise<void> {
    const data = round.toPersistence();

    try {
      await this.prisma.round.update({
        where: {
          id: data.id,
          version: data.version - 1, // Optimistic locking
        },
        data: {
          seed: data.seed,
          status: data.status,
          crashPoint: data.crashPoint,
          startedAt: data.startedAt,
          crashedAt: data.crashedAt,
          version: data.version,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'P2025') {
        throw new OptimisticLockError();
      }
      throw error;
    }
  }

  async create(round: Round): Promise<void> {
    const data = round.toPersistence();
    await this.prisma.round.create({ data });
  }

  async findHistory(limit: number, offset: number): Promise<Round[]> {
    const records = await this.prisma.round.findMany({
      where: { status: RoundStatus.CRASHED },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { bets: true },
    });

    return records.map((record: any) => this.toDomain(record));
  }

  async findHistoryCount(): Promise<number> {
    return this.prisma.round.count({
      where: { status: RoundStatus.CRASHED },
    });
  }

  private toDomain(record: any): Round {
    const bets = record.bets?.map((b: any) => this.betToDomain(b)) || [];

    return Round.restore(
      record.id,
      record.seed,
      record.seedHash,
      record.nextSeed,
      record.status as RoundStatus,
      record.crashPoint,
      record.bettingEndTime,
      record.startedAt,
      record.crashedAt,
      bets,
      record.version,
      DEFAULT_ROUND_CONFIG,
    );
  }

  private betToDomain(record: any): Bet {
    return Bet.restore(
      record.id,
      record.roundId,
      record.playerId,
      BigInt(record.amountCents),
      record.status as BetStatus,
      record.cashOutMultiplier,
      record.cashOutAmount ? BigInt(record.cashOutAmount) : null,
      record.cashedOutAt,
      record.createdAt,
    );
  }
}
