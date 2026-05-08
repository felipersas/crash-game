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
  playerId: string;
  amountCents: number;
}

export interface PlayerCashedOutEvent {
  roundId: string;
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

// Round phase (for UI state)
export type RoundPhase = 'betting' | 'active' | 'crashed';
