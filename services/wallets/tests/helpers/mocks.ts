/**
 * Shared mock factories for unit tests (project convention: hand-rolled
 * mocks, no jest.fn/vi.fn). Each factory returns a fresh mock per call;
 * pass `overrides` to replace individual methods.
 */
import type { DomainEvent } from '@crash/messaging';
import type { Wallet } from '../../src/domain/entities/wallet.entity';
import type { InboxEvent } from '../../src/application/interfaces/inbox.repository';
import type { TransactionContext } from '../../src/application/interfaces/unit-of-work';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

export type MockFn<T extends AnyFn = AnyFn> = T & {
  /** Arguments of every call, in order. */
  calls: Parameters<T>[];
  readonly callCount: number;
  mockImplementation(impl: T): void;
  mockReturnValue(value: ReturnType<T>): void;
  mockResolvedValue(value: Awaited<ReturnType<T>>): void;
  mockRejectedValue(error: unknown): void;
};

export function mockFn<T extends AnyFn = AnyFn>(impl?: T): MockFn<T> {
  let current: AnyFn = impl ?? (() => undefined);
  const calls: Parameters<T>[] = [];

  const fn = ((...args: Parameters<T>) => {
    calls.push(args);
    return current(...args);
  }) as MockFn<T>;

  Object.defineProperty(fn, 'callCount', { get: () => calls.length });
  fn.calls = calls;
  fn.mockImplementation = (next) => {
    current = next;
  };
  fn.mockReturnValue = (value) => {
    current = () => value;
  };
  fn.mockResolvedValue = (value) => {
    current = () => Promise.resolve(value);
  };
  fn.mockRejectedValue = (error) => {
    current = () => Promise.reject(error);
  };
  return fn;
}

export const FAKE_TX = { fake: 'transaction' } as unknown as TransactionContext;

export function createMockWalletRepository(overrides: Record<string, AnyFn> = {}) {
  return {
    findByPlayerId: mockFn(async (_playerId: string): Promise<Wallet | null> => null),
    findById: mockFn(async (_id: string): Promise<Wallet | null> => null),
    save: mockFn(async (_wallet: Wallet, _tx?: TransactionContext) => {}),
    create: mockFn(async (_wallet: Wallet, _tx?: TransactionContext) => {}),
    ...overrides,
  };
}

export function createMockInboxRepository(overrides: Record<string, AnyFn> = {}) {
  return {
    tryCreate: mockFn(async (_input: unknown): Promise<InboxEvent | null> => null),
    findByIdempotencyKey: mockFn(async (_key: string): Promise<InboxEvent | null> => null),
    markAsProcessed: mockFn(async (_id: string, _tx?: TransactionContext) => {}),
    markAsFailed: mockFn(async (_id: string, _errorMessage: string) => {}),
    findFailed: mockFn(async (_maxRetries: number): Promise<InboxEvent[]> => []),
    deleteProcessedOlderThan: mockFn(async (_days: number) => 0),
    ...overrides,
  };
}

/**
 * Runs the work callback with FAKE_TX and records every commit.
 */
export function createMockUnitOfWork() {
  const commits: Array<{ aggregateId: string; events: DomainEvent[] }> = [];
  return {
    commits,
    /** All events committed so far, flattened. */
    get committedEvents(): DomainEvent[] {
      return commits.flatMap((c) => c.events);
    },
    commit: mockFn(
      async (
        aggregateId: string,
        events: DomainEvent[],
        work?: (tx: TransactionContext) => Promise<void>,
      ) => {
        await work?.(FAKE_TX);
        commits.push({ aggregateId, events });
      },
    ),
  };
}

export function createMockMetrics() {
  return {
    incrWalletOp: mockFn((_operation: string, _amountCents: number) => {}),
    incrRabbitConsumed: mockFn((_queue: string, _eventType: string) => {}),
  };
}
