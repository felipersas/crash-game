/**
 * Game Broadcaster Interface - Application Layer
 *
 * Abstraction for pushing game state to connected clients.
 * Decouples use cases from the concrete WebSocket implementation.
 * Implementations must never throw: broadcasting is best-effort.
 */

export interface RoundStartedBroadcast {
  roundId: string;
  seedHash: string;
  bettingEndTime: Date;
}

export interface CrashBroadcast {
  roundId: string;
  crashPoint: number;
  seed: string;
}

export interface BetBroadcast {
  roundId: string;
  betId: string;
  playerId: string;
  playerName: string;
  amountCents: bigint;
}

export interface BetCancelledBroadcast extends BetBroadcast {
  reason: string;
}

export interface PlayerCashedOutBroadcast {
  roundId: string;
  betId: string;
  playerId: string;
  playerName: string;
  multiplier: number;
  payoutCents: bigint;
}

export interface IGameBroadcaster {
  broadcastRoundStarted(data: RoundStartedBroadcast): void;
  broadcastBettingEnded(roundId: string): void;
  broadcastMultiplierUpdate(roundId: string, multiplier: number): void;
  broadcastCrash(data: CrashBroadcast): void;
  broadcastBetPlaced(data: BetBroadcast): void;
  broadcastBetConfirmed(data: BetBroadcast): void;
  broadcastBetCancelled(data: BetCancelledBroadcast): void;
  broadcastPlayerCashedOut(data: PlayerCashedOutBroadcast): void;
}
