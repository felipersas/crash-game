export enum RoundStatus {
  BETTING = 'BETTING',
  ACTIVE = 'ACTIVE',
  CRASHED = 'CRASHED',
}

export interface Round {
  roundId: string;
  status: RoundStatus;
  crashPoint: number | null;
  currentMultiplier: number;
  bettingEndTime: Date | null;
  startedAt: Date | null;
  crashedAt: Date | null;
  bets: import('./bet').Bet[];
  seedHash?: string;
  seed?: string;
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

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** UI phase of the current round (lower-case view of RoundStatus). */
export type Phase = 'betting' | 'active' | 'crashed';

export interface Wallet {
  walletId: string;
  playerId: string;
  /** Balance in integer CENTS, serialized as a string (e.g. "50000" = $500.00). */
  balance: string;
  version: number;
}

export interface VerifyRoundResponse {
  roundId: string;
  seed: string;
  seedHash: string;
  salt: string;
  crashPoint: number;
  verified: boolean;
  verificationFormula?: string;
}

export interface RoundHistoryResponse {
  data: RoundSummary[];
  meta: PaginationMeta;
}
