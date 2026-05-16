import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ObservabilityModule } from '@crash/observability';
import { AutoCashOutWorker } from './auto-cashout.worker';
import { CashoutDLQWorker } from './cashout-dlq.worker';
import { CashOutUseCase } from '@/application/use-cases/cash-out.use-case';

@Module({
  imports: [
    ObservabilityModule,
    BullModule.registerQueue(
      {
        name: 'cashout',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 500 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
      { name: 'cashout-dlq' },
    ),
  ],
  providers: [AutoCashOutWorker, CashoutDLQWorker, CashOutUseCase],
  exports: [BullModule],
})
export class WorkersModule {}
