/**
 * Domain events for the Wallet bounded context.
 * These events represent state changes that need to be communicated
 * to other services via the message broker (RabbitMQ).
 */

export interface DomainEvent {
  readonly eventType: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly version: number;
}

/**
 * Emitted when a new wallet is created for a player.
 */
export interface WalletCreatedEvent extends DomainEvent {
  readonly eventType: 'WalletCreated';
  readonly playerId: string;
  readonly initialBalance: bigint;
}

/**
 * Emitted when money is credited to a wallet.
 */
export interface MoneyCreditedEvent extends DomainEvent {
  readonly eventType: 'MoneyCredited';
  readonly playerId: string;
  readonly amount: bigint;
  readonly newBalance: bigint;
  readonly reason: string;
}

/**
 * Emitted when money is debited from a wallet.
 */
export interface MoneyDebitedEvent extends DomainEvent {
  readonly eventType: 'MoneyDebited';
  readonly playerId: string;
  readonly amount: bigint;
  readonly newBalance: bigint;
  readonly reason: string;
}

/**
 * Union type of all wallet domain events.
 */
export type WalletDomainEvent = WalletCreatedEvent | MoneyCreditedEvent | MoneyDebitedEvent;

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

export function createWalletCreatedEvent(
  walletId: string,
  playerId: string,
  initialBalance: bigint,
  version: number,
): WalletCreatedEvent {
  return {
    ...createBaseEvent(walletId, version),
    eventType: 'WalletCreated',
    playerId,
    initialBalance,
  };
}

export function createMoneyCreditedEvent(
  walletId: string,
  playerId: string,
  amount: bigint,
  newBalance: bigint,
  reason: string,
  version: number,
): MoneyCreditedEvent {
  return {
    ...createBaseEvent(walletId, version),
    eventType: 'MoneyCredited',
    playerId,
    amount,
    newBalance,
    reason,
  };
}

export function createMoneyDebitedEvent(
  walletId: string,
  playerId: string,
  amount: bigint,
  newBalance: bigint,
  reason: string,
  version: number,
): MoneyDebitedEvent {
  return {
    ...createBaseEvent(walletId, version),
    eventType: 'MoneyDebited',
    playerId,
    amount,
    newBalance,
    reason,
  };
}
