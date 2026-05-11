/**
 * Wallet Repository Implementation - Infrastructure Layer
 *
 * Prisma-based implementation of IWalletRepository.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Wallet } from '@/domain/entities/wallet.entity';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import { OptimisticLockError } from '@/domain/errors/domain.errors';
import type { PrismaTransaction } from '@/infrastructure/messaging/outbox-writer';

@Injectable()
export class PrismaWalletRepository implements IWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPlayerId(playerId: string): Promise<Wallet | null> {
    const record = await this.prisma.wallet.findUnique({
      where: { playerId },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findById(id: string): Promise<Wallet | null> {
    const record = await this.prisma.wallet.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async save(wallet: Wallet, tx?: PrismaTransaction): Promise<void> {
    const data = wallet.toPersistence();
    const client = tx ?? this.prisma;

    try {
      await client.wallet.update({
        where: {
          id: data.id,
          version: data.version - 1, // Optimistic locking
        },
        data: {
          balanceCents: data.balance,
          version: data.version,
        },
      });
    } catch (error: unknown) {
      // Prisma P2025 = record not found (version WHERE matched zero rows)
      if (
        error instanceof Error &&
        'code' in error &&
        (error as any).code === 'P2025'
      ) {
        throw new OptimisticLockError(data.id, data.version, data.version - 1);
      }
      throw error;
    }
  }

  async existsByPlayerId(playerId: string): Promise<boolean> {
    const count = await this.prisma.wallet.count({
      where: { playerId },
    });
    return count > 0;
  }

  /**
   * Create a new wallet in the database.
   * Used internally by CreateWalletUseCase.
   */
  async create(wallet: Wallet, tx?: PrismaTransaction): Promise<void> {
    const data = wallet.toPersistence();
    const client = tx ?? this.prisma;
    await client.wallet.create({
      data: {
        id: data.id,
        playerId: data.playerId,
        balanceCents: data.balance,
        version: data.version,
      },
    });
  }

  private toDomain(record: {
    id: string;
    playerId: string;
    balanceCents: bigint;
    version: number;
  }): Wallet {
    return Wallet.restore(record.id, record.playerId, record.balanceCents, record.version);
  }
}
