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
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        bets: true,
      },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findById(id: string): Promise<Round | null> {
    const record = await this.prisma.round.findUnique({
      where: { id },
      include: {
        bets: true,
      },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async save(round: Round): Promise<void> {
    const data = this.toPersistence(round);

    try {
      await this.prisma.round.update({
        where: {
          id: data.id,
          version: data.version - 1, // Optimistic locking
        },
        data: {
          seed: data.seed, // Now reveals seed after crash
          status: data.status,
          crashPoint: data.crashPoint,
          startedAt: data.startedAt,
          crashedAt: data.crashedAt,
          version: data.version,
        },
      });
    } catch (error: unknown) {
      // Prisma throws a P2025 error when the record is not found (version mismatch)
      if (error instanceof Error && 'code' in error && error.code === 'P2025') {
        throw new OptimisticLockError(data.id, data.version - 1);
      }
      throw error;
    }
  }

  async create(round: Round): Promise<void> {
    const data = this.toPersistence(round);
    await this.prisma.round.create({
      data: {
        id: data.id,
        seed: data.seed, // NULL until crash (security)
        seedHash: data.seedHash,
        nextSeed: data.nextSeed,
        status: data.status,
        crashPoint: data.crashPoint,
        bettingEndTime: data.bettingEndTime,
        startedAt: data.startedAt,
        crashedAt: data.crashedAt,
        version: data.version,
      },
    });
  }

  async findHistory(limit: number, offset: number): Promise<Round[]> {
    const records = await this.prisma.round.findMany({
      where: {
        status: RoundStatus.CRASHED,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
      include: {
        bets: true,
      },
    });

    return records.map((record: any) => this.toDomain(record));
  }

  async findBetById(betId: string): Promise<Bet | null> {
    const record = await this.prisma.bet.findUnique({
      where: { id: betId },
    });

    if (!record) {
      return null;
    }

    return this.betToDomain(record);
  }

  async findBetsByPlayer(playerId: string, limit?: number): Promise<Bet[]> {
    const records = await this.prisma.bet.findMany({
      where: { playerId },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return records.map((record: any) => this.betToDomain(record));
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
    );
  }

  private toPersistence(round: Round) {
    return {
      id: round.id,
      seed: round['seedChain'].getSeed(),
      seedHash: round['seedChain'].getCurrentSeedHash(),
      nextSeed: null,
      status: round.getStatus(),
      crashPoint: round.getCrashPoint(),
      bettingEndTime: round.getBettingEndTime(),
      startedAt: round.getStartedAt(),
      crashedAt: round.getCrashedAt(),
      version: round.getVersion(),
    };
  }
}
