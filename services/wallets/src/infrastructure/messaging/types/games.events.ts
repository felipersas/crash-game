/**
 * External Game Events - Types consumed from Games service
 *
 * These types define the structure of events that the Wallets service
 * consumes from the Games service via RabbitMQ.
 *
 * Note: These are read-only types for consumption. The source of truth
 * for these events is in the Games service.
 */

interface BaseDomainEvent {
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly version: number;
}

/**
 * Emitted when a player places a bet in the Games service.
 * The Wallets service debits the bet amount from the player's wallet.
 */
export interface BetPlacedEvent extends BaseDomainEvent {
  readonly eventType: 'BetPlaced';
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amount: bigint;
  timestamp: Date;
}

/**
 * Emitted when a player cashes out in the Games service.
 * The Wallets service credits the winnings to the player's wallet.
 */
export interface PlayerCashedOutEvent extends BaseDomainEvent {
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
 * Union type of all game events consumed by Wallets service.
 */
export type GameDomainEvent = BetPlacedEvent | PlayerCashedOutEvent;
