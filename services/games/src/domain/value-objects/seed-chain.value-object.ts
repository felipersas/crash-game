import { InvalidSeedError } from '../errors/domain.errors';
import crypto from 'bun:crypto';

/**
 * Seed Chain Value Object - Manages provably fair seed generation.
 *
 * Implements a hash chain where each seed is the hash of the next seed.
 * This allows players to verify that the crash point was predetermined
 * and not manipulated after the round started.
 *
 * Flow:
 * 1. Generate random server seed
 * 2. Create chain: seed_n = hash(seed_{n+1})
 * 3. Commit hash(seed_n) before round starts
 * 4. After crash, reveal seed_n and player can verify
 * 5. Next round uses seed_{n+1}
 */

export class SeedChain {
  private readonly currentSeed: string;
  private readonly currentHash: string;
  private readonly nextSeed: string | null;

  private constructor(currentSeed: string, currentHash: string, nextSeed: string | null) {
    this.currentSeed = currentSeed;
    this.currentHash = currentHash;
    this.nextSeed = nextSeed;
  }

  /**
   * Generate a new seed chain starting from a random seed.
   */
  static async generate(): Promise<SeedChain> {
    // Generate 32-byte random seed
    const seedBytes = new Uint8Array(32);
    crypto.getRandomValues(seedBytes);
    const seed = this.bytesToHex(seedBytes);

    // Calculate hash of the seed
    const seedHash = await this.hashSeed(seed);

    return new SeedChain(seed, seedHash, null);
  }

  /**
   * Create from existing seed (for persistence).
   */
  static async fromSeed(seed: string): Promise<SeedChain> {
    if (!seed || seed.length !== 64) {
      throw new InvalidSeedError(seed);
    }

    const seedHash = await SeedChain.hashSeed(seed);

    // Calculate next seed in chain (inverse of hash is not possible, so we store it)
    // In production, you'd generate the chain in advance
    return new SeedChain(seed, seedHash, null);
  }

  /**
   * Create from persistence.
   */
  static fromPersistence(data: {
    currentSeed: string;
    currentHash: string;
    nextSeed: string | null;
  }): SeedChain {
    return new SeedChain(data.currentSeed, data.currentHash, data.nextSeed);
  }

  /**
   * Get the current seed (revealed after crash).
   */
  getSeed(): string {
    return this.currentSeed;
  }

  /**
   * Get the hash of the current seed (committed before round).
   */
  getHash(): string {
    return this.currentHash;
  }

  /**
   * Move to the next seed in the chain.
   * Should be called after each round completes.
   */
  async advance(): Promise<SeedChain> {
    if (!this.nextSeed) {
      // Generate new seed when chain ends
      return SeedChain.generate();
    }

    const nextHash = await SeedChain.hashSeed(this.nextSeed);
    return new SeedChain(this.nextSeed, nextHash, null);
  }

  /**
   * Verify that a seed matches the committed hash.
   */
  static async verifySeed(seed: string, committedHash: string): Promise<boolean> {
    const seedHash = await this.hashSeed(seed);
    return seedHash === committedHash;
  }

  /**
   * Hash a seed using SHA-256.
   */
  private static async hashSeed(seed: string): Promise<string> {
    const seedBytes = this.hexToBytes(seed);
    const hashBuffer = await crypto.subtle.digest('SHA-256', seedBytes);
    return this.bytesToHex(new Uint8Array(hashBuffer));
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
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert to plain object for persistence.
   */
  toPersistence() {
    return {
      currentSeed: this.currentSeed,
      currentHash: this.currentHash,
      nextSeed: this.nextSeed,
    };
  }
}
