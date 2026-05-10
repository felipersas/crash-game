/**
 * Converts cents (integer) to decimal string representation.
 * e.g. 10050 -> "100.50"
 */
export function centsToDecimal(cents: number | bigint): string {
  return (Number(cents) / 100).toFixed(2);
}
