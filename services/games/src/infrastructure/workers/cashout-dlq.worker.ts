import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';

@Processor('cashout-dlq')
export class CashoutDLQWorker extends WorkerHost {
  private readonly logger = new Logger(CashoutDLQWorker.name);

  constructor(
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.error(
      `Auto cash-out permanently failed — job ${job.id}, attempts: ${job.attemptsMade}, ` +
        `data: ${JSON.stringify(job.data)}, error: ${job.failedReason}`,
    );
    this.metrics.incrBet('auto_cashout_dlq', 0);
  }
}
