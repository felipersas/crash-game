import type { Round } from '@/domain/entities/round.entity';
import type { RoundId } from '@crash/domain';
import type { TransactionContext } from './unit-of-work';

/**
 * Round Repository Interface - Application Layer
 *
 * Bet queries belong to IBetRepository, not here.
 */
export interface IRoundRepository {
  /**
   * Find the most recently created round (any status), with its bets.
   */
  findCurrentRound(): Promise<Round | null>;

  findById(id: RoundId): Promise<Round | null>;

  /**
   * Update an existing round with optimistic locking.
   * @throws OptimisticLockError when the stored version moved on.
   */
  save(round: Round, tx?: TransactionContext): Promise<void>;

  create(round: Round, tx?: TransactionContext): Promise<void>;

  /**
   * Crashed rounds, newest first.
   */
  findHistory(limit: number, offset: number): Promise<Round[]>;

  countHistory(): Promise<number>;
}
