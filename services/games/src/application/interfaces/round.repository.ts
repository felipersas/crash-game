import { Round, RoundStatus } from '@/domain/entities/round.entity';
import { Bet } from '@/domain/entities/bet.entity';

/**
 * Round Repository Interface - Application Layer
 *
 * Defines the contract for round persistence.
 * Implemented by Infrastructure layer.
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
   * Save a round (create or update).
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
   * Find a bet by ID.
   */
  findBetById(betId: string): Promise<Bet | null>;

  /**
   * Find all bets for a player.
   */
  findBetsByPlayer(playerId: string, limit?: number): Promise<Bet[]>;
}
