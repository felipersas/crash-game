import { describe, test, expect, beforeEach } from 'bun:test';
import {
  AutoCashOutWorker,
  type AutoCashOutJobData,
} from '../../../src/infrastructure/workers/auto-cashout.worker';
import { createMockAutoCashOutRepository, mockFn } from '../../helpers/mocks';

const JOB_DATA: AutoCashOutJobData = {
  playerId: 'player-1',
  roundId: 'round-1',
  targetMultiplier: 2.5,
  idempotencyKey: 'auto-round-1-player-1',
};

function createJob(overrides: { attemptsMade?: number; attempts?: number } = {}) {
  return {
    data: { ...JOB_DATA },
    attemptsMade: overrides.attemptsMade ?? 1,
    opts: { attempts: overrides.attempts },
  } as any;
}

function createMockCashOutUseCase() {
  return {
    execute: mockFn(async (_input: unknown) => ({
      betId: 'bet-1',
      roundId: 'round-1',
      playerId: 'player-1',
      cashOutMultiplier: 2.5,
      payoutCents: 2500n,
    })),
  };
}

function createMockQueue() {
  return {
    add: mockFn(async (_name: string, _data: unknown) => ({ id: 'dlq-1' })),
  };
}

describe('AutoCashOutWorker', () => {
  let autoCashOutRepository: ReturnType<typeof createMockAutoCashOutRepository>;
  let cashOutUseCase: ReturnType<typeof createMockCashOutUseCase>;
  let deadLetterQueue: ReturnType<typeof createMockQueue>;
  let worker: AutoCashOutWorker;

  beforeEach(() => {
    autoCashOutRepository = createMockAutoCashOutRepository();
    cashOutUseCase = createMockCashOutUseCase();
    deadLetterQueue = createMockQueue();
    worker = new AutoCashOutWorker(
      autoCashOutRepository as any,
      cashOutUseCase as any,
      deadLetterQueue as any,
    );
    // Silence worker logs
    const logger = (worker as any).logger;
    logger.log = () => {};
    logger.warn = () => {};
    logger.error = () => {};
  });

  describe('process', () => {
    test('should cash out and return payoutCents as a string', async () => {
      const result = await worker.process(createJob());

      expect(result).toEqual({ cashOutMultiplier: 2.5, payoutCents: '2500' });
      expect(autoCashOutRepository.acquireLock.calls).toEqual([['round-1', 'player-1']]);
      expect(cashOutUseCase.execute.callCount).toBe(1);
    });

    test('should pass job data to CashOutUseCase', async () => {
      await worker.process(createJob());

      expect(cashOutUseCase.execute.calls[0][0]).toEqual({
        playerId: 'player-1',
        roundId: 'round-1',
        idempotencyKey: 'auto-round-1-player-1',
        targetMultiplier: 2.5,
      });
    });

    test('should cache the result with bigint payout after a successful cash-out', async () => {
      cashOutUseCase.execute.mockResolvedValue({
        betId: 'bet-1',
        roundId: 'round-1',
        playerId: 'player-1',
        cashOutMultiplier: 3.0,
        payoutCents: 3000n,
      });

      await worker.process(createJob());

      expect(autoCashOutRepository.cacheResult.calls).toEqual([
        ['round-1', 'player-1', { multiplier: 3.0, payoutCents: 3000n }],
      ]);
    });

    test('should keep large payouts exact in the string result', async () => {
      cashOutUseCase.execute.mockResolvedValue({
        betId: 'bet-1',
        roundId: 'round-1',
        playerId: 'player-1',
        cashOutMultiplier: 1000,
        payoutCents: 9_007_199_254_740_993n,
      });

      const result = await worker.process(createJob());

      expect(result.payoutCents).toBe('9007199254740993');
    });

    test('should return the cached result when the lock is held and a result exists', async () => {
      autoCashOutRepository.acquireLock.mockResolvedValue(false);
      autoCashOutRepository.getCachedResult.mockResolvedValue({
        multiplier: 2.5,
        payoutCents: 2500n,
      });

      const result = await worker.process(createJob());

      expect(result).toEqual({ cashOutMultiplier: 2.5, payoutCents: '2500' });
      expect(cashOutUseCase.execute.callCount).toBe(0);
      expect(autoCashOutRepository.cacheResult.callCount).toBe(0);
    });

    test('should throw (to retry) when the lock is held and no result is cached', async () => {
      autoCashOutRepository.acquireLock.mockResolvedValue(false);
      autoCashOutRepository.getCachedResult.mockResolvedValue(null);

      await expect(worker.process(createJob())).rejects.toThrow('Lock not acquired');
      expect(cashOutUseCase.execute.callCount).toBe(0);
    });

    test('should propagate cash-out failures without caching a result', async () => {
      cashOutUseCase.execute.mockRejectedValue(new Error('No active bet'));

      await expect(worker.process(createJob())).rejects.toThrow('No active bet');
      expect(autoCashOutRepository.cacheResult.callCount).toBe(0);
    });

    test('should release the lock when the cash-out fails so the retry can run', async () => {
      const job = createJob();
      cashOutUseCase.execute.mockRejectedValue(new Error('db down'));

      await expect(worker.process(job)).rejects.toThrow('db down');
      expect(autoCashOutRepository.releaseLock.calls).toEqual([
        [job.data.roundId, job.data.playerId],
      ]);
    });

    test('should keep the lock after a successful cash-out', async () => {
      await worker.process(createJob());

      expect(autoCashOutRepository.releaseLock.callCount).toBe(0);
    });
  });

  describe('moveToDeadLetterQueue', () => {
    test('should not enqueue while attempts remain', async () => {
      await worker.moveToDeadLetterQueue(
        createJob({ attemptsMade: 1, attempts: 3 }),
        new Error('boom'),
      );

      expect(deadLetterQueue.add.callCount).toBe(0);
    });

    test('should enqueue to the DLQ once attempts are exhausted', async () => {
      await worker.moveToDeadLetterQueue(
        createJob({ attemptsMade: 3, attempts: 3 }),
        new Error('boom'),
      );

      expect(deadLetterQueue.add.calls).toEqual([
        ['auto-cashout-failed', { ...JOB_DATA, failedReason: 'boom', attemptsMade: 3 }],
      ]);
    });

    test('should enqueue when attemptsMade exceeds the configured attempts', async () => {
      await worker.moveToDeadLetterQueue(
        createJob({ attemptsMade: 4, attempts: 3 }),
        new Error('boom'),
      );

      expect(deadLetterQueue.add.callCount).toBe(1);
    });

    test('should treat a job without attempts option as a single attempt', async () => {
      await worker.moveToDeadLetterQueue(
        createJob({ attemptsMade: 1, attempts: undefined }),
        new Error('boom'),
      );

      expect(deadLetterQueue.add.callCount).toBe(1);
    });
  });
});
