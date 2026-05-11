/**
 * Create Wallet Use Case - Application Layer
 *
 * Handles the creation of a new wallet for a player.
 * Ensures one wallet per player (idempotent).
 */

import { Inject, Injectable } from '@nestjs/common';
import { Wallet } from '@/domain/entities/wallet.entity';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import { WALLET_REPOSITORY } from '@/application/di.tokens';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';

export interface CreateWalletInput {
  playerId: string;
}

export interface CreateWalletOutput {
  walletId: string;
  playerId: string;
  balance: string;
}

@Injectable()
export class CreateWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: IWalletRepository & {
      create(wallet: Wallet): Promise<void>;
    },
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(input: CreateWalletInput): Promise<CreateWalletOutput> {
    const existing = await this.walletRepository.findByPlayerId(input.playerId);
    if (existing) {
      return this.toOutput(existing);
    }

    const wallet = Wallet.create(input.playerId);
    const events = wallet.pullEvents();

    let outboxIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await this.walletRepository.create(wallet, tx);
      if (events.length > 0) {
        outboxIds = await this.outboxWriter.writeWithinTransaction(tx, wallet.id, events);
      }
    });

    // Best-effort immediate publish for low latency
    if (events.length > 0 && outboxIds.length > 0) {
      await this.outboxWriter.tryImmediatePublish(events, outboxIds);
    }

    return this.toOutput(wallet);
  }

  private toOutput(wallet: Wallet): CreateWalletOutput {
    return {
      walletId: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.getBalance().toCents().toString(),
    };
  }
}
