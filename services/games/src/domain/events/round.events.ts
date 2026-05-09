import type { DomainEvent } from '@crash/messaging';

/**
 * Domain events for the Games bounded context.
 * These events represent state changes that need to be communicated
 * to other services via the message broker (RabbitMQ) or to clients via WebSocket.
 */

/**
 * Emitted when a new round starts (betting phase opens).
 */
export interface RoundStartedEvent extends DomainEvent {
  readonly eventType: 'RoundStarted';
  readonly roundId: string;
  readonly seedHash: string; // Hash of the seed for provably fair verification
  readonly bettingEndTime: Date; // When the betting phase ends
}

/**
 * Emitted when the betting phase ends and the round becomes active.
 */
export interface BettingPhaseEndedEvent extends DomainEvent {
  readonly eventType: 'BettingPhaseEnded';
  readonly roundId: string;
}

/**
 * Emitted when a player places a bet.
 */
export interface BetPlacedEvent extends DomainEvent {
  readonly eventType: 'BetPlaced';
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amount: bigint;
  timestamp: Date;
}

/**
 * Emitted when a player cashes out.
 */
export interface PlayerCashedOutEvent extends DomainEvent {
  readonly eventType: 'PlayerCashedOut';
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly betAmount: bigint;
  readonly cashOutMultiplier: number; // The multiplier at which they cashed out
  readonly winAmount: bigint; // The amount won
  timestamp: Date;
}

/**
 * Emitted when the round crashes.
 */
export interface RoundCrashedEvent extends DomainEvent {
  readonly eventType: 'RoundCrashed';
  readonly roundId: string;
  readonly crashPoint: number;
  readonly seed: string; // The actual seed (revealed after crash)
  readonly totalBets: number;
  readonly totalBetAmount: bigint;
  readonly totalWinAmount: bigint;
  timestamp: Date;
}

/**
 * Emitted by Wallets service when bet amount is successfully debited.
 * Games service uses this to confirm the bet (PENDING → ACTIVE).
 */
export interface WalletDebitedEvent extends DomainEvent {
  readonly eventType: 'WalletDebited';
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amount: bigint;
  timestamp: Date;
}

/**
 * Emitted by Wallets service when bet debit fails (insufficient funds, etc.).
 * Games service uses this to cancel the bet (PENDING → CANCELLED).
 */
export interface WalletDebitFailedEvent extends DomainEvent {
  readonly eventType: 'WalletDebitFailed';
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amount: bigint;
  readonly reason: string; // Why the debit failed
  timestamp: Date;
}

/**
 * Emitted when a bet is confirmed after successful wallet debit.
 * Used to notify clients via WebSocket that their bet is now active.
 */
export interface BetConfirmedEvent extends DomainEvent {
  readonly eventType: 'BetConfirmed';
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amount: bigint;
  timestamp: Date;
}

/**
 * Emitted when a bet is cancelled after wallet debit failure.
 * Used to notify clients via WebSocket that their bet was rejected.
 */
export interface BetCancelledEvent extends DomainEvent {
  readonly eventType: 'BetCancelled';
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amount: bigint;
  readonly reason: string;
  timestamp: Date;
}

/**
 * Union type of all game domain events.
 */
export type GameDomainEvent =
  | RoundStartedEvent
  | BettingPhaseEndedEvent
  | BetPlacedEvent
  | PlayerCashedOutEvent
  | RoundCrashedEvent
  | WalletDebitedEvent
  | WalletDebitFailedEvent
  | BetConfirmedEvent
  | BetCancelledEvent;

/**
 * Helper factory to create domain events with common fields.
 */
function createBaseEvent(
  aggregateId: string,
  version: number,
): Pick<DomainEvent, 'aggregateId' | 'occurredAt' | 'version'> {
  return {
    aggregateId,
    occurredAt: new Date(),
    version,
  };
}

export function createRoundStartedEvent(
  roundId: string,
  seedHash: string,
  bettingEndTime: Date,
  version: number,
): RoundStartedEvent {
  return {
    ...createBaseEvent(roundId, version),
    eventType: 'RoundStarted',
    roundId,
    seedHash,
    bettingEndTime,
  };
}

export function createBettingPhaseEndedEvent(
  roundId: string,
  version: number,
): BettingPhaseEndedEvent {
  return {
    ...createBaseEvent(roundId, version),
    eventType: 'BettingPhaseEnded',
    roundId,
  };
}

export function createBetPlacedEvent(
  roundId: string,
  betId: string,
  playerId: string,
  amount: bigint,
  version: number,
): BetPlacedEvent {
  return {
    ...createBaseEvent(roundId, version),
    eventType: 'BetPlaced',
    roundId,
    betId,
    playerId,
    amount,
    timestamp: new Date(),
  };
}

export function createPlayerCashedOutEvent(
  roundId: string,
  betId: string,
  playerId: string,
  betAmount: bigint,
  cashOutMultiplier: number,
  winAmount: bigint,
  version: number,
): PlayerCashedOutEvent {
  return {
    ...createBaseEvent(roundId, version),
    eventType: 'PlayerCashedOut',
    roundId,
    betId,
    playerId,
    betAmount,
    cashOutMultiplier,
    winAmount,
    timestamp: new Date(),
  };
}

export function createRoundCrashedEvent(
  roundId: string,
  crashPoint: number,
  seed: string,
  totalBets: number,
  totalBetAmount: bigint,
  totalWinAmount: bigint,
  version: number,
): RoundCrashedEvent {
  return {
    ...createBaseEvent(roundId, version),
    eventType: 'RoundCrashed',
    roundId,
    crashPoint,
    seed,
    totalBets,
    totalBetAmount,
    totalWinAmount,
    timestamp: new Date(),
  };
}

export function createWalletDebitedEvent(
  roundId: string,
  betId: string,
  playerId: string,
  amount: bigint,
  version: number,
): WalletDebitedEvent {
  return {
    ...createBaseEvent(roundId, version),
    eventType: 'WalletDebited',
    roundId,
    betId,
    playerId,
    amount,
    timestamp: new Date(),
  };
}

export function createWalletDebitFailedEvent(
  roundId: string,
  betId: string,
  playerId: string,
  amount: bigint,
  reason: string,
  version: number,
): WalletDebitFailedEvent {
  return {
    ...createBaseEvent(roundId, version),
    eventType: 'WalletDebitFailed',
    roundId,
    betId,
    playerId,
    amount,
    reason,
    timestamp: new Date(),
  };
}

export function createBetConfirmedEvent(
  roundId: string,
  betId: string,
  playerId: string,
  amount: bigint,
  version: number,
): BetConfirmedEvent {
  return {
    ...createBaseEvent(roundId, version),
    eventType: 'BetConfirmed',
    roundId,
    betId,
    playerId,
    amount,
    timestamp: new Date(),
  };
}

export function createBetCancelledEvent(
  roundId: string,
  betId: string,
  playerId: string,
  amount: bigint,
  reason: string,
  version: number,
): BetCancelledEvent {
  return {
    ...createBaseEvent(roundId, version),
    eventType: 'BetCancelled',
    roundId,
    betId,
    playerId,
    amount,
    reason,
    timestamp: new Date(),
  };
}
