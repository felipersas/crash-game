export enum BetStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  CASHED_OUT = 'CASHED_OUT',
  LOST = 'LOST',
  CANCELLED = 'CANCELLED',
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

export interface PlaceBetResponse {
  roundId: string;
  betId: string;
  amountCents: number;
  status: BetStatus;
}

export interface CashOutResponse {
  betId: string;
  roundId: string;
  playerId: string;
  cashOutMultiplier: number;
  payoutCents: number;
  payoutDecimal: string;
}

export interface MyBetsResponse {
  data: MyBet[];
  meta: import('./game').PaginationMeta;
  summary: BetsSummary;
}
