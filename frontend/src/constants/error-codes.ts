/**
 * Centralized error codes and user-facing messages.
 *
 * These codes are the stable contract between backend and frontend.
 * Backend sends `code` in error responses; frontend maps codes to
 * user-friendly messages here (single source of truth).
 */

export const ErrorCodes = {
  // Bet errors
  BET_BELOW_MINIMUM: 'BET_BELOW_MINIMUM',
  BET_ABOVE_MAXIMUM: 'BET_ABOVE_MAXIMUM',
  DUPLICATE_BET: 'DUPLICATE_BET',
  NO_ACTIVE_BET: 'NO_ACTIVE_BET',
  BET_NOT_FOUND: 'BET_NOT_FOUND',
  BET_ALREADY_CASHED_OUT: 'BET_ALREADY_CASHED_OUT',
  INVALID_BET_STATE: 'INVALID_BET_STATE',
  INVALID_IDEMPOTENCY_KEY: 'INVALID_IDEMPOTENCY_KEY',

  // Round errors
  ROUND_NOT_ACCEPTING_BETS: 'ROUND_NOT_ACCEPTING_BETS',
  ROUND_ALREADY_CRASHED: 'ROUND_ALREADY_CRASHED',
  ROUND_NOT_FOUND: 'ROUND_NOT_FOUND',
  ROUND_ALREADY_EXISTS: 'ROUND_ALREADY_EXISTS',
  INVALID_ROUND_STATE: 'INVALID_ROUND_STATE',

  // Wallet errors
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_ALREADY_EXISTS: 'WALLET_ALREADY_EXISTS',
  INVALID_MONEY_AMOUNT: 'INVALID_MONEY_AMOUNT',
  NEGATIVE_MONEY: 'NEGATIVE_MONEY',

  // System errors
  OPTIMISTIC_LOCK: 'OPTIMISTIC_LOCK',
  INVALID_SEED: 'INVALID_SEED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  SEED_NOT_AVAILABLE: 'SEED_NOT_AVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * User-facing messages mapped by error code.
 * Falls back to the backend `message` field if code is unmapped.
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Bet
  [ErrorCodes.BET_BELOW_MINIMUM]: 'Minimum bet is $1.00',
  [ErrorCodes.BET_ABOVE_MAXIMUM]: 'Maximum bet is $1,000.00',
  [ErrorCodes.DUPLICATE_BET]: 'You already placed a bet this round',
  [ErrorCodes.NO_ACTIVE_BET]: 'No active bet to cash out',
  [ErrorCodes.BET_NOT_FOUND]: 'Bet not found',
  [ErrorCodes.BET_ALREADY_CASHED_OUT]: 'Already cashed out',
  [ErrorCodes.INVALID_BET_STATE]: 'Cannot perform this action right now',
  [ErrorCodes.INVALID_IDEMPOTENCY_KEY]: 'Invalid request, please try again',

  // Round
  [ErrorCodes.ROUND_NOT_ACCEPTING_BETS]: 'Betting is closed for this round',
  [ErrorCodes.ROUND_ALREADY_CRASHED]: 'The round has already crashed',
  [ErrorCodes.ROUND_NOT_FOUND]: 'Round not found',
  [ErrorCodes.ROUND_ALREADY_EXISTS]: 'Round already exists',
  [ErrorCodes.INVALID_ROUND_STATE]: 'Invalid round state',

  // Wallet
  [ErrorCodes.INSUFFICIENT_FUNDS]: 'Not enough balance',
  [ErrorCodes.WALLET_NOT_FOUND]: 'Wallet not found',
  [ErrorCodes.WALLET_ALREADY_EXISTS]: 'Wallet already exists',
  [ErrorCodes.INVALID_MONEY_AMOUNT]: 'Invalid amount',
  [ErrorCodes.NEGATIVE_MONEY]: 'Invalid amount',

  // System
  [ErrorCodes.OPTIMISTIC_LOCK]: 'Concurrent update, please retry',
  [ErrorCodes.INVALID_SEED]: 'Invalid seed',
  [ErrorCodes.VERIFICATION_FAILED]: 'Verification failed',
  [ErrorCodes.SEED_NOT_AVAILABLE]: 'Results not available yet',
};

/**
 * Resolve a user-facing error message.
 * Prefers the local message map; falls back to the backend message,
 * then to a generic default.
 */
export function getErrorMessage(code?: string, fallback?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return fallback ?? 'Something went wrong. Please try again.';
}
