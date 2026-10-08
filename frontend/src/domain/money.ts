/**
 * Money utilities using pure bigint arithmetic.
 *
 * All monetary values on the client are integer CENTS (number from JSON,
 * string from the wallet API, or bigint). Never divide cents by 100 as a
 * float — use these helpers instead.
 */

/** Integer cents in any of the shapes the API returns. */
export type Cents = number | bigint | string;

const CENTS_PER_UNIT = BigInt(100);
const ZERO = BigInt(0);

export function toCentsBigInt(cents: Cents): bigint {
  return typeof cents === 'bigint' ? cents : BigInt(cents);
}

/** 1050 → "10.50", -500 → "-5.00" (no currency symbol). */
export function centsToDecimal(cents: Cents): string {
  const value = toCentsBigInt(cents);
  const abs = value < ZERO ? -value : value;
  const sign = value < ZERO ? '-' : '';
  const whole = abs / CENTS_PER_UNIT;
  const fractional = (abs % CENTS_PER_UNIT).toString().padStart(2, '0');
  return `${sign}${whole}.${fractional}`;
}

/** 1050 → "$10.50", -500 → "-$5.00". */
export function formatMoney(cents: Cents): string {
  const decimal = centsToDecimal(cents);
  return decimal.startsWith('-') ? `-$${decimal.slice(1)}` : `$${decimal}`;
}

export function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(2)}x`;
}

/**
 * Truncates a float multiplier to integer hundredths (2.479 → 247).
 * Rounds at 1e-6 first so float representation error (2.01 * 100 = 200.999…)
 * does not lose a hundredth. Mirrors the games service Multiplier value object.
 */
export function multiplierToHundredths(multiplier: number): bigint {
  return BigInt(Math.floor(Math.round(multiplier * 1_000_000) / 10_000));
}

/** Payout in integer cents: floor(betCents × truncated multiplier). */
export function calculatePayout(betCents: number, multiplier: number): number {
  return Number(
    (BigInt(betCents) * multiplierToHundredths(multiplier)) / CENTS_PER_UNIT,
  );
}
