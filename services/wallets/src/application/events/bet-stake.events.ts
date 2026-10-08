import type { DomainEvent } from '@crash/messaging';

/**
 * Integration events replying to the Games service in the bet saga.
 * They describe the outcome of debiting a bet stake and are keyed by round
 * (aggregateId = roundId) so Games can correlate them with its own aggregate.
 */

interface BetStakeEvent extends DomainEvent {
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amount: bigint;
}

/**
 * Stake debited → Games confirms the bet (PENDING → ACTIVE).
 */
export interface WalletDebitedEvent extends BetStakeEvent {
  readonly eventType: 'WalletDebited';
}

/**
 * Stake could not be debited → Games cancels the bet (PENDING → CANCELLED).
 */
export interface WalletDebitFailedEvent extends BetStakeEvent {
  readonly eventType: 'WalletDebitFailed';
  readonly reason: string;
}

export interface BetStakeRef {
  roundId: string;
  betId: string;
  playerId: string;
  amountCents: bigint;
}

const SAGA_EVENT_VERSION = 1;

export function createWalletDebitedEvent(stake: BetStakeRef): WalletDebitedEvent {
  return {
    eventType: 'WalletDebited',
    aggregateId: stake.roundId,
    occurredAt: new Date(),
    version: SAGA_EVENT_VERSION,
    roundId: stake.roundId,
    betId: stake.betId,
    playerId: stake.playerId,
    amount: stake.amountCents,
  };
}

export function createWalletDebitFailedEvent(
  stake: BetStakeRef,
  reason: string,
): WalletDebitFailedEvent {
  return {
    ...createWalletDebitedEvent(stake),
    eventType: 'WalletDebitFailed',
    reason,
  };
}
