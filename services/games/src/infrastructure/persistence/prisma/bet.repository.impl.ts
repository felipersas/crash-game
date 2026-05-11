import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Bet, BetStatus } from '@/domain/entities/bet.entity';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import type { Bet as BetRow } from '@prisma/client';

/**
 * Prisma-based implementation of Bet Repository.
 *
 * Manages Bet persistence independently from Round,
 * allowing for high-concurrency betting operations.
 */
@Injectable()
export class PrismaBetRepository implements IBetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(bet: Bet): Promise<void> {
    const data = bet.toPersistence();
    await this.prisma.bet.create({
      data: {
        ...data,
        // Domain enum → Prisma enum (same string values)
        status: data.status as any,
      },
    });
  }

  async update(bet: Bet): Promise<void> {
    const data = bet.toPersistence();
    await this.prisma.bet.update({
      where: { id: data.id },
      data: {
        status: data.status as any,
        cashOutMultiplier: data.cashOutMultiplier,
        cashOutAmount: data.cashOutAmount,
        cashedOutAt: data.cashedOutAt,
      },
    });
  }

  async findById(betId: string): Promise<Bet | null> {
    const record = await this.prisma.bet.findUnique({
      where: { id: betId },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async findByRound(roundId: string): Promise<Bet[]> {
    const records = await this.prisma.bet.findMany({
      where: { roundId },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findByPlayerAndRound(playerId: string, roundId: string): Promise<Bet | null> {
    const record = await this.prisma.bet.findFirst({
      where: { playerId, roundId },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async findByPlayer(playerId: string, limit?: number): Promise<Bet[]> {
    const records = await this.prisma.bet.findMany({
      where: { playerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return records.map((record) => this.toDomain(record));
  }

  async findByRoundAndStatus(roundId: string, status: BetStatus): Promise<Bet[]> {
    const records = await this.prisma.bet.findMany({
      where: {
        roundId,
        status: status as any,
      },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findByPlayerPaginated(playerId: string, limit: number, offset: number): Promise<Bet[]> {
    const records = await this.prisma.bet.findMany({
      where: { playerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return records.map((record) => this.toDomain(record));
  }

  async countByPlayer(playerId: string): Promise<number> {
    return this.prisma.bet.count({ where: { playerId } });
  }

  async getSummaryByPlayer(playerId: string): Promise<{
    totalWageredCents: number;
    wins: number;
    losses: number;
    profitCents: number;
  }> {
    // Single query, single table scan — all aggregation in DB
    // $queryRaw tagged template is parameterized: safe from SQL injection
    const [row] = await this.prisma.$queryRaw<
      Array<{
        total_wagered_cents: bigint;
        wins: bigint;
        losses: bigint;
        total_payout_cents: bigint;
        cashed_out_wagered: bigint;
        lost_wagered_cents: bigint;
      }>
    >`
      SELECT
        COALESCE(SUM(amount_cents), 0)              AS total_wagered_cents,
        COUNT(CASE WHEN status = 'CASHED_OUT' THEN 1 END) AS wins,
        COUNT(CASE WHEN status = 'LOST' THEN 1 END)      AS losses,
        COALESCE(SUM(CASE WHEN status = 'CASHED_OUT' THEN cash_out_amount END), 0) AS total_payout_cents,
        COALESCE(SUM(CASE WHEN status = 'CASHED_OUT' THEN amount_cents END), 0)    AS cashed_out_wagered,
        COALESCE(SUM(CASE WHEN status = 'LOST' THEN amount_cents END), 0)           AS lost_wagered_cents
      FROM bets
      WHERE player_id = ${playerId}
    `;

    const totalWageredCents = Number(row.total_wagered_cents);
    const totalPayoutCents = Number(row.total_payout_cents);
    const cashedOutWagered = Number(row.cashed_out_wagered);
    const lostWageredCents = Number(row.lost_wagered_cents);

    return {
      totalWageredCents,
      wins: Number(row.wins),
      losses: Number(row.losses),
      profitCents: totalPayoutCents - cashedOutWagered - lostWageredCents,
    };
  }

  async findStalePendingBets(olderThan: Date): Promise<Bet[]> {
    const records = await this.prisma.bet.findMany({
      where: {
        status: BetStatus.PENDING,
        createdAt: { lt: olderThan },
      },
    });

    return records.map((record) => this.toDomain(record));
  }

  private toDomain(record: BetRow): Bet {
    return Bet.restore(
      record.id,
      record.roundId,
      record.playerId,
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
