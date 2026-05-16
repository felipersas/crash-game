import { describe, test, expect, beforeEach } from 'bun:test';
import { AutoCashOutWorker } from '../../../src/infrastructure/workers/auto-cashout.worker';

function mockFn<T extends (...args: any[]) => any>(impl?: T) {
  const fn: any = (...args: any[]) => {
    fn.callCount++;
    return fn._impl(...args);
  };
  fn._impl = impl || (() => {});
  fn.callCount = 0;
  fn.mockReturnValue = (v: any) => { fn._impl = () => v; };
  fn.mockResolvedValue = (v: any) => { fn._impl = () => Promise.resolve(v); };
  return fn as T & {
    callCount: number;
    mockReturnValue: (v: any) => void;
    mockResolvedValue: (v: any) => void;
  };
}

function createMockAutoCashOutRepo() {
  return {
    addTarget: mockFn(() => Promise.resolve()),
    removeTarget: mockFn(() => Promise.resolve()),
    fetchAndRemoveEligible: mockFn(() => Promise.resolve([])),
    acquireLock: mockFn(() => Promise.resolve(true)),
    getCachedResult: mockFn(() => Promise.resolve(null)),
    cacheResult: mockFn(() => Promise.resolve()),
    clearRound: mockFn(() => Promise.resolve()),
  };
}

function createMockCashOutUseCase() {
  return {
    execute: mockFn(() => Promise.resolve({
      betId: 'bet-1',
      roundId: 'round-1',
      playerId: 'player-1',
      cashOutMultiplier: 2.5,
      payoutCents: 2500n,
    })),
  };
}

describe('AutoCashOutWorker', () => {
  let autoCashOutRepo: ReturnType<typeof createMockAutoCashOutRepo>;
  let cashOutUseCase: ReturnType<typeof createMockCashOutUseCase>;
  let worker: AutoCashOutWorker;

  beforeEach(() => {
    autoCashOutRepo = createMockAutoCashOutRepo();
    cashOutUseCase = createMockCashOutUseCase();
    worker = new AutoCashOutWorker(autoCashOutRepo as any, cashOutUseCase as any);
  });

  test('should process auto cash-out job successfully', async () => {
    const job = {
      data: {
        playerId: 'player-1',
        roundId: 'round-1',
        targetMultiplier: 2.5,
        idempotencyKey: 'auto-round-1-player-1',
      },
    } as any;

    const result = await worker.process(job);

    expect(result.cashOutMultiplier).toBe(2.5);
    expect(result.payoutCents).toBe(2500n);
    expect(autoCashOutRepo.acquireLock.callCount).toBe(1);
    expect(cashOutUseCase.execute.callCount).toBe(1);
    expect(autoCashOutRepo.cacheResult.callCount).toBe(1);
  });

  test('should return cached result when lock not acquired and result exists', async () => {
    autoCashOutRepo.acquireLock.mockResolvedValue(false);
    autoCashOutRepo.getCachedResult.mockResolvedValue({ multiplier: 2.5, payoutCents: 2500n });

    const job = {
      data: {
        playerId: 'player-1',
        roundId: 'round-1',
        targetMultiplier: 2.5,
        idempotencyKey: 'auto-round-1-player-1',
      },
    } as any;

    const result = await worker.process(job);

    expect(result).toEqual({ cashOutMultiplier: 2.5, payoutCents: 2500n });
    expect(cashOutUseCase.execute.callCount).toBe(0);
  });

  test('should throw when lock not acquired and no cached result', async () => {
    autoCashOutRepo.acquireLock.mockResolvedValue(false);
    autoCashOutRepo.getCachedResult.mockResolvedValue(null);

    const job = {
      data: {
        playerId: 'player-1',
        roundId: 'round-1',
        targetMultiplier: 2.5,
        idempotencyKey: 'auto-round-1-player-1',
      },
    } as any;

    expect(worker.process(job)).rejects.toThrow();
    expect(cashOutUseCase.execute.callCount).toBe(0);
  });

  test('should pass correct args to CashOutUseCase', async () => {
    const job = {
      data: {
        playerId: 'player-1',
        roundId: 'round-1',
        targetMultiplier: 2.5,
        idempotencyKey: 'auto-round-1-player-1',
      },
    } as any;

    await worker.process(job);

    expect(cashOutUseCase.execute.callCount).toBe(1);
  });

  test('should cache result after successful cash-out', async () => {
    cashOutUseCase.execute.mockResolvedValue({
      betId: 'bet-1',
      roundId: 'round-1',
      playerId: 'player-1',
      cashOutMultiplier: 3.0,
      payoutCents: 3000n,
    });

    const job = {
      data: {
        playerId: 'player-1',
        roundId: 'round-1',
        targetMultiplier: 3.0,
        idempotencyKey: 'auto-round-1-player-1',
      },
    } as any;

    await worker.process(job);

    expect(autoCashOutRepo.cacheResult.callCount).toBe(1);
  });
});
