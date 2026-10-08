import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RoundId } from '@crash/domain';
import { Round, RoundStatus } from '@/domain/entities/round.entity';
import { OptimisticLockError } from '@/domain/errors/domain.errors';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { TransactionContext } from '@/application/interfaces/unit-of-work';
import { PrismaService } from './prisma.service';
import { prismaClient } from './transaction-context';
import { betToDomain } from './bet.mapper';

type RoundRow = Prisma.RoundGetPayload<{ include: { bets: true } }>;

@Injectable()
export class PrismaRoundRepository implements IRoundRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrentRound(): Promise<Round | null> {
    const row = await this.prisma.round.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { bets: true },
    });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: RoundId): Promise<Round | null> {
    const row = await this.prisma.round.findUnique({ where: { id }, include: { bets: true } });
    return row ? this.toDomain(row) : null;
  }

  async save(round: Round, tx?: TransactionContext): Promise<void> {
    const data = round.toPersistence();

    try {
      await prismaClient(this.prisma, tx).round.update({
        // Optimistic locking: only update the version this instance was loaded at
        where: { id: data.id, version: data.version - 1 },
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new OptimisticLockError();
      }
      throw error;
    }
  }

  async create(round: Round, tx?: TransactionContext): Promise<void> {
    await prismaClient(this.prisma, tx).round.create({ data: round.toPersistence() });
  }

  async findHistory(limit: number, offset: number): Promise<Round[]> {
    const rows = await this.prisma.round.findMany({
      where: { status: RoundStatus.CRASHED },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { bets: true },
    });
    return rows.map((row) => this.toDomain(row));
  }

  async countHistory(): Promise<number> {
    return this.prisma.round.count({ where: { status: RoundStatus.CRASHED } });
  }

  private toDomain(row: RoundRow): Round {
    if (!row.seed) {
      throw new Error(`Round ${row.id} was persisted without a seed`);
    }

    return Round.restore(
      {
        id: RoundId.from(row.id),
        seed: row.seed,
        seedHash: row.seedHash,
        status: row.status as RoundStatus,
        crashPoint: row.crashPoint,
        bettingEndTime: row.bettingEndTime,
        startedAt: row.startedAt,
        crashedAt: row.crashedAt,
        version: row.version,
      },
      row.bets.map(betToDomain),
    );
  }
}
