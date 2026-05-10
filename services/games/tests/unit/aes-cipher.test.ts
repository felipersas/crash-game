/**
 * Unit tests for AesCipher - AES-256-GCM encryption utility.
 *
 * Tests cover:
 * - Encrypt/decrypt roundtrip
 * - Different plaintext sizes (short, large JSON, unicode)
 * - Key import validation
 * - Tamper detection (auth tag verification)
 * - isEncryptedPayload detection
 * - Unique IV per encryption
 */

import { describe, test, expect } from 'bun:test';
import { AesCipher, type EncryptedPayload } from '../../src/infrastructure/crypto/aes-cipher';

// Generate a valid 32-byte base64 key for tests
const TEST_KEY_BASE64 = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

describe('AesCipher', () => {
  describe('importKey', () => {
    test('should import a valid 32-byte base64 key', async () => {
      const key = await AesCipher.importKey(TEST_KEY_BASE64);
      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
    });

    test('should reject key with wrong length', async () => {
      const shortKey = Buffer.from(new Uint8Array(16)).toString('base64');
      expect(AesCipher.importKey(shortKey)).rejects.toThrow('expected 32 bytes');
    });

    test('should reject empty key', async () => {
      const emptyKey = Buffer.from(new Uint8Array(0)).toString('base64');
      expect(AesCipher.importKey(emptyKey)).rejects.toThrow('expected 32 bytes');
    });
  });

  describe('encrypt/decrypt roundtrip', () => {
    test('should encrypt and decrypt a simple string', async () => {
      const key = await AesCipher.importKey(TEST_KEY_BASE64);
      const plaintext = 'hello world';

      const encrypted = await AesCipher.encrypt(plaintext, key);
      const decrypted = await AesCipher.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    test('should encrypt and decrypt a large JSON payload', async () => {
      const key = await AesCipher.importKey(TEST_KEY_BASE64);
      const payload = {
        seeds: Array.from({ length: 100 }, () =>
          Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
        ),
        current: 42,
        commitment: 'abc123',
      };
      const plaintext = JSON.stringify(payload);

      const encrypted = await AesCipher.encrypt(plaintext, key);
      const decrypted = await AesCipher.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
      expect(JSON.parse(decrypted)).toEqual(payload);
    });

    test('should handle unicode content', async () => {
      const key = await AesCipher.importKey(TEST_KEY_BASE64);
      const plaintext = '{"name":"Crash Game 🎮","emoji":"🎲💰"}';

      const encrypted = await AesCipher.encrypt(plaintext, key);
      const decrypted = await AesCipher.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    test('should handle empty string', async () => {
      const key = await AesCipher.importKey(TEST_KEY_BASE64);
      const plaintext = '';

      const encrypted = await AesCipher.encrypt(plaintext, key);
      const decrypted = await AesCipher.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('encrypted payload properties', () => {
    test('should produce a valid EncryptedPayload structure', async () => {
      const key = await AesCipher.importKey(TEST_KEY_BASE64);
      const encrypted = await AesCipher.encrypt('test', key);

      expect(encrypted.v).toBe(1);
      expect(typeof encrypted.iv).toBe('string');
      expect(encrypted.iv.length).toBe(24); // 12 bytes = 24 hex chars
      expect(typeof encrypted.data).toBe('string');
      expect(encrypted.data.length).toBeGreaterThan(0);
    });

    test('should generate unique IV per encryption', async () => {
      const key = await AesCipher.importKey(TEST_KEY_BASE64);
      const plaintext = 'same input';

      const enc1 = await AesCipher.encrypt(plaintext, key);
      const enc2 = await AesCipher.encrypt(plaintext, key);

      // IVs must differ
      expect(enc1.iv).not.toBe(enc2.iv);
      // Ciphertexts must differ (because IVs differ)
      expect(enc1.data).not.toBe(enc2.data);
      // But both decrypt to the same plaintext
      const dec1 = await AesCipher.decrypt(enc1, key);
      const dec2 = await AesCipher.decrypt(enc2, key);
      expect(dec1).toBe(dec2);
    });
  });

  describe('tamper detection', () => {
    test('should reject tampered ciphertext', async () => {
      const key = await AesCipher.importKey(TEST_KEY_BASE64);
      const encrypted = await AesCipher.encrypt('secret data', key);

      // Tamper with the ciphertext (flip bits in base64 data)
      const tamperedData = encrypted.data.replace(/A/g, 'B').replace(/a/g, 'b');
      const tampered: EncryptedPayload = { ...encrypted, data: tamperedData };

      if (tamperedData !== encrypted.data) {
        expect(AesCipher.decrypt(tampered, key)).rejects.toThrow();
      }
    });

    test('should reject tampered IV', async () => {
      const key = await AesCipher.importKey(TEST_KEY_BASE64);
      const encrypted = await AesCipher.encrypt('secret data', key);

      // Flip first byte of IV
      const ivBytes = Buffer.from(encrypted.iv, 'hex');
      ivBytes[0] ^= 0xff;
      const tampered: EncryptedPayload = { ...encrypted, iv: ivBytes.toString('hex') };

      expect(AesCipher.decrypt(tampered, key)).rejects.toThrow();
    });
  });

  describe('isEncryptedPayload', () => {
    test('should detect valid encrypted payload', async () => {
      const key = await AesCipher.importKey(TEST_KEY_BASE64);
      const encrypted = await AesCipher.encrypt('test', key);

      expect(AesCipher.isEncryptedPayload(encrypted)).toBe(true);
    });

    test('should detect plain parsed JSON as non-encrypted', () => {
      expect(AesCipher.isEncryptedPayload({ seeds: [], current: 0, commitment: 'abc' })).toBe(false);
    });

    test('should detect null and primitives as non-encrypted', () => {
      expect(AesCipher.isEncryptedPayload(null)).toBe(false);
      expect(AesCipher.isEncryptedPayload('string')).toBe(false);
      expect(AesCipher.isEncryptedPayload(42)).toBe(false);
      expect(AesCipher.isEncryptedPayload(undefined)).toBe(false);
    });

    test('should reject object with wrong version', () => {
      expect(AesCipher.isEncryptedPayload({ v: 2, iv: 'x', data: 'y' })).toBe(false);
    });
  });

  describe('cross-key isolation', () => {
    test('should not decrypt with a different key', async () => {
      const key1 = await AesCipher.importKey(TEST_KEY_BASE64);
      const key2Base64 = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
      const key2 = await AesCipher.importKey(key2Base64);

      const encrypted = await AesCipher.encrypt('secret', key1);

      expect(AesCipher.decrypt(encrypted, key2)).rejects.toThrow();
    });
  });
});
