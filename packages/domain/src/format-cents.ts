/**
 * Formats integer cents as a signed decimal string using bigint arithmetic only.
 * @example formatCents(1099n) // "10.99"
 * @example formatCents(-50n)  // "-0.50"
 */
export function formatCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
