/**
 * Games Service API
 *
 * Direct exports — uses shared apiClient with auto-auth.
 * No token passing needed.
 */

import { z } from "zod";
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
import {
  placeBetResponseSchema,
  cashOutResponseSchema,
  getRoundHistoryResponseSchema,
  verifyRoundResponseSchema,
  getMyBetsResponseSchema,
} from "@/schemas/api-schemas";

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export function placeBet(amountCents: number): Promise<PlaceBetResponse> {
  return post(API_ENDPOINTS.GAMES.BET, { amount: amountCents })
    .then(data => validate(placeBetResponseSchema, data));
}

export function cashOut(idempotencyKey: string, roundId?: string): Promise<CashOutResponse> {
  return post(API_ENDPOINTS.GAMES.CASHOUT, { idempotencyKey, roundId })
    .then(data => validate(cashOutResponseSchema, data));
}

export function getCurrentRound(): Promise<Round> {
  return get(API_ENDPOINTS.GAMES.CURRENT_ROUND);
}

export function getRoundHistory(params: { page?: number; limit?: number } = {}): Promise<RoundHistoryResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  return get(`${API_ENDPOINTS.GAMES.ROUND_HISTORY}?page=${page}&limit=${limit}`)
    .then(data => validate(getRoundHistoryResponseSchema, data));
}

export function getMyBets(params: { page?: number; limit?: number } = {}): Promise<MyBetsResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  return get(`${API_ENDPOINTS.GAMES.MY_BETS}?page=${page}&limit=${limit}`)
    .then(data => validate(getMyBetsResponseSchema, data));
}

export function verifyRound(roundId: string): Promise<VerifyRoundResponse> {
  return get(API_ENDPOINTS.GAMES.VERIFY_ROUND(roundId))
    .then(data => validate(verifyRoundResponseSchema, data));
}
