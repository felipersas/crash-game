/**
 * Credit Wallet Use Case - Application Layer
 *
 * Handles crediting money to a wallet.
 * Called via message broker from Games Service.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Money } from '@crash/domain';
import { WalletNotFoundError } from '@/domain/errors/domain.errors';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import { WALLET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import type { IEventPublisher } from '@crash/messaging';

export interface CreditWalletInput {
  walletId: string;
  amount: bigint;
  reason: string;
  idempotencyKey?: string;
}

export interface CreditWalletOutput {
  walletId: string;
  newBalance: bigint;
  version: number;
}

@Injectable()
export class CreditWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepository: IWalletRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: CreditWalletInput): Promise<CreditWalletOutput> {
    const wallet = await this.walletRepository.findById(input.walletId);
    if (!wallet) {
      throw new WalletNotFoundError();
    }

    const amount = Money.fromCents(input.amount);
    wallet.credit(amount, input.reason);

    await this.walletRepository.save(wallet);

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
