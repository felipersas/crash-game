import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

@Processor('cashout-dlq')
export class CashoutDLQWorker extends WorkerHost {
  private readonly logger = new Logger(CashoutDLQWorker.name);

  async process(job: Job): Promise<void> {
    this.logger.error(
      `Auto cash-out permanently failed — job ${job.id}, attempts: ${job.attemptsMade}, ` +
        `data: ${JSON.stringify(job.data)}, error: ${job.failedReason}`,
    );
    // TODO: Prometheus counter, alerting integration
  }
}
