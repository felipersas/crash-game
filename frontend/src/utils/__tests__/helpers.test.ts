import { describe, it, expect } from 'vitest';
import { cn } from '../helpers';

describe('cn', () => {
  it('merges class names', () => {
    const result = cn('foo', 'bar');
    expect(result).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    const result = cn('foo', false && 'bar', 'baz');
    expect(result).toBe('foo baz');
  });

  it('deduplicates tailwind classes', () => {
    const result = cn('p-2', 'p-4');
    expect(result).toBe('p-4');
  });

  it('handles undefined', () => {
    const result = cn('foo', undefined);
    expect(result).toBe('foo');
  });

  it('handles empty input', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('handles null values', () => {
    const result = cn('foo', null, 'bar');
    expect(result).toBe('foo bar');
  });

  it('handles arrays of classes', () => {
    const result = cn(['foo', 'bar'], 'baz');
    expect(result).toBe('foo bar baz');
  });

  it('handles objects with boolean values', () => {
    const result = cn({ foo: true, bar: false, baz: true });
    expect(result).toBe('foo baz');
  });

  it('handles complex tailwind conflicts', () => {
    const result = cn('px-2 py-1', 'px-4 py-2');
    expect(result).toBe('px-4 py-2');
  });

  it('handles mixed input types', () => {
    const result = cn('base', ['active', 'hover'], { disabled: false, enabled: true });
    expect(result).toBe('base active hover enabled');
  });
});
