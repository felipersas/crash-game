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
import type { IEventPublisher } from '@crash/messaging';
import { WALLET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';

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
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: DebitWalletInput): Promise<DebitWalletOutput> {
    const wallet = await this.walletRepository.findById(input.walletId);
    if (!wallet) {
      throw new WalletNotFoundError();
    }

    const amount = Money.fromCents(input.amount);
    wallet.debit(amount, input.reason);

    await this.walletRepository.save(wallet);

    this.metrics.incrWalletOp('debit', Number(input.amount));

    const events = wallet.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    return {
      walletId: wallet.id,
      newBalance: wallet.getBalance().toCents(),
      version: wallet.getVersion(),
    };
  }
}
