/**
 * Money Value Object - Encapsulates monetary values with precision guarantees.
 *
 * CRITICAL: Uses bigint internally to store cents, avoiding floating-point issues.
 * NEVER use number/float for money - this is immediate disqualification per project rules.
 *
 * Money is immutable - all operations return new instances.
 */

import { InvalidMoneyAmountError, NegativeMoneyError } from '../errors/domain.errors';

export class Money {
  private readonly amount: bigint;

  private constructor(amount: bigint) {
    this.amount = amount;
  }

  /**
   * Create Money from cents as bigint.
   * @example Money.fromCents(1099n) // $10.99
   */
  static fromCents(cents: bigint): Money {
    if (cents < 0n) {
      throw new NegativeMoneyError(cents);
    }
    return new Money(cents);
  }

  /**
   * Create Money from decimal string representation.
   * @example Money.fromDecimal("10.99") // $10.99
   * @example Money.fromDecimal("10") // $10.00
   * @example Money.fromDecimal("10.5") // $10.50
   * @example Money.fromDecimal("10.999") // $10.99 (truncated to 2 decimals)
   */
  static fromDecimal(decimal: string): Money {
    const trimmed = decimal.trim();

    if (trimmed.startsWith('-')) {
      throw new NegativeMoneyError(0n);
    }
    if (!/^\d+(\.\d*)?$/.test(trimmed)) {
      throw new InvalidMoneyAmountError(decimal);
    }

    const [whole = '0', fractional = ''] = trimmed.split('.');
    const truncatedFractional = fractional.slice(0, 2).padEnd(2, '0');
    const cents = BigInt(whole) * 100n + BigInt(truncatedFractional);

    return new Money(cents);
  }

  /**
   * Create Money with zero amount.
   */
  static zero(): Money {
    return new Money(0n);
  }

  /**
   * Add two Money values, returning a new Money instance.
   */
  add(other: Money): Money {
    return new Money(this.amount + other.amount);
  }

  /**
   * Subtract other Money from this, returning a new Money instance.
   */
  subtract(other: Money): Money {
    const result = this.amount - other.amount;
    if (result < 0n) {
      throw new NegativeMoneyError(result);
    }
    return new Money(result);
  }

  /**
   * Multiply Money by a factor, returning a new Money instance.
   */
  multiply(factor: number): Money {
    if (factor < 0) {
      throw new InvalidMoneyAmountError(`Cannot multiply by negative factor: ${factor}`);
    }

    const result = (this.amount * BigInt(Math.round(factor * 100))) / 100n;
    return new Money(result);
  }

  /**
   * Check if this Money is greater than other.
   */
  isGreaterThan(other: Money): boolean {
    return this.amount > other.amount;
  }

  /**
   * Check if this Money is less than other.
   */
  isLessThan(other: Money): boolean {
    return this.amount < other.amount;
  }

  /**
   * Check if this Money equals other (value-based equality).
   */
  equals(other: Money): boolean {
    return this.amount === other.amount;
  }

  /**
   * Check if this Money is zero.
   */
  isZero(): boolean {
    return this.amount === 0n;
  }

  /**
   * Get the internal amount in cents as bigint.
   */
  toCents(): bigint {
    return this.amount;
  }

  /**
   * Convert Money to decimal string format for display.
   * Uses pure bigint arithmetic to avoid Number precision loss on large values.
   * @returns Decimal string (e.g., "10.99" for $10.99)
   */
  toDecimal(): string {
    const absAmount = this.amount < 0n ? -this.amount : this.amount;
    const whole = absAmount / 100n;
    const fractional = absAmount % 100n;
    const sign = this.amount < 0n ? '-' : '';
    return `${sign}${whole}.${fractional.toString().padStart(2, '0')}`;
  }

  /**
   * String representation for logging/debugging.
   */
  toString(): string {
    return `$${this.toDecimal()}`;
  }

  /**
   * JSON representation for serialization.
   * Returns cents as string to avoid JSON.stringify TypeError with bigint.
   */
  toJSON(): { cents: string; decimal: string } {
    return {
      cents: String(this.amount),
      decimal: this.toDecimal(),
    };
  }
}
