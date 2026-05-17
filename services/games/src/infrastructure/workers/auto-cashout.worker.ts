import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { CashOutUseCase } from '@/application/use-cases/cash-out.use-case';
import { AUTO_CASHOUT_REPOSITORY } from '@/application/di.tokens';
import type { IAutoCashOutRepository } from '@/application/interfaces/auto-cashout.repository';
import { PlayerId, RoundId } from '@crash/domain';

export interface AutoCashOutJobData {
  playerId: string;
  roundId: string;
  targetMultiplier: number;
  idempotencyKey: string;
}

@Processor('cashout', { concurrency: 10 })
export class AutoCashOutWorker extends WorkerHost {
  private readonly logger = new Logger(AutoCashOutWorker.name);

  constructor(
    @Inject(AUTO_CASHOUT_REPOSITORY) private readonly autoCashOutRepo: IAutoCashOutRepository,
    private readonly cashOutUseCase: CashOutUseCase,
  ) {
    super();
  }

  async process(job: Job): Promise<{ cashOutMultiplier: number; payoutCents: number }> {
    const { playerId, roundId, targetMultiplier, idempotencyKey } = job.data as AutoCashOutJobData;

    this.logger.debug(`Processing auto cash-out for player ${playerId} in round ${roundId}`);

    const cached = await this.acquireOrCached(roundId, playerId);
    if (cached) return cached;

    try {
      const result = await this.cashOutUseCase.execute({
        playerId: PlayerId.from(playerId),
        roundId: RoundId.from(roundId),
        idempotencyKey,
        targetMultiplier,
      });

      // Cache result for future idempotency checks
      await this.autoCashOutRepo.cacheResult(roundId, playerId, {
        multiplier: result.cashOutMultiplier,
        payoutCents: result.payoutCents,
      });

      this.logger.log(
        `Auto cash-out completed for player ${playerId} at ${result.cashOutMultiplier}x (${result.payoutCents} cents)`,
      );

      return {
        cashOutMultiplier: result.cashOutMultiplier,
        payoutCents: Number(result.payoutCents),
      };
    } catch (error) {
      this.logger.error(
        `Auto cash-out FAILED for player ${playerId} in round ${roundId}: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async acquireOrCached(
    roundId: string,
    playerId: string,
  ): Promise<{ cashOutMultiplier: number; payoutCents: number } | null> {
    const acquired = await this.autoCashOutRepo.acquireLock(roundId, playerId);
    if (acquired) return null;
    const cached = await this.autoCashOutRepo.getCachedResult(roundId, playerId);
    if (cached)
      return { cashOutMultiplier: cached.multiplier, payoutCents: Number(cached.payoutCents) };
    throw new Error(`Lock not acquired for auto cash-out: ${playerId}, will retry`);
  }
}
