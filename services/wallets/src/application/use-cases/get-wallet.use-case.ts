import { Inject, Injectable } from '@nestjs/common';
import type { PlayerId } from '@crash/domain';
import { WalletNotFoundError } from '@/domain/errors/domain.errors';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import type { IUseCase } from '@/application/interfaces/use-case';
import { WALLET_REPOSITORY } from '@/application/di.tokens';

export interface GetWalletInput {
  playerId: PlayerId;
}

export interface GetWalletOutput {
  walletId: string;
  playerId: string;
  balanceCents: bigint;
  version: number;
}

/**
 * Get Wallet Use Case - Application Layer
 */
@Injectable()
export class GetWalletUseCase implements IUseCase<GetWalletInput, GetWalletOutput> {
  constructor(@Inject(WALLET_REPOSITORY) private readonly walletRepository: IWalletRepository) {}

  async execute(input: GetWalletInput): Promise<GetWalletOutput> {
    const wallet = await this.walletRepository.findByPlayerId(input.playerId);
    if (!wallet) {
      throw new WalletNotFoundError();
    }

    return {
      walletId: wallet.id,
      playerId: wallet.playerId,
      balanceCents: wallet.getBalance().toCents(),
      version: wallet.getVersion(),
    };
  }
}
