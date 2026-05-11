import { z } from "zod";
import { RoundStatus, BetStatus } from "@/types/game.types";

// Round summary schema (for history)
const roundSummarySchema = z.object({
  roundId: z.string().uuid(),
  crashPoint: z.number().nonnegative().nullable(),
  status: z.nativeEnum(RoundStatus),
  startedAt: z.coerce.date().nullable(),
  crashedAt: z.coerce.date().nullable(),
  totalBets: z.number().int().nonnegative(),
  totalWageredCents: z.number().int().nonnegative(),
  totalWageredDecimal: z.string(),
});

// Pagination meta schema
const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

// Get round history response (page-based)
const getRoundHistoryResponseSchema = z.object({
  data: z.array(roundSummarySchema),
  meta: paginationMetaSchema,
});

// Place bet response
const placeBetResponseSchema = z.object({
  roundId: z.string().uuid(),
  betId: z.string().uuid(),
  amountCents: z.number().int().nonnegative(),
  status: z.nativeEnum(BetStatus),
});

// Cash out response
const cashOutResponseSchema = z.object({
  betId: z.string().uuid(),
  roundId: z.string().uuid(),
  playerId: z.string(),
  cashOutMultiplier: z.number().nonnegative(),
  payoutCents: z.number().int().nonnegative(),
  payoutDecimal: z.string(),
});

// Verify round response
const verifyRoundResponseSchema = z.object({
  roundId: z.string().uuid(),
  seed: z.string(),
  seedHash: z.string(),
  salt: z.string(),
  crashPoint: z.number().nonnegative(),
  verified: z.boolean(),
  verificationFormula: z.string().optional(),
});

// My bet schema
const myBetSchema = z.object({
  id: z.string().uuid(),
  roundId: z.string().uuid(),
  amountCents: z.number().int().nonnegative(),
  amountDecimal: z.string(),
  cashOutMultiplier: z.number().nonnegative().nullable(),
  payoutCents: z.number().int().nonnegative().nullable(),
  payoutDecimal: z.string().nullable(),
  profitCents: z.number(),
  profitDecimal: z.string(),
  status: z.nativeEnum(BetStatus),
  cashedOutAt: z.coerce.date().nullable(),
  placedAt: z.coerce.date(),
});

// Bets summary schema
const betsSummarySchema = z.object({
  totalWageredCents: z.number().int().nonnegative(),
  totalWageredDecimal: z.string(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  profitCents: z.number(),
  profitDecimal: z.string(),
});

// Get my bets response
const getMyBetsResponseSchema = z.object({
  data: z.array(myBetSchema),
  meta: paginationMetaSchema,
  summary: betsSummarySchema,
});

// ============================================================================
// Type inference from Zod schemas for API contracts
// ============================================================================

export type PlaceBetResponse = z.infer<typeof placeBetResponseSchema>;
export type CashOutResponse = z.infer<typeof cashOutResponseSchema>;
export type VerifyRoundResponse = z.infer<typeof verifyRoundResponseSchema>;
export type RoundHistoryResponse = z.infer<
  typeof getRoundHistoryResponseSchema
>;
export type MyBetsResponse = z.infer<typeof getMyBetsResponseSchema>;
