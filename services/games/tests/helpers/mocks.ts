/**
 * Shared mock factories for unit tests (project convention: hand-rolled
 * mocks, no jest.fn/vi.fn). Each factory returns a fresh mock per call;
 * pass `overrides` to replace individual methods.
 */
import type { Round } from '../../src/domain/entities/round.entity';
import type { GameDomainEvent } from '../../src/domain/events/round.events';
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

export function createMockRoundRepository(overrides: Record<string, AnyFn> = {}) {
  return {
    findCurrentRound: mockFn(async (): Promise<Round | null> => null),
    findById: mockFn(async (_id: string): Promise<Round | null> => null),
    save: mockFn(async (_round: Round, _tx?: TransactionContext) => {}),
    create: mockFn(async (_round: Round, _tx?: TransactionContext) => {}),
    findHistory: mockFn(async (_limit: number, _offset: number): Promise<Round[]> => []),
    countHistory: mockFn(async () => 0),
    ...overrides,
  };
}

export function createMockBetRepository(overrides: Record<string, AnyFn> = {}) {
  return {
    create: mockFn(async (_bet: unknown, _tx?: TransactionContext) => {}),
    update: mockFn(async (_bet: unknown, _tx?: TransactionContext) => {}),
    findById: mockFn(async (_id: string): Promise<unknown> => null),
    findByPlayerAndRound: mockFn(
      async (_playerId: string, _roundId: string): Promise<unknown> => null,
    ),
    findByPlayerPaginated: mockFn(
      async (_playerId: string, _limit: number, _offset: number): Promise<unknown[]> => [],
    ),
    countByPlayer: mockFn(async (_playerId: string) => 0),
    getSummaryByPlayer: mockFn(async (_playerId: string) => ({
      totalWageredCents: 0n,
      wins: 0,
      losses: 0,
      profitCents: 0n,
    })),
    findStalePendingBets: mockFn(async (_olderThan: Date): Promise<unknown[]> => []),
    ...overrides,
  };
}

/**
 * Runs the work callback with FAKE_TX and records every commit.
 */
export function createMockUnitOfWork() {
  const commits: Array<{ aggregateId: string; events: GameDomainEvent[] }> = [];
  return {
    commits,
    /** All events committed so far, flattened. */
    get committedEvents(): GameDomainEvent[] {
      return commits.flatMap((c) => c.events);
    },
    commit: mockFn(
      async (
        aggregateId: string,
        events: GameDomainEvent[],
        work?: (tx: TransactionContext) => Promise<void>,
      ) => {
        await work?.(FAKE_TX);
        commits.push({ aggregateId, events });
      },
    ),
  };
}

export function createMockBroadcaster() {
  return {
    broadcastRoundStarted: mockFn((_data: unknown) => {}),
    broadcastBettingEnded: mockFn((_roundId: string) => {}),
    broadcastMultiplierUpdate: mockFn((_roundId: string, _multiplier: number) => {}),
    broadcastCrash: mockFn((_data: unknown) => {}),
    broadcastBetPlaced: mockFn((_data: unknown) => {}),
    broadcastBetConfirmed: mockFn((_data: unknown) => {}),
    broadcastBetCancelled: mockFn((_data: unknown) => {}),
    broadcastPlayerCashedOut: mockFn((_data: unknown) => {}),
  };
}

export function createMockMetrics() {
  return {
    incrBet: mockFn((_status: string, _amountCents: number) => {}),
    incrPayout: mockFn((_amountCents: number) => {}),
    observeCrashPoint: mockFn((_crashPoint: number) => {}),
    observeRoundDuration: mockFn((_seconds: number) => {}),
    setRtp: mockFn((_percentage: number) => {}),
  };
}

export function createMockRoundStateProvider(round: Round | null = null) {
  return {
    getCurrentRound: mockFn((): Round | null => round),
  };
}

export function createMockAutoCashOutRepository(overrides: Record<string, AnyFn> = {}) {
  return {
    addTarget: mockFn(async (_roundId: string, _playerId: string, _multiplier: number) => {}),
    removeTarget: mockFn(async (_roundId: string, _playerId: string) => {}),
    fetchAndRemoveEligible: mockFn(
      async (
        _roundId: string,
        _multiplier: number,
      ): Promise<Array<{ playerId: string; targetMultiplier: number }>> => [],
    ),
    acquireLock: mockFn(async (_roundId: string, _playerId: string) => true),
    releaseLock: mockFn(async (_roundId: string, _playerId: string) => {}),
    getCachedResult: mockFn(
      async (
        _roundId: string,
        _playerId: string,
      ): Promise<{ multiplier: number; payoutCents: bigint } | null> => null,
    ),
    cacheResult: mockFn(async (_roundId: string, _playerId: string, _result: unknown) => {}),
    clearRound: mockFn(async (_roundId: string) => {}),
    ...overrides,
  };
}
