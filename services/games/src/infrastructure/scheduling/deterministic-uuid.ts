import { createHash } from 'node:crypto';

/**
 * Builds a UUID v4-shaped identifier from a SHA-256 of the inputs.
 * The same inputs always yield the same UUID, which makes retried
 * auto cash-out jobs share one idempotency key.
 */
export function deterministicUuid(...inputs: string[]): string {
  const hex = createHash('sha256').update(inputs.join(':')).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}
