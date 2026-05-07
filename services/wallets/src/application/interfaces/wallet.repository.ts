import { Wallet } from '@/domain/entities/wallet.entity';


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
   */
  save(wallet: Wallet): Promise<void>;

  /**
   * Create a new wallet in the database.
   */
  create(wallet: Wallet): Promise<void>;

  /**
   * Check if a wallet exists for the given player ID.
   */
  existsByPlayerId(playerId: string): Promise<boolean>;
}
