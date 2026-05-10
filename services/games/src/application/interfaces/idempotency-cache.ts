/**
 * Idempotency Cache Interface - Application Layer
 *
 * Abstraction for cashout idempotency checks.
 * Decouples use cases from the concrete Redis implementation.
 */

export interface CashoutIdempotencyResult {
  betId: string;
  roundId: string;
  playerId: string;
  cashOutMultiplier: number;
  payoutCents: number;
  cashedOutAt: string;
}

export interface IIdempotencyCache {
  checkCashoutIdempotency(idempotencyKey: string): Promise<CashoutIdempotencyResult | null>;
  setCashoutIdempotency(idempotencyKey: string, result: CashoutIdempotencyResult, ttl?: number): Promise<boolean>;
}
