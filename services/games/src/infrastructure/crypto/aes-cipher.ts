/**
 * AES-256-GCM Cipher - Authenticated encryption for seed chain at rest.
 *
 * Uses Web Crypto API (zero external dependencies).
 * - 256-bit key from base64-encoded env var
 * - 96-bit random IV per encrypt call (never reused)
 * - GCM provides both confidentiality and integrity
 */

export interface EncryptedPayload {
  readonly v: 1;
  readonly iv: string; // hex-encoded 12 bytes
  readonly data: string; // base64-encoded ciphertext + auth tag
}

export class AesCipher {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly IV_LENGTH = 12; // 96 bits (NIST recommended for GCM)
  private static readonly TAG_LENGTH = 128; // 128-bit auth tag (default)

  private constructor() {}

  /**
   * Encrypt a plaintext string using AES-256-GCM.
   * Returns IV + ciphertext (with auth tag appended by Web Crypto).
   */
  static async encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedPayload> {
    const iv = crypto.getRandomValues(new Uint8Array(AesCipher.IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: AesCipher.ALGORITHM, iv: iv as BufferSource, tagLength: AesCipher.TAG_LENGTH },
      key,
      encoded as BufferSource,
    );

    return {
      v: 1,
      iv: AesCipher.uint8ToHex(iv),
      data: AesCipher.uint8ToBase64(new Uint8Array(ciphertext)),
    };
  }

  /**
   * Decrypt an encrypted payload back to plaintext string.
   * Throws on tampered data (GCM auth tag verification fails).
   */
  static async decrypt(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
    const iv = AesCipher.hexToUint8(payload.iv);
    const ciphertext = AesCipher.base64ToUint8(payload.data);

    const decrypted = await crypto.subtle.decrypt(
      { name: AesCipher.ALGORITHM, iv: iv as BufferSource, tagLength: AesCipher.TAG_LENGTH },
      key,
      ciphertext as BufferSource,
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Import a base64-encoded 256-bit key into a CryptoKey object.
   * Key must be exactly 32 bytes when decoded from base64.
   */
  static async importKey(base64Key: string): Promise<CryptoKey> {
    const rawKey = AesCipher.base64ToUint8(base64Key);

    if (rawKey.length !== 32) {
      throw new Error(
        `Invalid encryption key: expected 32 bytes (256 bits), got ${rawKey.length}. ` +
          'Generate one with: openssl rand -base64 32',
      );
    }

    return crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: AesCipher.ALGORITHM, length: 256 },
      false, // not extractable
      ['encrypt', 'decrypt'],
    );
  }

  // --- Encoding helpers ---

  private static uint8ToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private static hexToUint8(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  private static uint8ToBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64');
  }

  private static base64ToUint8(base64: string): Uint8Array {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  /**
   * Check if a parsed JSON object looks like an encrypted payload.
   */
  static isEncryptedPayload(obj: unknown): obj is EncryptedPayload {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'v' in obj &&
      'data' in obj &&
      'iv' in obj &&
      (obj as EncryptedPayload).v === 1
    );
  }
}
