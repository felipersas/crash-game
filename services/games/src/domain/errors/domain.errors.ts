import { BetStatus } from '@prisma/client';

/**
 * Domain-specific exceptions for the Games bounded context.
 * All domain errors extend this base class for consistent error handling.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a bet amount is below the minimum allowed.
 */
export class BetBelowMinimumError extends DomainError {
  constructor(amount: bigint) {
    const cents = Number(amount) / 100;
    super(`Bet amount $${cents.toFixed(2)} is below minimum of $1.00`);
  }
}

/**
 * Thrown when a bet amount is above the maximum allowed.
 */
export class BetAboveMaximumError extends DomainError {
  constructor(amount: bigint) {
    const cents = Number(amount) / 100;
    super(`Bet amount $${cents.toFixed(2)} is above maximum of $1,000.00`);
  }
}

/**
 * Thrown when attempting to place a bet on a round that is not accepting bets.
 */
export class RoundNotAcceptingBetsError extends DomainError {
  constructor(roundId: string) {
    super(`Round ${roundId} is not accepting bets`);
  }
}

/**
 * Thrown when a player attempts to bet twice in the same round.
 */
export class DuplicateBetError extends DomainError {
  constructor(playerId: string, roundId: string) {
    super(`Player ${playerId} already has a bet in round ${roundId}`);
  }
}

/**
 * Thrown when attempting to cash out without an active bet.
 */
export class NoActiveBetError extends DomainError {
  constructor(playerId: string, roundId: string) {
    super(`Player ${playerId} has no active bet in round ${roundId}`);
  }
}

/**
 * Thrown when attempting to cash out after the round has crashed.
 */
export class RoundAlreadyCrashedError extends DomainError {
  constructor(roundId: string, crashPoint: number) {
    super(`Round ${roundId} already crashed at ${crashPoint.toFixed(2)}x`);
  }
}

/**
 * Thrown when attempting to cash out a bet that was already cashed out.
 */
export class BetAlreadyCashedOutError extends DomainError {
  constructor(betId: string) {
    super(`Bet ${betId} has already been cashed out`);
  }
}

/**
 * Thrown when a round cannot be found.
 */
export class RoundNotFoundError extends DomainError {
  constructor(roundId: string) {
    super(`Round not found: ${roundId}`);
  }
}

/**
 * Thrown when a bet cannot be found.
 */
export class BetNotFoundError extends DomainError {
  constructor(betId: string) {
    super(`Bet not found: ${betId}`);
  }
}

/**
 * Thrown when attempting to create a round that already exists.
 */
export class RoundAlreadyExistsError extends DomainError {
  constructor(roundId: string) {
    super(`Round already exists: ${roundId}`);
  }
}

/**
 * Thrown when an invalid seed is provided for provably fair algorithm.
 */
export class InvalidSeedError extends DomainError {
  constructor(seed: string) {
    super(`Invalid seed for provably fair algorithm: ${seed}`);
  }
}

/**
 * Thrown when verification of provably fair crash point fails.
 */
export class VerificationFailedError extends DomainError {
  constructor(roundId: string) {
    super(`Verification failed for round ${roundId}`);
  }
}

/**
 * Thrown when an optimistic lock conflict occurs during concurrent updates.
 * This happens when multiple processes try to update the same entity simultaneously.
 */
export class OptimisticLockError extends DomainError {
  constructor(entityId: string, expectedVersion: number) {
    super(`Optimistic lock conflict for entity ${entityId} (expected version ${expectedVersion})`);
  }
}

/**
 * Thrown when attempting an invalid bet state transition.
 */
export class InvalidBetStateError extends DomainError {
  constructor(betId: string, currentState: BetStatus, attemptedAction: string) {
    super(`Cannot ${attemptedAction} bet ${betId} in ${currentState} state`);
  }
}

/**
 * Thrown when attempting an invalid round state transition.
 */
export class InvalidRoundStateError extends DomainError {
  constructor(roundId: string, currentState: string, attemptedAction: string) {
    super(`Cannot ${attemptedAction} round ${roundId} in ${currentState} state`);
  }
}

/**
 * Thrown when attempting to access the seed before the round crashes.
 * The seed must remain secret until the round ends for provably fair gaming.
 */
export class SeedNotAvailableError extends DomainError {
  constructor(roundId: string) {
    super(`Seed is not available for round ${roundId} until it crashes`);
  }
}

/**
 * Thrown when attempting to cash out with an invalid idempotency key format.
 */
export class InvalidIdempotencyKeyError extends DomainError {
  constructor(key: string) {
    super(`Invalid idempotency key: ${key} (must be a valid UUID)`);
  }
}
