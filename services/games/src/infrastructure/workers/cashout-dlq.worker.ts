import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { CASHOUT_DLQ_QUEUE } from '@/infrastructure/di.tokens';
import type { FailedAutoCashOutJobData } from './auto-cashout.worker';

/**
 * Records auto cash-outs that failed permanently so they can be investigated.
 */
@Processor(CASHOUT_DLQ_QUEUE)
export class CashoutDLQWorker extends WorkerHost {
  private readonly logger = new Logger(CashoutDLQWorker.name);

  constructor(@Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService) {
    super();
  }

  async process(job: Job<FailedAutoCashOutJobData>): Promise<void> {
    const { playerId, roundId, attemptsMade, failedReason } = job.data;
    this.logger.error(
      `Dead-lettered auto cash-out: player ${playerId}, round ${roundId}, ` +
        `attempts ${attemptsMade}, reason: ${failedReason}`,
    );
    this.metrics.incrBet('auto_cashout_dlq', 0);
  }
}
