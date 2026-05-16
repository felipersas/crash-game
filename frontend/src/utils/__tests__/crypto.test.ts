import { describe, it, expect } from 'vitest';
import { hexToBytes, computeSHA256 } from '../crypto';

describe('hexToBytes', () => {
  it('should convert empty string to empty Uint8Array', () => {
    const result = hexToBytes('');
    expect(result).toEqual(new Uint8Array([]));
    expect(result.length).toBe(0);
  });

  it('should convert "00" to Uint8Array([0])', () => {
    const result = hexToBytes('00');
    expect(result).toEqual(new Uint8Array([0]));
    expect(result.length).toBe(1);
    expect(result[0]).toBe(0);
  });

  it('should convert "ff" to Uint8Array([255])', () => {
    const result = hexToBytes('ff');
    expect(result).toEqual(new Uint8Array([255]));
    expect(result.length).toBe(1);
    expect(result[0]).toBe(255);
  });

  it('should convert "0102ff" to Uint8Array([1, 2, 255])', () => {
    const result = hexToBytes('0102ff');
    expect(result).toEqual(new Uint8Array([1, 2, 255]));
    expect(result.length).toBe(3);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(255);
  });

  it('should handle multiple bytes correctly', () => {
    const result = hexToBytes('0102030405');
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    expect(result.length).toBe(5);
  });

  it('should handle mixed case hex input', () => {
    const result = hexToBytes('AaFf');
    expect(result).toEqual(new Uint8Array([0xaa, 0xff]));
    expect(result.length).toBe(2);
  });
});

describe('computeSHA256', () => {
  it('should hash empty string to known SHA-256 value', async () => {
    const result = await computeSHA256('');
    expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('should hash "616263" (hex for "abc") to known SHA-256 value', async () => {
    const result = await computeSHA256('616263');
    expect(result).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('should produce 64-character hex string', async () => {
    const result = await computeSHA256('0102030405');
    expect(result).toHaveLength(64);
  });

  it('should produce valid lowercase hex string matching /^[0-9a-f]{64}$/', async () => {
    const result = await computeSHA256('ffaa5500');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should hash different inputs to different values', async () => {
    const hash1 = await computeSHA256('0101');
    const hash2 = await computeSHA256('0202');
    expect(hash1).not.toBe(hash2);
  });

  it('should be deterministic - same input produces same output', async () => {
    const input = 'aabbccdd';
    const hash1 = await computeSHA256(input);
    const hash2 = await computeSHA256(input);
    expect(hash1).toBe(hash2);
  });

  it('should hash known value correctly', async () => {
    // SHA-256 of "Hello World" as hex string (48656c6c6f20576f726c64)
    const result = await computeSHA256('48656c6c6f20576f726c64');
    expect(result).toBe('a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e');
  });
});
