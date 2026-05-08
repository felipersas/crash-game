import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { RoundLifecycleProducer } from './round-lifecycle-producer';
import { StartRoundHandler } from './handlers/start-round.handler';
import { EndBettingPhaseHandler } from './handlers/end-betting-phase.handler';
import { MultiplierUpdateHandler } from './handlers/multiplier-update.handler';
import { RecoveryHandler } from './handlers/recovery.handler';
import { DelayedExchangeSetup } from './delayed-exchange.setup';
import type { RoundLifecycleJob } from './jobs/round-job.types';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import { ROUND_REPOSITORY } from '@/infrastructure/di/tokens';

/**
 * Round Lifecycle Consumer
 *
 * Consumes delayed messages from the round lifecycle queue
 * and dispatches them to the appropriate handlers.
 */
@Injectable()
export class RoundLifecycleConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoundLifecycleConsumer.name);
  private connection: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;
  private consumerTag: string | null = null;

  constructor(
    private readonly producer: RoundLifecycleProducer,
    private readonly startRoundHandler: StartRoundHandler,
    private readonly endBettingPhaseHandler: EndBettingPhaseHandler,
    private readonly multiplierUpdateHandler: MultiplierUpdateHandler,
    private readonly recoveryHandler: RecoveryHandler,
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    const amqpUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672';

    try {
      this.connection = connect([amqpUrl], {
        heartbeatIntervalInSeconds: 10,
        reconnectTimeInSeconds: 5,
      });

      this.channel = this.connection.createChannel({
        json: true,
        setup: async (channel: ConfirmChannel) => {
          await DelayedExchangeSetup.setup(channel);

          // Set prefetch to 1 (process one job at a time)
          await channel.prefetch(1);
        },
      });

      await this.channel.waitForConnect();
      await this.startConsuming();

      this.logger.log('Round lifecycle consumer started');
    } catch (error: unknown) {
      this.logger.error('Failed to start consumer:', error);
    }
  }

  /**
   * Start consuming messages from the queue.
   */
  private async startConsuming(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.addSetup(async (channel: ConfirmChannel) => {
      const { consumerTag } = await channel.consume(
        DelayedExchangeSetup.QUEUE_NAME,
        async (msg: ConsumeMessage | null) => {
          if (!msg) {
            this.logger.warn('Received null message');
            return;
          }

          await this.handleMessage(msg, channel);
        },
        {
          // Manual acknowledgment mode
          noAck: false,
        },
      );

      this.consumerTag = consumerTag;
      this.logger.log(`Consumer started with tag: ${consumerTag}`);
    });
  }

  /**
   * Handle a single message.
   */
  private async handleMessage(
    msg: ConsumeMessage,
    channel: ConfirmChannel,
  ): Promise<void> {
    const { content, fields } = msg;

    try {
      const job: RoundLifecycleJob = JSON.parse(content.toString());

      this.logger.debug(
        `Processing job: ${job.type} (deliveryTag: ${fields.deliveryTag})`,
      );

      // Dispatch to appropriate handler
      switch (job.type) {
        case 'start-round':
          await this.startRoundHandler.handle();
          break;

        case 'end-betting-phase':
          await this.endBettingPhaseHandler.handle(job);
          break;

        case 'multiplier-update':
          await this.multiplierUpdateHandler.handle(job);

          // Re-schedule next update if round didn't crash
          if (this.producer.isConnected()) {
            const round = await this.roundRepository.findById(job.roundId);
            if (round && round.getStatus() === 'ACTIVE') {
              await this.producer.scheduleMultiplierUpdate(
                job.roundId,
                job.expectedVersion,
                job.updateNumber + 1,
              );
            }
          }
          break;

        case 'recovery':
          await this.recoveryHandler.handle();

          // Re-schedule recovery
          if (this.producer.isConnected()) {
            await this.producer.scheduleRecovery();
          }
          break;
      }

      // Acknowledge message
      channel.ack(msg);
      this.logger.debug(`Job ${job.type} completed successfully`);
    } catch (error: unknown) {
      this.logger.error(
        `Error processing job: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Negative acknowledge with requeue
      channel.nack(msg, false, true);
    }
  }

  /**
   * Graceful shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.channel && this.consumerTag) {
      try {
        await this.channel.cancel(this.consumerTag);
        this.logger.log('Consumer cancelled');
      } catch (error: unknown) {
        this.logger.error('Error cancelling consumer:', error);
      }
    }

    if (this.channel) {
      await this.channel.close();
    }

    if (this.connection) {
      await this.connection.close();
    }
  }
}
