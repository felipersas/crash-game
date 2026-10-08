/**
 * Wallet events consumed by the Games service, as they arrive on the wire
 * (bigint amounts serialized as decimal strings, dates as ISO strings).
 * The source of truth for these events is the Wallets service.
 */

interface WalletMessage {
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly version: number;
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amount: string;
}

/**
 * Bet stake debited → confirm the bet (PENDING → ACTIVE).
 */
export interface WalletDebitedMessage extends WalletMessage {
  readonly eventType: 'WalletDebited';
}

/**
 * Bet stake could not be debited → cancel the bet (PENDING → CANCELLED).
 */
export interface WalletDebitFailedMessage extends WalletMessage {
  readonly eventType: 'WalletDebitFailed';
  readonly reason: string;
}
