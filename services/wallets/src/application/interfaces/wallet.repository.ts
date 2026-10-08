import type { WalletId, PlayerId } from '@crash/domain';
import type { Wallet } from '@/domain/entities/wallet.entity';
import type { TransactionContext } from './unit-of-work';

/**
 * Wallet Repository Interface - Application Layer
 */
export interface IWalletRepository {
  findByPlayerId(playerId: PlayerId): Promise<Wallet | null>;

  findById(id: WalletId): Promise<Wallet | null>;

  /**
   * Update a wallet with optimistic locking.
   * @throws OptimisticLockError when the stored version moved on.
   */
  save(wallet: Wallet, tx?: TransactionContext): Promise<void>;

  create(wallet: Wallet, tx?: TransactionContext): Promise<void>;
}
