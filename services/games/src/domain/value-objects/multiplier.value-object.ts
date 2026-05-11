/**
 * Multiplier Value Object - Represents the current game multiplier.
 *
 * The multiplier starts at 1.00x and increases exponentially during the round.
 * Players can cash out at any time to lock in their winnings.
 */

export class Multiplier {
  private static readonly MIN_VALUE = 1.0;
  private readonly value: number;

  private constructor(value: number) {
    this.value = value;
  }

  /**
   * Create a multiplier starting at 1.00x.
   */
  static start(): Multiplier {
    return new Multiplier(Multiplier.MIN_VALUE);
  }

  /**
   * Create multiplier from a specific value.
   */
  static fromValue(value: number): Multiplier {
    if (value < Multiplier.MIN_VALUE) {
      throw new Error(`Multiplier must be at least ${Multiplier.MIN_VALUE}`);
    }
    return new Multiplier(value);
  }

  /**
   * Calculate the multiplier after a given duration using exponential growth.
   * Formula: M(t) = e^(k * t)
   * where k is a growth rate constant and t is time in seconds
   *
   * With k=0.06, the multiplier grows approximately like:
   * - 1.00x at t=0
   * - 1.06x at t=1s
   * - 1.50x at t=7s
   * - 2.00x at t=11.5s
   * - 3.00x at t=18s
   * - 10.00x at t=39s
   */
  static afterDuration(seconds: number, growthRate: number = 0.06): Multiplier {
    const value = Math.exp(growthRate * seconds);
    return new Multiplier(value);
  }

  /**
   * Get the multiplier value.
   */
  getValue(): number {
    return this.value;
  }

  /**
   * Check if multiplier is greater than another.
   */
  isGreaterThan(other: Multiplier): boolean {
    return this.value > other.value;
  }

  /**
   * Check if multiplier is less than another.
   */
  isLessThan(other: Multiplier): boolean {
    return this.value < other.value;
  }

  /**
   * Calculate potential winnings for a bet amount.
   */
  calculateWinning(betCents: bigint): bigint {
    // Integer arithmetic: profit = floor(bet * (multiplier - 1))
    const profitMultiplier = Math.floor((this.value - 1) * 100);
    return (betCents * BigInt(profitMultiplier)) / 100n;
  }

  /**
   * Calculate total payout (bet + winning).
   */
  calculatePayout(betCents: bigint): bigint {
    return betCents + this.calculateWinning(betCents);
  }

  /**
   * Format as string with 2 decimal places.
   */
  toString(): string {
    return `${this.value.toFixed(2)}x`;
  }

  /**
   * Convert to plain object for persistence.
   */
  toPersistence(): { value: number } {
    return { value: this.value };
  }

  /**
   * Convert to JSON.
   */
  toJSON(): { value: number; formatted: string } {
    return {
      value: this.value,
      formatted: this.toString(),
    };
  }
}
