import { randomUUID } from 'node:crypto';

import { InvalidIdempotencyKeyError } from '../errors/domain.errors';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * IdempotencyKey value object — validates UUID v4 format on construction.
 */
export class IdempotencyKey {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(): IdempotencyKey {
    return new IdempotencyKey(randomUUID());
  }

  static from(key: string): IdempotencyKey {
    if (!UUID_V4_REGEX.test(key)) {
      throw new InvalidIdempotencyKeyError();
    }
    return new IdempotencyKey(key);
  }

  toString(): string {
    return this.value;
  }

  equals(other: IdempotencyKey): boolean {
    return this.value === other.value;
  }
}
