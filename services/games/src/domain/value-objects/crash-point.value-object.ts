import { InvalidSeedError } from '../errors/domain.errors';

/**
 * Crash Point Value Object - Represents the predetermined crash multiplier.
 *
 * This value object encapsulates the provably fair crash point generation.
 * The crash point is predetermined before the round starts using a hash chain.
 */

export class CrashPoint {
  private static readonly SEED_PRECISION = 52; // Number of bits from seed
  private static readonly HOUSE_EDGE = 0.04; // 4% house edge
  private static readonly MIN_CRASH = 1.00; // Minimum crash point
  private readonly value: number;

  private constructor(value: number) {
    this.value = value;
  }

  /**
   * Generate a crash point from a seed using provably fair algorithm.
   */
  static async fromSeed(seed: string): Promise<CrashPoint> {
    if (!seed || seed.length < 10) {
      throw new InvalidSeedError(seed);
    }

    const seedBytes = CrashPoint.hexToBytes(seed);
    const hashBuffer = await crypto.subtle.digest('SHA-256', seedBytes as BufferSource);
    const hashArray = new Uint8Array(hashBuffer);

    const first52Bits = this.extractBits(hashArray, CrashPoint.SEED_PRECISION);
    const max52Bit = Math.pow(2, CrashPoint.SEED_PRECISION);
    const result = first52Bits / max52Bit;
    const houseEdgeAdjusted = (1 - CrashPoint.HOUSE_EDGE) / result;
    const crashPoint = Math.max(CrashPoint.MIN_CRASH, houseEdgeAdjusted);

    return new CrashPoint(crashPoint);
  }

  /**
   * Create Crash Point with a specific value.
   */
  static fromValue(value: number): CrashPoint {
    if (value < CrashPoint.MIN_CRASH) {
      throw new Error(`Crash point must be at least ${CrashPoint.MIN_CRASH}`);
    }
    return new CrashPoint(value);
  }

  getValue(): number {
    return this.value;
  }

  shouldCrashAt(multiplier: number): boolean {
    return multiplier >= this.value;
  }

  toString(): string {
    return `${this.value.toFixed(2)}x`;
  }

  private static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  private static extractBits(bytes: Uint8Array, bitCount: number): number {
    let result = 0n;
    let bitsCollected = 0;

    for (const byte of bytes) {
      if (bitsCollected + 8 >= bitCount) {
        const bitsNeeded = bitCount - bitsCollected;
        const mask = (1n << BigInt(bitsNeeded)) - 1n;
        result = (result << BigInt(bitsNeeded)) | (BigInt(byte) >> BigInt(8 - bitsNeeded)) & mask;
        break;
      }
      result = (result << 8n) | BigInt(byte);
      bitsCollected += 8;
    }

    return Number(result);
  }

  toPersistence(): { value: number } {
    return { value: this.value };
  }

  toJSON(): { value: number; formatted: string } {
    return {
      value: this.value,
      formatted: this.toString(),
    };
  }
}
