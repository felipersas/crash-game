/**
 * Auto Cash-Out Repository Interface - Application Layer
 *
 * Abstraction for auto cash-out target storage.
 * Decouples use cases and workers from the concrete Redis implementation.
 */

export interface IAutoCashOutRepository {
  addTarget(roundId: string, playerId: string, multiplier: number): Promise<void>;
  removeTarget(roundId: string, playerId: string): Promise<void>;
  fetchAndRemoveEligible(
    roundId: string,
    currentMultiplier: number,
  ): Promise<Array<{ playerId: string; targetMultiplier: number }>>;
  acquireLock(roundId: string, playerId: string): Promise<boolean>;
  releaseLock(roundId: string, playerId: string): Promise<void>;
  getCachedResult(
    roundId: string,
    playerId: string,
  ): Promise<{ multiplier: number; payoutCents: bigint } | null>;
  cacheResult(
    roundId: string,
    playerId: string,
    result: { multiplier: number; payoutCents: bigint },
  ): Promise<void>;
  clearRound(roundId: string): Promise<void>;
}
