import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { Bet, BetStatus } from "@/domain/entities/bet.entity";
import type { IBetRepository } from "@/application/interfaces/bet.repository";

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
      orderBy: { createdAt: "asc" },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findByPlayerAndRound(playerId: string, roundId: string): Promise<Bet | null> {
    const record = await this.prisma.bet.findFirst({
      where: { playerId, roundId },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async findByPlayer(playerId: string, limit?: number): Promise<Bet[]> {
    const records = await this.prisma.bet.findMany({
      where: { playerId },
      orderBy: { createdAt: "desc" },
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
      orderBy: { createdAt: "asc" },
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

  private toDomain(record: any): Bet {
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
