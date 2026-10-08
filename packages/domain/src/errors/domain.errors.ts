import { formatCents } from '../format-cents';

/**
 * Base class for every domain error across bounded contexts.
 *
 * Each error carries a stable `code` for API consumers and a user-friendly
 * `message` (no internal IDs). Bounded contexts extend this class so that
 * presentation layers can recognise any domain error with a single
 * `instanceof DomainError` check.
 */
export abstract class DomainError extends Error {
  readonly code: string;

  protected constructor(message: string, code: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    // Ensure prototype chain is correct for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when attempting to create a Money value with an invalid amount.
 */
export class InvalidMoneyAmountError extends DomainError {
  constructor(amount: string | number) {
    super(
      `Invalid money amount: ${String(amount)}. Amount must be a non-negative number.`,
      'INVALID_MONEY_AMOUNT',
    );
  }
}

/**
 * Thrown when a negative money value is encountered where only positive is allowed.
 */
export class NegativeMoneyError extends DomainError {
  constructor(amountCents: bigint) {
    super(`Negative money value not allowed: $${formatCents(amountCents)}`, 'NEGATIVE_MONEY');
  }
}

/**
 * Thrown when an idempotency key is not a valid UUID v4.
 */
export class InvalidIdempotencyKeyError extends DomainError {
  constructor() {
    super('Invalid idempotency key: must be a valid UUID v4', 'INVALID_IDEMPOTENCY_KEY');
  }
}
