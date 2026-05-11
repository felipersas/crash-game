/**
 * Debit Wallet Use Case - Application Layer
 *
 * Handles debiting money from a wallet.
 * Called via message broker from Games Service.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Money } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { WalletNotFoundError } from '@/domain/errors/domain.errors';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import { WALLET_REPOSITORY } from '@/application/di.tokens';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';

export interface DebitWalletInput {
  walletId: string;
  amount: bigint;
  reason: string;
  idempotencyKey?: string;
}

export interface DebitWalletOutput {
  walletId: string;
  newBalance: bigint;
  version: number;
}

@Injectable()
export class DebitWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepository: IWalletRepository,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(input: DebitWalletInput): Promise<DebitWalletOutput> {
    const wallet = await this.walletRepository.findById(input.walletId);
    if (!wallet) {
      throw new WalletNotFoundError();
    }

    const amount = Money.fromCents(input.amount);
    wallet.debit(amount, input.reason);

    const events = wallet.pullEvents();

    let outboxIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await this.walletRepository.save(wallet, tx);
      if (events.length > 0) {
        outboxIds = await this.outboxWriter.writeWithinTransaction(tx, wallet.id, events);
      }
    });

    // Best-effort immediate publish for low latency
    if (events.length > 0 && outboxIds.length > 0) {
      await this.outboxWriter.tryImmediatePublish(events, outboxIds);
    }

    this.metrics.incrWalletOp('debit', Number(input.amount));

    return {
      walletId: wallet.id,
      newBalance: wallet.getBalance().toCents(),
      version: wallet.getVersion(),
    };
  }
}
