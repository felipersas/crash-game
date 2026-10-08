/**
 * Games events consumed by the Wallets service, as they arrive on the wire
 * (bigint amounts serialized as decimal strings, dates as ISO strings).
 * The source of truth for these events is the Games service.
 */

interface GamesMessage {
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly version: number;
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
}

/**
 * A player placed a bet → debit the stake.
 */
export interface BetPlacedMessage extends GamesMessage {
  readonly eventType: 'BetPlaced';
  readonly amount: string;
}

/**
 * A player cashed out → credit the payout.
 */
export interface PlayerCashedOutMessage extends GamesMessage {
  readonly eventType: 'PlayerCashedOut';
  readonly betAmount: string;
  readonly cashOutMultiplier: number;
  /** Total payout (stake + profit) in cents. */
  readonly winAmount: string;
}
