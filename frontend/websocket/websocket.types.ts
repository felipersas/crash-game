/**
 * WebSocket Event Types
 * Server → Client only (push)
 */

export interface ServerToClientEvents {
  roundStarted: (data: RoundStartedEvent) => void;
  bettingEnded: (data: BettingEndedEvent) => void;
  multiplierUpdate: (data: MultiplierUpdateEvent) => void;
  crash: (data: CrashEvent) => void;
  betPlaced: (data: BetPlacedEvent) => void;
  betConfirmed: (data: BetConfirmedEvent) => void;
  betCancelled: (data: BetCancelledEvent) => void;
  playerCashedOut: (data: PlayerCashedOutEvent) => void;
}

export interface RoundStartedEvent {
  roundId: string;
  seedHash: string;
  bettingEndTime: Date | string;
}

export interface BettingEndedEvent {
  roundId: string;
}

export interface MultiplierUpdateEvent {
  roundId: string;
  multiplier: number;
}

export interface CrashEvent {
  roundId: string;
  crashPoint: number;
  seed: string;
}

export interface BetPlacedEvent {
  roundId: string;
  betId: string;
  playerId: string;
  amountCents: number;
}

export interface BetConfirmedEvent {
  roundId: string;
  betId: string;
  playerId: string;
  amountCents: number;
}

export interface BetCancelledEvent {
  roundId: string;
  betId: string;
  playerId: string;
  amountCents: number;
  reason: string;
}

export interface PlayerCashedOutEvent {
  roundId: string;
  betId: string;
  playerId: string;
  multiplier: number;
  payoutCents: number;
}

// Connection states
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';
