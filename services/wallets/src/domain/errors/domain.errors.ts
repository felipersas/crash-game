import { DomainError, formatCents } from '@crash/domain';

/**
 * Domain-specific exceptions for the Wallet bounded context.
 *
 * Each error carries a stable `code` string for frontend consumption
 * and a user-friendly `message` (no internal IDs/UUIDs).
 */

export { DomainError };

export class InsufficientFundsError extends DomainError {
  constructor(
    readonly currentBalance: bigint,
    readonly attemptedAmount: bigint,
  ) {
    super(
      `Insufficient funds: balance is $${formatCents(currentBalance)}, attempted $${formatCents(attemptedAmount)}`,
      'INSUFFICIENT_FUNDS',
    );
  }
}

export class WalletNotFoundError extends DomainError {
  constructor() {
    super('Wallet not found', 'WALLET_NOT_FOUND');
  }
}

export class OptimisticLockError extends DomainError {
  constructor(aggregateId?: string) {
    super(
      aggregateId
        ? `Concurrent update conflict on wallet ${aggregateId}, please try again`
        : 'Concurrent update conflict, please try again',
      'OPTIMISTIC_LOCK',
    );
  }
}
