/**
 * Money formatting utilities using pure bigint arithmetic.
 * Avoids floating-point division that loses precision on large values.
 */

export function formatMoney(cents: number | bigint): string {
  const centsBig = typeof cents === 'bigint' ? cents : BigInt(cents);
  const absAmount = centsBig < BigInt(0) ? -centsBig : centsBig;
  const whole = absAmount / BigInt(100);
  const fractional = absAmount % BigInt(100);
  const sign = centsBig < BigInt(0) ? '-' : '';
  const decimal = `${whole}.${fractional.toString().padStart(2, '0')}`;
  return `$${sign}${decimal}`;
}

export function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(2)}x`;
}

export function calculatePayout(betCents: number, multiplier: number): number {
  return Math.floor(Math.round(betCents * multiplier * 100) / 100);
}
