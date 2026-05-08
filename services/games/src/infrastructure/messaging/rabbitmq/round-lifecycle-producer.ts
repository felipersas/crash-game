import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { DelayedExchangeSetup } from './delayed-exchange.setup';
import type {
  StartRoundJob,
  EndBettingPhaseJob,
  MultiplierUpdateJob,
  RecoveryJob,
} from './jobs/round-job.types';

/**
 * Round Lifecycle Producer
 *
 * Schedules delayed messages to orchestrate the round lifecycle.
 * All jobs are routed through the x-delayed-message exchange.
 */
@Injectable()
export class RoundLifecycleProducer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoundLifecycleProducer.name);
  private connection: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;

  async onModuleInit(): Promise<void> {
    const amqpUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672';

    try {
      this.connection = connect([amqpUrl], {
        heartbeatIntervalInSeconds: 10,
        reconnectTimeInSeconds: 5,
      });

      this.connection.on('connect', () => {
        this.logger.log('RabbitMQ connected for round lifecycle');
      });

      this.connection.on('disconnect', ({ err }) => {
        this.logger.warn('RabbitMQ disconnected:', err?.message);
      });

      this.channel = this.connection.createChannel({
        json: true,
        setup: async (channel: ConfirmChannel) => {
          await DelayedExchangeSetup.setup(channel);
        },
      });

      this.channel.on('connect', () => {
        this.logger.log('Round lifecycle channel created');
      });

      await this.channel.waitForConnect();
    } catch (error: unknown) {
      this.logger.error('Failed to connect to RabbitMQ:', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (error: unknown) {
      this.logger.error('Error closing RabbitMQ connection:', error);
    }
  }

  /**
   * Schedule a new round to start.
   *
   * @param delayMs - Delay before starting (default: 0 = immediate)
   */
  async scheduleStartRound(delayMs: number = 0): Promise<void> {
    const job: StartRoundJob = {
      type: 'start-round',
      timestamp: Date.now(),
    };

    await this.publish('start-round', job, delayMs);
    this.logger.debug(`Scheduled start-round job with ${delayMs}ms delay`);
  }

  /**
   * Schedule the end of the betting phase.
   *
   * @param roundId - The round ID
   * @param version - Expected version for idempotency
   * @param delayMs - Delay before ending betting (default: 10000ms = 10s)
   */
  async scheduleEndBettingPhase(
    roundId: string,
    version: number,
    delayMs: number = 10000,
  ): Promise<void> {
    const job: EndBettingPhaseJob = {
      type: 'end-betting-phase',
      roundId,
      expectedVersion: version,
      timestamp: Date.now(),
    };

    await this.publish(`end-betting-${roundId}`, job, delayMs);
    this.logger.debug(
      `Scheduled end-betting-phase job for round ${roundId} with ${delayMs}ms delay`,
    );
  }

  /**
   * Schedule a multiplier update.
   *
   * @param roundId - The round ID
   * @param version - Expected version for idempotency
   * @param updateNumber - Sequential update number
   * @param delayMs - Delay before update (default: 100ms)
   */
  async scheduleMultiplierUpdate(
    roundId: string,
    version: number,
    updateNumber: number,
    delayMs: number = 100,
  ): Promise<void> {
    const job: MultiplierUpdateJob = {
      type: 'multiplier-update',
      roundId,
      expectedVersion: version,
      updateNumber,
      timestamp: Date.now(),
    };

    const jobId = `multiplier-${roundId}-${version}-${updateNumber}`;
    await this.publish(jobId, job, delayMs);
    this.logger.debug(
      `Scheduled multiplier-update job #${updateNumber} for round ${roundId}`,
    );
  }

  /**
   * Cancel all pending multiplier updates for a round.
   * Note: This is a best-effort operation using job ID tracking.
   * Actual cancellation requires the consumer to ignore stale jobs.
   */
  async cancelMultiplierUpdates(roundId: string): Promise<void> {
    // RabbitMQ delayed messages don't support direct cancellation.
    // Instead, we rely on version checking in the handler.
    this.logger.debug(`Cancellation requested for multiplier updates of round ${roundId}`);
  }

  /**
   * Schedule a recovery job.
   * Recovery jobs check for orphaned rounds after server restart.
   */
  async scheduleRecovery(delayMs: number = 5000): Promise<void> {
    const job: RecoveryJob = {
      type: 'recovery',
      timestamp: Date.now(),
    };

    await this.publish('recovery', job, delayMs);
    this.logger.debug(`Scheduled recovery job with ${delayMs}ms delay`);
  }

  /**
   * Internal publish method.
   */
  private async publish(
    jobId: string,
    job: StartRoundJob | EndBettingPhaseJob | MultiplierUpdateJob | RecoveryJob,
    delayMs: number,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn('RabbitMQ channel not initialized, skipping job publish');
      return;
    }

    const content = Buffer.from(JSON.stringify(job));
    const options = DelayedExchangeSetup.getDelayOptions(delayMs);

    await this.channel.sendToQueue(
      DelayedExchangeSetup.QUEUE_NAME,
      content,
      {
        ...options,
        messageId: jobId,
      },
    );
  }

  /**
   * Check if the producer is connected.
   */
  isConnected(): boolean {
    return this.connection !== null && this.connection.isConnected();
  }
}
