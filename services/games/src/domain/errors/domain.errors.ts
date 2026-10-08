import { DomainError, type Money } from '@crash/domain';

/**
 * Domain-specific exceptions for the Games bounded context.
 *
 * Each error carries a stable `code` string for frontend consumption
 * and a user-friendly `message` (no internal IDs/UUIDs).
 */

export { DomainError };

export class BetBelowMinimumError extends DomainError {
  constructor(amount: Money, minimum: Money) {
    super(
      `Bet amount $${amount.toDecimal()} is below minimum of $${minimum.toDecimal()}`,
      'BET_BELOW_MINIMUM',
    );
  }
}

export class BetAboveMaximumError extends DomainError {
  constructor(amount: Money, maximum: Money) {
    super(
      `Bet amount $${amount.toDecimal()} exceeds maximum of $${maximum.toDecimal()}`,
      'BET_ABOVE_MAXIMUM',
    );
  }
}

export class RoundNotAcceptingBetsError extends DomainError {
  constructor() {
    super('This round is no longer accepting bets', 'ROUND_NOT_ACCEPTING_BETS');
  }
}

export class DuplicateBetError extends DomainError {
  constructor() {
    super('You already placed a bet this round', 'DUPLICATE_BET');
  }
}

export class NoActiveBetError extends DomainError {
  constructor() {
    super('No active bet to cash out', 'NO_ACTIVE_BET');
  }
}

export class RoundAlreadyCrashedError extends DomainError {
  constructor(crashPoint: number) {
    super(`The round has already crashed at ${crashPoint.toFixed(2)}x`, 'ROUND_ALREADY_CRASHED');
  }
}

export class RoundNotFoundError extends DomainError {
  constructor() {
    super('Round not found', 'ROUND_NOT_FOUND');
  }
}

export class BetNotFoundError extends DomainError {
  constructor() {
    super('Bet not found', 'BET_NOT_FOUND');
  }
}

export class InvalidSeedError extends DomainError {
  constructor(seed: string) {
    super(`Invalid seed: ${seed}`, 'INVALID_SEED');
  }
}

export class SeedChainExhaustedError extends DomainError {
  constructor() {
    super('Seed chain exhausted - generate a new chain', 'SEED_CHAIN_EXHAUSTED');
  }
}

export class InvalidMultiplierError extends DomainError {
  constructor(value: number, minimum: number) {
    super(`Multiplier ${value} must be at least ${minimum}`, 'INVALID_MULTIPLIER');
  }
}

export class InvalidCrashPointError extends DomainError {
  constructor(value: number, minimum: number) {
    super(`Crash point ${value} must be at least ${minimum}`, 'INVALID_CRASH_POINT');
  }
}

export class OptimisticLockError extends DomainError {
  constructor() {
    super('Concurrent update conflict, please try again', 'OPTIMISTIC_LOCK');
  }
}

export class InvalidBetStateError extends DomainError {
  constructor(currentState: string, attemptedAction: string) {
    super(`Cannot ${attemptedAction} a bet in ${currentState} state`, 'INVALID_BET_STATE');
  }
}

export class InvalidRoundStateError extends DomainError {
  constructor(currentState: string, attemptedAction: string) {
    super(`Cannot ${attemptedAction} a round in ${currentState} state`, 'INVALID_ROUND_STATE');
  }
}

export class InvalidAutoCashOutMultiplierError extends DomainError {
  constructor(value: number, reason: string) {
    super(
      `Auto cash-out multiplier ${value} is invalid: ${reason}`,
      'INVALID_AUTO_CASHOUT_MULTIPLIER',
    );
  }
}

export class SeedNotAvailableError extends DomainError {
  constructor() {
    super('Results are not available until the round crashes', 'SEED_NOT_AVAILABLE');
  }
}
