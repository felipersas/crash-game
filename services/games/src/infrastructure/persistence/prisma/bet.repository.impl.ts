import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BetId, RoundId, PlayerId } from '@crash/domain';
import { BetStatus, type Bet } from '@/domain/entities/bet.entity';
import { DuplicateBetError } from '@/domain/errors/domain.errors';
import type { IBetRepository, PlayerBetsSummary } from '@/application/interfaces/bet.repository';
import type { TransactionContext } from '@/application/interfaces/unit-of-work';
import { PrismaService } from './prisma.service';
import { prismaClient } from './transaction-context';
import { betToDomain, betToRow } from './bet.mapper';

/**
 * Prisma-based implementation of Bet Repository.
 */
@Injectable()
export class PrismaBetRepository implements IBetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(bet: Bet, tx?: TransactionContext): Promise<void> {
    try {
      await prismaClient(this.prisma, tx).bet.create({ data: betToRow(bet.toPersistence()) });
    } catch (error: unknown) {
      // Partial unique index: one live bet per player per round
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateBetError();
      }
      throw error;
    }
  }

  async update(bet: Bet, tx?: TransactionContext): Promise<void> {
    const row = betToRow(bet.toPersistence());
    await prismaClient(this.prisma, tx).bet.update({
      where: { id: row.id },
      data: {
        status: row.status,
        cashOutMultiplier: row.cashOutMultiplier,
        cashOutAmount: row.cashOutAmount,
        cashedOutAt: row.cashedOutAt,
        cancelReason: row.cancelReason,
      },
    });
  }

  async findById(betId: BetId): Promise<Bet | null> {
    const row = await this.prisma.bet.findUnique({ where: { id: betId } });
    return row ? betToDomain(row) : null;
  }

  async findByPlayerAndRound(playerId: PlayerId, roundId: RoundId): Promise<Bet | null> {
    const row = await this.prisma.bet.findFirst({
      where: { playerId, roundId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? betToDomain(row) : null;
  }

  async findByPlayerPaginated(playerId: PlayerId, limit: number, offset: number): Promise<Bet[]> {
    const rows = await this.prisma.bet.findMany({
      where: { playerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    return rows.map(betToDomain);
  }

  async countByPlayer(playerId: PlayerId): Promise<number> {
    return this.prisma.bet.count({ where: { playerId } });
  }

  async getSummaryByPlayer(playerId: PlayerId): Promise<PlayerBetsSummary> {
    // Single parameterized query; all aggregation happens in the database
    const [row] = await this.prisma.$queryRaw<
      Array<{
        total_wagered_cents: bigint;
        wins: bigint;
        losses: bigint;
        profit_cents: bigint;
      }>
    >`
      SELECT
        COALESCE(SUM(amount_cents), 0)::bigint                                     AS total_wagered_cents,
        COUNT(*) FILTER (WHERE status = 'CASHED_OUT')                              AS wins,
        COUNT(*) FILTER (WHERE status = 'LOST')                                    AS losses,
        COALESCE(SUM(CASE
          WHEN status = 'CASHED_OUT' THEN cash_out_amount - amount_cents
          WHEN status = 'LOST'       THEN -amount_cents
        END), 0)::bigint                                                           AS profit_cents
      FROM bets
      WHERE player_id = ${playerId}
    `;

    return {
      totalWageredCents: row.total_wagered_cents,
      wins: Number(row.wins),
      losses: Number(row.losses),
      profitCents: row.profit_cents,
    };
  }

  async findStalePendingBets(olderThan: Date): Promise<Bet[]> {
    const rows = await this.prisma.bet.findMany({
      where: { status: BetStatus.PENDING, createdAt: { lt: olderThan } },
    });
    return rows.map(betToDomain);
  }
}
