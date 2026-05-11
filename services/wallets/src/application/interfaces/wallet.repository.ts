import { Wallet } from '@/domain/entities/wallet.entity';
import type { PrismaTransaction } from '@/infrastructure/messaging/outbox-writer';

/**
 *
 * Defines the contract for wallet persistence.
 * Implemented by Infrastructure layer (PostgreSQL via PrismaORM).
 */
export interface IWalletRepository {
  /**
   * Find a wallet by player ID.
   * Returns null if not found.
   */
  findByPlayerId(playerId: string): Promise<Wallet | null>;

  /**
   * Find a wallet by its ID.
   * Returns null if not found.
   */
  findById(id: string): Promise<Wallet | null>;

  /**
   * Save a wallet (create or update).
   * Uses optimistic locking via version field.
   * Throws OptimisticLockError if version mismatch.
   * Optional tx for atomic operations within a transaction.
   */
  save(wallet: Wallet, tx?: PrismaTransaction): Promise<void>;

  /**
   * Create a new wallet in the database.
   * Optional tx for atomic operations within a transaction.
   */
  create(wallet: Wallet, tx?: PrismaTransaction): Promise<void>;
}
