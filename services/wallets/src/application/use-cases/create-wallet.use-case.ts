import { Inject, Injectable } from '@nestjs/common';
import type { PlayerId } from '@crash/domain';
import { Wallet } from '@/domain/entities/wallet.entity';
import type { IWalletRepository } from '@/application/interfaces/wallet.repository';
import type { IUnitOfWork } from '@/application/interfaces/unit-of-work';
import type { IUseCase } from '@/application/interfaces/use-case';
import { WALLET_REPOSITORY, UNIT_OF_WORK } from '@/application/di.tokens';

export interface CreateWalletInput {
  playerId: PlayerId;
}

export interface CreateWalletOutput {
  walletId: string;
  playerId: string;
  balanceCents: bigint;
}

/**
 * Create Wallet Use Case - Application Layer
 *
 * Creates the player's wallet with a zero balance. Idempotent: returns the
 * existing wallet when the player already has one.
 */
@Injectable()
export class CreateWalletUseCase implements IUseCase<CreateWalletInput, CreateWalletOutput> {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepository: IWalletRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(input: CreateWalletInput): Promise<CreateWalletOutput> {
    const existing = await this.walletRepository.findByPlayerId(input.playerId);
    if (existing) {
      return toOutput(existing);
    }

    const wallet = Wallet.create(input.playerId);
    await this.unitOfWork.commit(wallet.id, wallet.pullEvents(), (tx) =>
      this.walletRepository.create(wallet, tx),
    );

    return toOutput(wallet);
  }
}

function toOutput(wallet: Wallet): CreateWalletOutput {
  return {
    walletId: wallet.id,
    playerId: wallet.playerId,
    balanceCents: wallet.getBalance().toCents(),
  };
}
