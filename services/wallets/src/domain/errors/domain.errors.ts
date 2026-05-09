/**
 * Domain-specific exceptions for the Wallet bounded context.
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

export class InsufficientFundsError extends DomainError {
  constructor(
    public readonly currentBalance: bigint,
    public readonly attemptedAmount: bigint,
  ) {
    const balance = Number(currentBalance) / 100;
    const attempted = Number(attemptedAmount) / 100;
    super(
      `Insufficient funds: balance is $${balance.toFixed(2)}, attempted $${attempted.toFixed(2)}`,
      'INSUFFICIENT_FUNDS',
    );
  }
}

export class InvalidMoneyAmountError extends DomainError {
  constructor(amount: string | number) {
    super(`Invalid amount: ${String(amount)}`, 'INVALID_MONEY_AMOUNT');
  }
}

export class NegativeMoneyError extends DomainError {
  constructor(amount: bigint) {
    const cents = Number(amount) / 100;
    super(`Negative amount not allowed: $${cents.toFixed(2)}`, 'NEGATIVE_MONEY');
  }
}

export class WalletAlreadyExistsError extends DomainError {
  constructor() {
    super('Wallet already exists', 'WALLET_ALREADY_EXISTS');
  }
}

export class WalletNotFoundError extends DomainError {
  constructor() {
    super('Wallet not found', 'WALLET_NOT_FOUND');
  }
}

export class OptimisticLockError extends DomainError {
  constructor() {
    super('Concurrent update conflict, please try again', 'OPTIMISTIC_LOCK');
  }
}
