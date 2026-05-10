/**
 * Create Wallet Use Case - Application Layer
 *
 * Handles the creation of a new wallet for a player.
 * Ensures one wallet per player (idempotent).
 */

import { Inject, Injectable } from '@nestjs/common';
import { Wallet } from '@/domain/entities/wallet.entity';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import { WALLET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import type { IEventPublisher } from '@crash/messaging';

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
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: CreateWalletInput): Promise<CreateWalletOutput> {
    const existing = await this.walletRepository.findByPlayerId(input.playerId);
    if (existing) {
      return this.toOutput(existing);
    }

    const wallet = Wallet.create(input.playerId);

    await this.walletRepository.create(wallet);

    const events = wallet.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    return this.toOutput(wallet);
  }

  private toOutput(wallet: Wallet): CreateWalletOutput {
    return {
      walletId: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.getBalance().toDecimal(),
    };
  }
}
