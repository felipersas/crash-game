/**
 * Get Wallet Use Case - Application Layer
 *
 * Retrieves a wallet for the authenticated player.
 */

import { Inject, Injectable } from '@nestjs/common';
import { WalletNotFoundError } from '@/domain/errors/domain.errors';
import { Wallet } from '@/domain/entities/wallet.entity';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import { WALLET_REPOSITORY } from '@/infrastructure/di/tokens';

export interface GetWalletInput {
  playerId: string;
}

export interface GetWalletOutput {
  walletId: string;
  playerId: string;
  balance: string;
  version: number;
}

@Injectable()
export class GetWalletUseCase {
  constructor(@Inject(WALLET_REPOSITORY) private readonly walletRepository: IWalletRepository) {}

  async execute(input: GetWalletInput): Promise<GetWalletOutput> {
    const wallet = await this.walletRepository.findByPlayerId(input.playerId);
    if (!wallet) {
      throw new WalletNotFoundError(input.playerId);
    }

    return this.toOutput(wallet);
  }

  private toOutput(wallet: Wallet): GetWalletOutput {
    return {
      walletId: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.getBalance().toDecimal(),
      version: wallet.getVersion(),
    };
  }
}
