import { Injectable } from '@nestjs/common';
import { Prisma, type Wallet as WalletRow } from '@prisma/client';
import { WalletId, PlayerId } from '@crash/domain';
import { Wallet } from '@/domain/entities/wallet.entity';
import { OptimisticLockError } from '@/domain/errors/domain.errors';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import type { TransactionContext } from '@/application/interfaces/unit-of-work';
import { PrismaService } from './prisma.service';
import { prismaClient } from './transaction-context';

@Injectable()
export class PrismaWalletRepository implements IWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPlayerId(playerId: PlayerId): Promise<Wallet | null> {
    const row = await this.prisma.wallet.findUnique({ where: { playerId } });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: WalletId): Promise<Wallet | null> {
    const row = await this.prisma.wallet.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async save(wallet: Wallet, tx?: TransactionContext): Promise<void> {
    const data = wallet.toPersistence();

    try {
      await prismaClient(this.prisma, tx).wallet.update({
        // Optimistic locking: only update the version this instance was loaded at
        where: { id: data.id, version: data.version - 1 },
        data: { balanceCents: data.balance, version: data.version },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new OptimisticLockError(data.id);
      }
      throw error;
    }
  }

  async create(wallet: Wallet, tx?: TransactionContext): Promise<void> {
    const data = wallet.toPersistence();
    await prismaClient(this.prisma, tx).wallet.create({
      data: {
        id: data.id,
        playerId: data.playerId,
        balanceCents: data.balance,
        version: data.version,
      },
    });
  }

  private toDomain(row: WalletRow): Wallet {
    return Wallet.restore(
      WalletId.from(row.id),
      PlayerId.from(row.playerId),
      row.balanceCents,
      row.version,
    );
  }
}
