/**
 * External Wallet Events - Types consumed from Wallets service
 *
 * These types define the structure of events that the Games service
 * consumes from the Wallets service via RabbitMQ.
 *
 * Note: These are read-only types for consumption. The source of truth
 * for these events is in the Wallets service.
 */

interface BaseDomainEvent {
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly version: number;
}

/**
 * Emitted by Wallets service when a bet amount is successfully debited.
 * Games service uses this to confirm the bet (PENDING → ACTIVE).
 */
export interface WalletDebitedEvent extends BaseDomainEvent {
  readonly eventType: 'WalletDebited';
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amount: bigint;
  timestamp: Date;
}

/**
 * Emitted by Wallets service when a bet debit fails.
 * Games service uses this to cancel the bet (PENDING → CANCELLED).
 */
export interface WalletDebitFailedEvent extends BaseDomainEvent {
  readonly eventType: 'WalletDebitFailed';
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amount: bigint;
  readonly reason: string;
  timestamp: Date;
}
