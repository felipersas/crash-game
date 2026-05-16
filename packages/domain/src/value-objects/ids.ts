/**
 * Typed ID value objects using branded types.
 *
 * Branded types are strings at runtime (zero overhead) but TypeScript
 * prevents mixing PlayerId with RoundId at compile time.
 */

import { randomUUID } from 'node:crypto';

type Brand<T, B> = T & { readonly __brand: B };

export type PlayerId = Brand<string, 'PlayerId'>;
export type RoundId = Brand<string, 'RoundId'>;
export type BetId = Brand<string, 'BetId'>;
export type WalletId = Brand<string, 'WalletId'>;

export const PlayerId = {
  create(): PlayerId {
    return randomUUID() as PlayerId;
  },
  from(id: string): PlayerId {
    return id as PlayerId;
  },
};

export const RoundId = {
  create(): RoundId {
    return randomUUID() as RoundId;
  },
  from(id: string): RoundId {
    return id as RoundId;
  },
};

export const BetId = {
  create(): BetId {
    return randomUUID() as BetId;
  },
  from(id: string): BetId {
    return id as BetId;
  },
};

export const WalletId = {
  create(): WalletId {
    return randomUUID() as WalletId;
  },
  from(id: string): WalletId {
    return id as WalletId;
  },
};
