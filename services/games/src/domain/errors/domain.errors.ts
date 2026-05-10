import { BetStatus } from '@/domain/entities/bet.entity';

/**
 * Domain-specific exceptions for the Games bounded context.
 * All domain errors extend this base class for consistent error handling.
 *
 * Each error carries a stable `code` string for frontend consumption
 * and a user-friendly `message` (no internal IDs/UUIDs).
 */

export class DomainError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BetBelowMinimumError extends DomainError {
  constructor(amount: bigint) {
    const cents = Number(amount) / 100;
    super(`Bet amount $${cents.toFixed(2)} is below minimum of $1.00`, 'BET_BELOW_MINIMUM');
  }
}

export class BetAboveMaximumError extends DomainError {
  constructor(amount: bigint) {
    const cents = Number(amount) / 100;
    super(`Bet amount $${cents.toFixed(2)} exceeds maximum of $1,000.00`, 'BET_ABOVE_MAXIMUM');
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

export class BetAlreadyCashedOutError extends DomainError {
  constructor() {
    super('This bet has already been cashed out', 'BET_ALREADY_CASHED_OUT');
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

export class RoundAlreadyExistsError extends DomainError {
  constructor() {
    super('Round already exists', 'ROUND_ALREADY_EXISTS');
  }
}

export class InvalidSeedError extends DomainError {
  constructor(seed: string) {
    super(`Invalid seed: ${seed}`, 'INVALID_SEED');
  }
}

export class VerificationFailedError extends DomainError {
  constructor() {
    super('Verification failed for this round', 'VERIFICATION_FAILED');
  }
}

export class OptimisticLockError extends DomainError {
  constructor() {
    super('Concurrent update conflict, please try again', 'OPTIMISTIC_LOCK');
  }
}

export class InvalidBetStateError extends DomainError {
  constructor(currentState: BetStatus, attemptedAction: string) {
    super(`Cannot ${attemptedAction} a bet in ${currentState} state`, 'INVALID_BET_STATE');
  }
}

export class InvalidRoundStateError extends DomainError {
  constructor(currentState: string, attemptedAction: string) {
    super(`Cannot ${attemptedAction} a round in ${currentState} state`, 'INVALID_ROUND_STATE');
  }
}

export class SeedNotAvailableError extends DomainError {
  constructor() {
    super('Results are not available until the round crashes', 'SEED_NOT_AVAILABLE');
  }
}

export class InvalidIdempotencyKeyError extends DomainError {
  constructor() {
    super('Invalid request, please try again', 'INVALID_IDEMPOTENCY_KEY');
  }
}
