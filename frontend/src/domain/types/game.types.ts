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

export interface Money {
  cents: bigint;
  decimal: string;
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
  amountCents: number;
  amountDecimal: string;
  status: BetStatus;
  cashOutMultiplier: number | null;
  cashOutAmountCents: number | null;
  cashOutAmountDecimal: string | null;
  cashedOutAt: Date | null;
}

export interface RoundSummary {
  roundId: string;
  crashPoint: number | null;
  status: RoundStatus;
  startedAt: Date | null;
  crashedAt: Date | null;
  totalBets: number;
}

export interface Wallet {
  walletId: string;
  playerId: string;
  balance: string;
  version: number;
}

export interface UserContext {
  playerId: string;
  email: string;
  username: string;
}
