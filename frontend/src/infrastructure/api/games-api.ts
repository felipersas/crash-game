/**
 * Games Service API Client
 *
 * Handles all communication with the Games backend service via Kong gateway.
 * Uses factory pattern for instantiation with auth token injection.
 *
 * @example
 * ```ts
 * const api = createGamesApi(session.accessToken);
 * const round = await api.getCurrentRound();
 * await api.placeBet(1000); // $10.00 bet
 * ```
 */

import type { AxiosInstance } from 'axios';
import { createHttpClient, get, post } from './http-client';
import { API_ENDPOINTS } from '../../shared/constants/api.constants';
import type { Round } from '../../domain/types/game.types';
import type {
  PlaceBetResponse,
  CashOutResponse,
  RoundHistoryResponse,
  VerifyRoundResponse,
} from '../../shared/schemas/api-schemas';

/**
 * Games API client class
 *
 * @internal Prefer using createGamesApi() factory function
 */
export class GamesApi {
  private readonly client: AxiosInstance;

  /**
   * Creates a new GamesApi instance
   *
   * @param accessToken - Current session access token for auth
   */
  constructor(accessToken?: string) {
    this.client = createHttpClient(accessToken, () => {
      // Token refresh handled by NextAuth session provider
      // This callback triggers session refresh on 401
    });
  }

  /**
   * Place a bet in the current round
   *
   * @param amountCents - Bet amount in cents (min: 100, max: 100000)
   * @returns Place bet response with roundId, betId, and status
   * @throws {ApiError} On validation failures or insufficient balance
   *
   * @example
   * ```ts
   * const result = await api.placeBet(5000); // $50.00 bet
   * console.log(result.roundId, result.betId);
   * ```
   */
  async placeBet(amountCents: number): Promise<PlaceBetResponse> {
    return post(this.client, API_ENDPOINTS.GAMES.BET, { amount: amountCents });
  }

  /**
   * Cash out from an active bet
   *
   * Uses idempotency key to prevent duplicate payouts.
   * Client should generate and store the key for retries.
   *
   * @param idempotencyKey - UUID v4 for idempotency
   * @param roundId - Optional round ID (defaults to current round)
   * @returns Cash out response with multiplier and payout
   * @throws {ApiError} If no active bet or already cashed out
   *
   * @example
   * ```ts
   * const result = await api.cashOut(uuidv4(), currentRoundId);
   * console.log(`Cashed out at ${result.cashOutMultiplier}x`);
   * ```
   */
  async cashOut(idempotencyKey: string, roundId?: string): Promise<CashOutResponse> {
    return post(this.client, API_ENDPOINTS.GAMES.CASHOUT, {
      idempotencyKey,
      roundId,
    });
  }

  /**
   * Get current round state
   *
   * @returns Current round with bets, multiplier, and phase
   * @throws {ApiError} On fetch failures
   *
   * @example
   * ```ts
   * const round = await api.getCurrentRound();
   * if (round.status === 'BETTING') {
   *   // Can place bets
   * }
   * ```
   */
  async getCurrentRound(): Promise<Round> {
    return get(this.client, API_ENDPOINTS.GAMES.CURRENT_ROUND);
  }

  /**
   * Get round history
   *
   * @param limit - Max rounds to return (default: 20)
   * @param offset - Pagination offset (default: 0)
   * @returns Paginated round history
   *
   * @example
   * ```ts
   * const history = await api.getRoundHistory(50, 0);
   * console.log(`Total rounds: ${history.total}`);
   * ```
   */
  async getRoundHistory(limit = 20, offset = 0): Promise<RoundHistoryResponse> {
    return get(
      this.client,
      `${API_ENDPOINTS.GAMES.ROUND_HISTORY}?limit=${limit}&offset=${offset}`
    );
  }

  /**
   * Verify round for provable fairness
   *
   * Validates the crash point against the server seed.
   * Players can verify that games weren't manipulated.
   *
   * @param roundId - Round to verify
   * @returns Verification result with seed and crash point
   *
   * @example
   * ```ts
   * const result = await api.verifyRound(roundId);
   * if (result.verified) {
   *   console.log(`Crash point: ${result.crashPoint}x`);
   * }
   * ```
   */
  async verifyRound(roundId: string): Promise<VerifyRoundResponse> {
    return get(this.client, API_ENDPOINTS.GAMES.VERIFY_ROUND(roundId));
  }
}

/**
 * Factory function to create Games API instance
 *
 * @param accessToken - Current session access token
 * @returns Configured GamesApi instance
 *
 * @example
 * ```ts
 * const api = createGamesApi(session?.accessToken);
 * ```
 */
export function createGamesApi(accessToken?: string): GamesApi {
  return new GamesApi(accessToken);
}
