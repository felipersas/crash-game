import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import { Bet, BetStatus } from '@/domain/entities/bet.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';

@Injectable()
export class PrismaRoundRepository implements IRoundRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrentRound(): Promise<Round | null> {
    // Find a round that is still in BETTING or ACTIVE state
    const record = await this.prisma.round.findFirst({
      where: {
        status: {
          in: [RoundStatus.BETTING, RoundStatus.ACTIVE],
        },
      },
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
          status: data.status,
          crashPoint: data.crashPoint,
          startedAt: data.startedAt,
          crashedAt: data.crashedAt,
          version: data.version,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error) {
        throw new Error(`Optimistic lock failed for round ${data.id}`);
      }
      throw error;
    }
  }

  async create(round: Round): Promise<void> {
    const data = this.toPersistence(round);
    await this.prisma.round.create({
      data: {
        id: data.id,
        seed: data.seed,
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
      seedHash: round['seedChain'].getHash(),
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
