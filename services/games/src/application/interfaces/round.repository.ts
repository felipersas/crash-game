import { type Round } from '@/domain/entities/round.entity';
import type { PrismaTransaction } from '@/infrastructure/messaging/outbox-writer';

/**
 * Round Repository Interface - Application Layer
 *
 * Defines the contract for round persistence.
 * Implemented by Infrastructure layer.
 *
 * NOTE: Bet queries belong to IBetRepository, not here.
 */
export interface IRoundRepository {
  /**
   * Find the current active round (in BETTING or ACTIVE state).
   */
  findCurrentRound(): Promise<Round | null>;

  /**
   * Find a round by ID.
   */
  findById(id: string): Promise<Round | null>;

  /**
   * Update an existing round (with optimistic locking).
   * Optional tx for atomic operations within a transaction boundary.
   */
  save(round: Round, tx?: PrismaTransaction): Promise<void>;

  /**
   * Create a new round.
   * Optional tx for atomic operations within a transaction boundary.
   */
  create(round: Round, tx?: PrismaTransaction): Promise<void>;

  /**
   * Get historical rounds with pagination.
   */
  findHistory(limit: number, offset: number): Promise<Round[]>;

  /**
   * Count total finished rounds for pagination.
   */
  findHistoryCount(): Promise<number>;
}
