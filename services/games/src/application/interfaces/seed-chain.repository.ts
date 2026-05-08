import type { SeedChain } from '@/domain/value-objects/seed-chain.value-object';

/**
 * Repository interface for SeedChain persistence.
 *
 * The seed chain is persisted to survive service restarts.
 * It is stored separately from the database for security.
 */
export interface ISeedChainRepository {
  /**
   * Load the current seed chain from storage.
   * Returns null if no chain exists.
   */
  load(): Promise<SeedChain | null>;

  /**
   * Save a new seed chain to storage.
   * Overwrites any existing chain.
   */
  save(chain: SeedChain): Promise<void>;

  /**
   * Delete the current seed chain from storage.
   */
  delete(): Promise<void>;

  /**
   * Check if a seed chain exists in storage.
   */
  exists(): Promise<boolean>;
}
