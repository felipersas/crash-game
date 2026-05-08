import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { RoundLifecycleProducer } from '@/infrastructure/messaging/rabbitmq/round-lifecycle-producer';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import { ROUND_REPOSITORY } from '@/infrastructure/di/tokens';

/**
 * Round Lifecycle Orchestrator
 *
 * Stateless scheduler that coordinates the round lifecycle via RabbitMQ jobs.
 * No in-memory state - all coordination happens through the message queue.
 */
@Injectable()
export class RoundLifecycleOrchestrator implements OnModuleInit {
  private readonly logger = new Logger(RoundLifecycleOrchestrator.name);

  constructor(
    private readonly producer: RoundLifecycleProducer,
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing round lifecycle orchestrator');

    // Wait for producer to be ready
    await this.waitForProducer();

    // Schedule initial recovery job
    await this.producer.scheduleRecovery(5000); // 5s delay

    // Check if there's an active round, if not, start one
    const currentRound = await this.roundRepository.findCurrentRound();
    if (!currentRound) {
      this.logger.log('No active round found, scheduling start-round job');
      await this.producer.scheduleStartRound(1000); // 1s delay
    } else {
      this.logger.log(
        `Active round found: ${currentRound.id} (${currentRound.getStatus()})`,
      );

      // If round is stuck, recovery job will handle it
    }

    this.logger.log('Round lifecycle orchestrator initialized');
  }

  /**
   * Wait for producer to be connected.
   */
  private async waitForProducer(): Promise<void> {
    const maxWait = 30000; // 30s
    const interval = 500;
    let elapsed = 0;

    while (!this.producer.isConnected() && elapsed < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      elapsed += interval;
    }

    if (!this.producer.isConnected()) {
      throw new Error('Producer failed to connect within timeout');
    }
  }
}
