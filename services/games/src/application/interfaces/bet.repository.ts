import type { Bet } from '@/domain/entities/bet.entity';
import type { BetId, RoundId, PlayerId } from '@crash/domain';
import type { TransactionContext } from './unit-of-work';

export interface PlayerBetsSummary {
  totalWageredCents: bigint;
  wins: number;
  losses: number;
  profitCents: bigint;
}

/**
 * Bet Repository Interface - Application Layer
 *
 * Bets are persisted independently from their Round for better concurrency.
 */
export interface IBetRepository {
  /**
   * @throws DuplicateBetError when the player already has a live bet in the round.
   */
  create(bet: Bet, tx?: TransactionContext): Promise<void>;

  update(bet: Bet, tx?: TransactionContext): Promise<void>;

  findById(betId: BetId): Promise<Bet | null>;

  /**
   * Latest bet of a player in a round, or null.
   */
  findByPlayerAndRound(playerId: PlayerId, roundId: RoundId): Promise<Bet | null>;

  findByPlayerPaginated(playerId: PlayerId, limit: number, offset: number): Promise<Bet[]>;

  countByPlayer(playerId: PlayerId): Promise<number>;

  /**
   * Aggregated win/loss summary computed in the database.
   */
  getSummaryByPlayer(playerId: PlayerId): Promise<PlayerBetsSummary>;

  /**
   * PENDING bets created before the given threshold (wallet never answered).
   */
  findStalePendingBets(olderThan: Date): Promise<Bet[]>;
}
