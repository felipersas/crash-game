/**
 * Hashing primitives shared by the provably fair value objects.
 * Uses the Web Crypto API so the same algorithm can be reproduced client-side.
 */

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

/** SHA-256 of a hex-encoded value, returned as hex. */
export async function sha256Hex(hex: string): Promise<string> {
  return bytesToHex(await sha256(hexToBytes(hex)));
}
