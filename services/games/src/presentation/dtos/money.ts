import { formatCents } from '@crash/domain';

/**
 * API money representation: integer cents (JSON number, exact below 2^53)
 * plus a decimal string formatted with bigint arithmetic.
 */
export function centsField(cents: bigint): { cents: number; decimal: string } {
  return { cents: Number(cents), decimal: formatCents(cents) };
}
