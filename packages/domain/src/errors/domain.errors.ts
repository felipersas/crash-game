/**
 * Domain-specific exceptions for shared domain components.
 * All domain errors extend this base class for consistent error handling.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Ensure prototype chain is correct for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when attempting to create a Money value with an invalid amount.
 */
export class InvalidMoneyAmountError extends DomainError {
  constructor(amount: string | number) {
    super(`Invalid money amount: ${String(amount)}. Amount must be a non-negative number.`);
  }
}

/**
 * Thrown when a negative money value is encountered where only positive is allowed.
 */
export class NegativeMoneyError extends DomainError {
  constructor(amount: bigint) {
    const cents = Number(amount) / 100;
    super(`Negative money value not allowed: $${cents.toFixed(2)}`);
  }
}
