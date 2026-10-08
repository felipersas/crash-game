/**
 * Seed Chain Value Object - Manages provably fair seed generation.
 *
 * Implements a hash chain where each seed commits to the next:
 * hash_chain[n] = H(seed_chain[n+1])
 *
 * This allows players to verify that the crash point was predetermined
 * and not manipulated after the round started.
 *
 * Example chain (simplified, 5 seeds):
 *   seed[4] (oldest, random)
 *   seed[3] = H(seed[4])
 *   seed[2] = H(seed[3])
 *   seed[1] = H(seed[2])
 *   seed[0] = H(seed[1]) ← current round
 *
 * Flow:
 * 1. Pre-generate N seeds on service startup
 * 2. Publish H(chain[0]) as initial commitment
 * 3. Round N uses seed[N], reveals it after crash
 * 4. Players verify: H(seed[N]) == published_hash_chain[N]
 * 5. Next round uses seed[N+1], etc.
 * 6. When chain runs low, generate new chain
 */

import { SeedChainExhaustedError } from '../errors/domain.errors';
import { bytesToHex, sha256, sha256Hex } from '../crypto/sha256';

export interface SeedChainData {
  readonly seeds: readonly string[]; // [seed_N, seed_N+1, ..., seed_0]
  readonly current: number; // Index of current seed
  readonly commitment: string; // H(seed_0) - initial commitment
}

export class SeedChain {
  private readonly seeds: readonly string[];
  private readonly current: number;
  private readonly commitment: string;

  private constructor(data: SeedChainData) {
    this.seeds = data.seeds;
    this.current = data.current;
    this.commitment = data.commitment;
  }

  /**
   * Generate a new seed chain with the specified size.
   *
   * @param size - Number of seeds to generate (default: 1000)
   * @param deterministicSeed - Optional string to derive a reproducible chain (testing only)
   */
  static async generate(size: number = 1000, deterministicSeed?: string): Promise<SeedChain> {
    const lastSeed = deterministicSeed
      ? bytesToHex(await sha256(new TextEncoder().encode(deterministicSeed)))
      : SeedChain.generateRandomSeed();

    return SeedChain.buildChain(lastSeed, size);
  }

  /**
   * Generate a deterministic seed chain from a string.
   * Useful for testing - produces reproducible crash points.
   */
  static async generateDeterministic(seedString: string, size: number = 100): Promise<SeedChain> {
    return SeedChain.generate(size, seedString);
  }

  /**
   * Build the chain backwards from its oldest seed: each seed = H(next_seed).
   * The commitment H(seeds[0]) is published BEFORE any round starts.
   */
  private static async buildChain(lastSeed: string, size: number): Promise<SeedChain> {
    const seeds: string[] = [lastSeed];

    let currentSeed = lastSeed;
    for (let i = 1; i < size; i++) {
      currentSeed = await sha256Hex(currentSeed);
      seeds.unshift(currentSeed);
    }

    return new SeedChain({
      seeds,
      current: 0,
      commitment: await sha256Hex(seeds[0]),
    });
  }

  /**
   * Restore from persisted seed chain data.
   */
  static fromPersistence(data: {
    seeds: string[];
    current: number;
    commitment: string;
  }): SeedChain {
    return new SeedChain(data);
  }

  /**
   * Create a minimal SeedChain from round persistence data.
   * Used when restoring a Round from database (single seed).
   *
   * NOTE: This creates a single-seed chain for backwards compatibility.
   * The actual seed chain is managed separately by SeedChainRepository.
   */
  static fromRoundPersistence(data: { currentSeed: string; currentHash: string }): SeedChain {
    return new SeedChain({
      seeds: [data.currentSeed],
      current: 0,
      commitment: data.currentHash,
    });
  }

  /**
   * Get the current seed (for the active round).
   * Only available after the round crashes.
   */
  getSeed(): string {
    if (this.current >= this.seeds.length) {
      throw new SeedChainExhaustedError();
    }
    return this.seeds[this.current];
  }

  /**
   * Get the hash of the current seed (commitment).
   * This is published BEFORE the round starts.
   *
   * Chain relationship: H(seeds[i]) = seeds[i-1]
   * The hash of the current seed is the previous seed in the array,
   * because the chain is built as seeds[i] = H(seeds[i+1]).
   */
  getCurrentSeedHash(): string {
    const currentIndex = this.current;

    // For the first seed, the hash is the commitment (= H(seeds[0]))
    if (currentIndex === 0) {
      return this.commitment;
    }

    // H(seeds[i]) = seeds[i-1] by chain construction
    return this.seeds[currentIndex - 1];
  }

  /**
   * Get the initial commitment (hash of seed[0]).
   * This is published when the service starts.
   */
  getCommitment(): string {
    return this.commitment;
  }

  /**
   * Move to the next seed in the chain.
   * Should be called after each round completes.
   */
  advance(): SeedChain {
    if (this.current >= this.seeds.length - 1) {
      throw new SeedChainExhaustedError();
    }

    return new SeedChain({
      seeds: this.seeds,
      current: this.current + 1,
      commitment: this.commitment,
    });
  }

  /**
   * Check if the chain needs to be regenerated.
   * Returns true when less than 10% of seeds remain.
   */
  needsRegeneration(): boolean {
    const threshold = Math.floor(this.seeds.length * 0.1);
    return this.current >= this.seeds.length - threshold;
  }

  /**
   * Get the number of seeds remaining.
   */
  getRemainingCount(): number {
    return this.seeds.length - this.current;
  }

  /**
   * Get the total number of seeds in the chain.
   */
  getTotalCount(): number {
    return this.seeds.length;
  }

  /**
   * Get the current position in the chain.
   */
  getCurrentPosition(): number {
    return this.current;
  }

  /**
   * Verify that a seed matches the committed hash.
   */
  static async verifySeed(seed: string, committedHash: string): Promise<boolean> {
    return (await sha256Hex(seed)) === committedHash;
  }

  /**
   * Generate a cryptographically secure random seed (32 bytes = 64 hex chars).
   */
  private static generateRandomSeed(): string {
    return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  }

  /**
   * Convert to plain object for persistence.
   */
  toPersistence(): SeedChainData {
    return {
      seeds: [...this.seeds], // Clone array
      current: this.current,
      commitment: this.commitment,
    };
  }

  /**
   * Get a summary for logging (does not expose seeds).
   */
  getSummary() {
    return {
      currentPosition: this.current,
      remaining: this.getRemainingCount(),
      total: this.getTotalCount(),
      commitment: this.commitment,
      needsRegeneration: this.needsRegeneration(),
    };
  }
}
