import { Round } from '@/domain/entities/round.entity';

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
   */
  save(round: Round): Promise<void>;

  /**
   * Create a new round.
   */
  create(round: Round): Promise<void>;

  /**
   * Get historical rounds with pagination.
   */
  findHistory(limit: number, offset: number): Promise<Round[]>;

  /**
   * Count total finished rounds for pagination.
   */
  findHistoryCount(): Promise<number>;
}
