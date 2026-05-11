/**
 * Domain types for the Crash Game
 */

export enum RoundStatus {
  BETTING = 'BETTING',
  ACTIVE = 'ACTIVE',
  CRASHED = 'CRASHED',
}

export enum BetStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  CASHED_OUT = 'CASHED_OUT',
  LOST = 'LOST',
  CANCELLED = 'CANCELLED',
}

export interface Round {
  roundId: string;
  status: RoundStatus;
  crashPoint: number | null;
  currentMultiplier: number;
  bettingEndTime: Date | null;
  startedAt: Date | null;
  crashedAt: Date | null;
  bets: Bet[];
  seedHash?: string;
  seed?: string;
}

export interface Bet {
  id: string;
  roundId: string;
  playerId: string;
  playerName: string;
  amountCents: number;
  amountDecimal: string;
  status: BetStatus;
  cashOutMultiplier: number | null;
  payoutCents: number | null;
  payoutDecimal: string | null;
  cashedOutAt: Date | null;
}

export interface RoundSummary {
  roundId: string;
  crashPoint: number | null;
  status: RoundStatus;
  startedAt: Date | null;
  crashedAt: Date | null;
  totalBets: number;
  totalWageredCents: number;
  totalWageredDecimal: string;
}

export interface Wallet {
  walletId: string;
  playerId: string;
  balance: string;
  version: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MyBet {
  id: string;
  roundId: string;
  amountCents: number;
  amountDecimal: string;
  cashOutMultiplier: number | null;
  payoutCents: number | null;
  payoutDecimal: string | null;
  profitCents: number;
  profitDecimal: string;
  status: BetStatus;
  cashedOutAt: Date | null;
  placedAt: Date;
}

export interface BetsSummary {
  totalWageredCents: number;
  totalWageredDecimal: string;
  wins: number;
  losses: number;
  profitCents: number;
  profitDecimal: string;
}
