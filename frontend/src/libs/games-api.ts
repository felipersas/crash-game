/**
 * Games Service API
 *
 * Direct exports — uses shared apiClient with auto-auth.
 * No token passing needed.
 */

import { get, post } from './axios';
import { API_ENDPOINTS } from '@/constants/api';
import type { Round } from '@/types/game.types';
import type {
  PlaceBetResponse,
  CashOutResponse,
  RoundHistoryResponse,
  VerifyRoundResponse,
  MyBetsResponse,
} from '@/schemas/api-schemas';

export function placeBet(amountCents: number): Promise<PlaceBetResponse> {
  return post(API_ENDPOINTS.GAMES.BET, { amount: amountCents });
}

export function cashOut(idempotencyKey: string, roundId?: string): Promise<CashOutResponse> {
  return post(API_ENDPOINTS.GAMES.CASHOUT, { idempotencyKey, roundId });
}

export function getCurrentRound(): Promise<Round> {
  return get(API_ENDPOINTS.GAMES.CURRENT_ROUND);
}

export function getRoundHistory(params: { page?: number; limit?: number } = {}): Promise<RoundHistoryResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  return get(`${API_ENDPOINTS.GAMES.ROUND_HISTORY}?page=${page}&limit=${limit}`);
}

export function getMyBets(params: { page?: number; limit?: number } = {}): Promise<MyBetsResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  return get(`${API_ENDPOINTS.GAMES.MY_BETS}?page=${page}&limit=${limit}`);
}

export function verifyRound(roundId: string): Promise<VerifyRoundResponse> {
  return get(API_ENDPOINTS.GAMES.VERIFY_ROUND(roundId));
}
