/**
 * Player Wallet Resolver - Application Layer
 *
 * Service responsible for resolving playerId to walletId.
 * Encapsulates the playerId → walletId mapping ownership by the Wallets service.
 *
 * This service eliminates code duplication across handlers and provides
 * a single source of truth for wallet resolution logic.
 */

import { Inject, Injectable } from '@nestjs/common';
import { WalletNotFoundError } from '@/domain/errors/domain.errors';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import { WALLET_REPOSITORY } from '@/application/di.tokens';

@Injectable()
export class PlayerWalletResolver {
  constructor(@Inject(WALLET_REPOSITORY) private readonly walletRepository: IWalletRepository) {}

  /**
   * Get wallet by playerId.
   *
   * @param playerId The player ID
   * @returns The wallet entity
   * @throws WalletNotFoundError if wallet not found
   */
  async resolveWallet(
    playerId: string,
  ): Promise<
    ReturnType<typeof this.walletRepository.findByPlayerId> extends Promise<infer T> ? T : never
  > {
    const wallet = await this.walletRepository.findByPlayerId(playerId);
    if (!wallet) {
      throw new WalletNotFoundError();
    }
    return wallet;
  }
}
