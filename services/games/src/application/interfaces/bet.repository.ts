import { Bet, BetStatus } from '@/domain/entities/bet.entity';

/**
 * Bet Repository Interface - Application Layer
 *
 * Defines the contract for Bet persistence operations.
 * Bet is now a separate aggregate from Round, allowing for
 * better concurrency and scalability.
 */
export interface IBetRepository {
  /**
   * Create a new bet.
   */
  create(bet: Bet): Promise<void>;

  /**
   * Update an existing bet (status changes).
   */
  update(bet: Bet): Promise<void>;

  /**
   * Find a bet by ID.
   */
  findById(betId: string): Promise<Bet | null>;

  /**
   * Find all bets for a specific round.
   */
  findByRound(roundId: string): Promise<Bet[]>;

  /**
   * Find a specific player's bet in a round.
   * Returns null if no bet exists for that player in the round.
   */
  findByPlayerAndRound(playerId: string, roundId: string): Promise<Bet | null>;

  /**
   * Find all bets for a player (paginated).
   */
  findByPlayer(playerId: string, limit?: number): Promise<Bet[]>;

  /**
   * Find bets by status for a round.
   * Useful for finding PENDING bets that need confirmation/cancellation.
   */
  findByRoundAndStatus(roundId: string, status: BetStatus): Promise<Bet[]>;

  /**
   * Find all bets for a player with pagination.
   */
  findByPlayerPaginated(playerId: string, limit: number, offset: number): Promise<Bet[]>;

  /**
   * Count total bets for a player.
   */
  countByPlayer(playerId: string): Promise<number>;

  /**
   * Compute aggregated summary for a player's bets.
   * Avoids loading all bets into memory.
   */
  getSummaryByPlayer(playerId: string): Promise<{
    totalWageredCents: number;
    wins: number;
    losses: number;
    profitCents: number;
  }>;

  /**
   * Find PENDING bets created before the given threshold.
   * Used by timeout handler to cancel stale unconfirmed bets.
   */
  findStalePendingBets(olderThan: Date): Promise<Bet[]>;
}
