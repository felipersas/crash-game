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
   * @returns A new SeedChain with randomly generated seeds
   */
  static async generate(size: number = 1000, deterministicSeed?: string): Promise<SeedChain> {
    // Use deterministic seed if provided (for testing)
    if (deterministicSeed) {
      return SeedChain.generateDeterministic(deterministicSeed, size);
    }

    const seeds: string[] = [];

    // Generate the last (oldest) seed randomly
    const lastSeed = await SeedChain.generateRandomSeed();
    seeds.push(lastSeed);

    // Build the chain backwards: each seed = H(next_seed)
    let currentSeed = lastSeed;
    for (let i = 1; i < size; i++) {
      currentSeed = await SeedChain.hashSeed(currentSeed);
      seeds.unshift(currentSeed); // Add to front (newest first)
    }

    // The commitment is the hash of the first (newest) seed
    // This is published BEFORE any round starts
    const commitment = await SeedChain.hashSeed(seeds[0]);

    return new SeedChain({
      seeds,
      current: 0,
      commitment,
    });
  }

  /**
   * Generate a deterministic seed chain from a string.
   * Useful for testing - produces reproducible crash points.
   *
   * Pre-computed seeds for common crash points:
   * - "test-crash-1.50" → ~1.50x
   * - "test-crash-2.00" → ~2.00x
   * - "test-crash-3.00" → ~3.00x
   * - "test-crash-5.00" → ~5.00x
   * - "test-crash-10.0" → ~10.0x
   */
  static async generateDeterministic(seedString: string, size: number = 100): Promise<SeedChain> {
    // Derive a 32-byte seed from the string using SHA-256
    const stringBytes = new TextEncoder().encode(seedString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', stringBytes);
    const lastSeed = SeedChain.bytesToHex(new Uint8Array(hashBuffer));

    const seeds: string[] = [lastSeed];

    // Build the chain backwards
    let currentSeed = lastSeed;
    for (let i = 1; i < size; i++) {
      currentSeed = await SeedChain.hashSeed(currentSeed);
      seeds.unshift(currentSeed);
    }

    const commitment = await SeedChain.hashSeed(seeds[0]);

    return new SeedChain({
      seeds,
      current: 0,
      commitment,
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
      throw new Error('No more seeds in chain');
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
      throw new Error('Seed chain exhausted - generate new chain');
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
    const seedHash = await SeedChain.hashSeed(seed);
    return seedHash === committedHash;
  }

  /**
   * Generate a cryptographically secure random seed (32 bytes = 64 hex chars).
   */
  private static async generateRandomSeed(): Promise<string> {
    const seedBytes = new Uint8Array(32);
    crypto.getRandomValues(seedBytes);
    return SeedChain.bytesToHex(seedBytes);
  }

  /**
   * Hash a seed using SHA-256 (async).
   */
  private static async hashSeed(seed: string): Promise<string> {
    const seedBytes = SeedChain.hexToBytes(seed);
    const hashBuffer = await crypto.subtle.digest('SHA-256', seedBytes as BufferSource);
    return SeedChain.bytesToHex(new Uint8Array(hashBuffer));
  }

  /**
   * Convert hex string to bytes.
   */
  private static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  /**
   * Convert bytes to hex string.
   */
  private static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
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
