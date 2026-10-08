import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PlayerId, RoundId } from '@crash/domain';
import { CashOutUseCase, type CashOutOutput } from '@/application/use-cases/cash-out.use-case';
import { AUTO_CASHOUT_REPOSITORY } from '@/application/di.tokens';
import type { IAutoCashOutRepository } from '@/application/interfaces/auto-cashout.repository';
import { CASHOUT_DLQ_QUEUE, CASHOUT_QUEUE } from '@/infrastructure/di.tokens';

export interface AutoCashOutJobData {
  playerId: string;
  roundId: string;
  targetMultiplier: number;
  idempotencyKey: string;
}

export interface AutoCashOutJobResult {
  cashOutMultiplier: number;
  /** Integer cents as a string (job results are JSON). */
  payoutCents: string;
}

export type FailedAutoCashOutJobData = AutoCashOutJobData & {
  failedReason: string;
  attemptsMade: number;
};

/**
 * Executes auto cash-outs dispatched by the lifecycle manager.
 * A Redis lock plus cached result keep retried jobs idempotent; jobs that
 * exhaust their attempts are moved to the DLQ queue.
 */
@Processor(CASHOUT_QUEUE, { concurrency: 10 })
export class AutoCashOutWorker extends WorkerHost {
  private readonly logger = new Logger(AutoCashOutWorker.name);

  constructor(
    @Inject(AUTO_CASHOUT_REPOSITORY) private readonly autoCashOutRepository: IAutoCashOutRepository,
    private readonly cashOutUseCase: CashOutUseCase,
    @InjectQueue(CASHOUT_DLQ_QUEUE)
    private readonly deadLetterQueue: Queue<FailedAutoCashOutJobData>,
  ) {
    super();
  }

  async process(job: Job<AutoCashOutJobData>): Promise<AutoCashOutJobResult> {
    const { playerId, roundId } = job.data;

    const cached = await this.acquireOrCached(roundId, playerId);
    if (cached) return cached;

    const result = await this.cashOut(job.data);

    await this.autoCashOutRepository.cacheResult(roundId, playerId, {
      multiplier: result.cashOutMultiplier,
      payoutCents: result.payoutCents,
    });

    this.logger.log(
      `Auto cash-out completed for player ${playerId} at ${result.cashOutMultiplier}x (${result.payoutCents} cents)`,
    );

    return {
      cashOutMultiplier: result.cashOutMultiplier,
      payoutCents: result.payoutCents.toString(),
    };
  }

  private async cashOut(data: AutoCashOutJobData): Promise<CashOutOutput> {
    try {
      return await this.cashOutUseCase.execute({
        playerId: PlayerId.from(data.playerId),
        roundId: RoundId.from(data.roundId),
        idempotencyKey: data.idempotencyKey,
        targetMultiplier: data.targetMultiplier,
      });
    } catch (error) {
      // Let the next attempt take the lock instead of failing with "Lock not acquired"
      await this.autoCashOutRepository.releaseLock(data.roundId, data.playerId);
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async moveToDeadLetterQueue(job: Job<AutoCashOutJobData>, error: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      this.logger.warn(
        `Auto cash-out attempt ${job.attemptsMade}/${maxAttempts} failed for player ${job.data.playerId}: ${error.message}`,
      );
      return;
    }

    this.logger.error(
      `Auto cash-out for player ${job.data.playerId} in round ${job.data.roundId} failed permanently: ${error.message}`,
    );
    await this.deadLetterQueue.add('auto-cashout-failed', {
      ...job.data,
      failedReason: error.message,
      attemptsMade: job.attemptsMade,
    });
  }

  /**
   * Returns the cached result when another attempt already cashed out,
   * null when this attempt holds the lock, and throws (retry) otherwise.
   */
  private async acquireOrCached(
    roundId: string,
    playerId: string,
  ): Promise<AutoCashOutJobResult | null> {
    if (await this.autoCashOutRepository.acquireLock(roundId, playerId)) return null;

    const cached = await this.autoCashOutRepository.getCachedResult(roundId, playerId);
    if (cached) {
      return { cashOutMultiplier: cached.multiplier, payoutCents: cached.payoutCents.toString() };
    }
    throw new Error(`Lock not acquired for auto cash-out: ${playerId}, will retry`);
  }
}
