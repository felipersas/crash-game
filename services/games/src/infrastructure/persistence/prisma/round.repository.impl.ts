import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import { Bet, type BetStatus } from '@/domain/entities/bet.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import { OptimisticLockError } from '@/domain/errors/domain.errors';
import type { Round as RoundRow } from '@prisma/client';
import type { Bet as BetRow } from '@prisma/client';
import type { PrismaTransaction } from '@/infrastructure/messaging/outbox-writer';
import {
  type RoundId,
  RoundId as RoundIdVO,
  BetId as BetIdVO,
  PlayerId as PlayerIdVO,
} from '@crash/domain';

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

  async findById(id: RoundId): Promise<Round | null> {
    const record = await this.prisma.round.findUnique({
      where: { id },
      include: { bets: true },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async save(round: Round, tx?: PrismaTransaction): Promise<void> {
    const client = tx ?? this.prisma;
    const data = round.toPersistence();

    try {
      await client.round.update({
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

  async create(round: Round, tx?: PrismaTransaction): Promise<void> {
    const client = tx ?? this.prisma;
    const data = round.toPersistence();
    await client.round.create({ data });
  }

  async findHistory(limit: number, offset: number): Promise<Round[]> {
    const records = await this.prisma.round.findMany({
      where: { status: RoundStatus.CRASHED },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { bets: true },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findHistoryCount(): Promise<number> {
    return this.prisma.round.count({
      where: { status: RoundStatus.CRASHED },
    });
  }

  private toDomain(record: RoundRow): Round {
    const bets = record.bets?.map((b) => this.betToDomain(b)) || [];

    return Round.restore(
      RoundIdVO.from(record.id),
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

  private betToDomain(record: BetRow): Bet {
    return Bet.restore(
      BetIdVO.from(record.id),
      RoundIdVO.from(record.roundId),
      PlayerIdVO.from(record.playerId),
      record.playerName,
      BigInt(record.amountCents),
      record.status as BetStatus,
      record.cashOutMultiplier,
      record.cashOutAmount ? BigInt(record.cashOutAmount) : null,
      record.cashedOutAt,
      record.createdAt,
    );
  }
}
