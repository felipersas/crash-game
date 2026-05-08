/**
 * RabbitMQ Consumer for Games Events - Infrastructure Layer
 *
 * Consumes domain events from the Games service via the games.events exchange.
 * Dispatches events to appropriate handlers for wallet operations.
 *
 * Implements retry with exponential backoff for transient errors
 * and dead letter queue for permanent failures.
 *
 * Retry mechanism: Uses immediate requeue with retry counter increment.
 * After max retries, messages go to DLQ for inspection.
 */

import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { connect, type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { BetPlacedEventHandler } from './handlers/bet-placed.handler';
import { PlayerCashedOutEventHandler } from './handlers/player-cashed-out.handler';
import type { GameDomainEvent } from '../types/games.events';
import { OptimisticLockError } from '@/domain/errors/domain.errors';

/**
 * Consumer for game events from the Games service.
 *
 * Listens to the games.events fanout exchange and processes:
 * - BetPlacedEvent → Debit wallet for bet amount
 * - PlayerCashedOutEvent → Credit wallet for winnings
 *
 * Error handling strategy:
 * - Transient errors (OptimisticLockError, network) → Requeue immediately
 * - Permanent errors (WalletNotFound) → DLQ after max retries
 * - Max retries exceeded → DLQ
 *
 * Retry flow:
 * 1. Message consumed with x-retry-count header
 * 2. On transient error: increment retry count, requeue
 * 3. On permanent error or max retries: nack to DLQ
 */
@Injectable()
export class GamesEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GamesEventsConsumer.name);
  private readonly EXCHANGE_NAME = 'games.events';
  private readonly QUEUE_NAME = 'wallets.games.events';
  private readonly DLQ_QUEUE_NAME = 'wallets.games.events.dlq';
  private readonly MAX_RETRIES = 3;
  private connection: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;
  private consumerTag: string | null = null;

  constructor(
    private readonly betPlacedEventHandler: BetPlacedEventHandler,
    private readonly playerCashedOutEventHandler: PlayerCashedOutEventHandler,
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
          // Assert the fanout exchange (created by Games service)
          await channel.assertExchange(this.EXCHANGE_NAME, 'fanout', { durable: true });

          // Create DLQ first (to avoid errors when referencing it)
          await channel.assertQueue(this.DLQ_QUEUE_NAME, { durable: true });

          // Create main queue with DLQ configured
          await channel.assertQueue(this.QUEUE_NAME, {
            durable: true,
            arguments: {
              'x-dead-letter-exchange': '',
              'x-dead-letter-routing-key': this.DLQ_QUEUE_NAME,
            },
          });

          // Bind queue to exchange (fanout ignores routing key)
          await channel.bindQueue(this.QUEUE_NAME, this.EXCHANGE_NAME, '');

          // Set prefetch to handle multiple messages concurrently
          await channel.prefetch(10);
        },
      });

      await this.channel.waitForConnect();
      await this.startConsuming();

      this.logger.log('Games events consumer started');
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
        this.QUEUE_NAME,
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
   * Handle a single message with immediate requeue retry logic.
   *
   * Retry strategy:
   * - Transient errors → Requeue immediately with incremented retry count
   * - Permanent errors or max retries exceeded → DLQ
   *
   * This approach avoids the setTimeout race condition where delayed
   * callbacks could reference destroyed channels.
   */
  private async handleMessage(
    msg: ConsumeMessage,
    channel: ConfirmChannel,
  ): Promise<void> {
    const event = JSON.parse(msg.content.toString()) as GameDomainEvent;

    // Get retry count from message headers (default: 0)
    const retryCount = (msg.properties?.headers?.['x-retry-count'] as number) ?? 0;

    try {
      this.logger.debug(`Received event: ${event.eventType} (retry: ${retryCount}/${this.MAX_RETRIES})`);

      switch (event.eventType) {
        case 'BetPlaced':
          await this.betPlacedEventHandler.handle(event);
          break;

        case 'PlayerCashedOut':
          await this.playerCashedOutEventHandler.handle(event);
          break;

        default: {
          const unknownEvent = event as GameDomainEvent & { eventType: string };
          this.logger.warn(`Unhandled event type: ${unknownEvent.eventType}`);
          break;
        }
      }

      // Success: acknowledge message
      channel.ack(msg);
      this.logger.debug(`Event ${event.eventType} processed successfully`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error processing event (retry ${retryCount}/${this.MAX_RETRIES}): ${errorMessage}`,
      );

      // Check if this is a transient error that should be retried
      if (this.isTransientError(error) && retryCount < this.MAX_RETRIES) {
        // Increment retry count and requeue immediately
        const newRetryCount = retryCount + 1;
        this.logger.warn(`Retrying immediately (attempt ${newRetryCount}/${this.MAX_RETRIES})`);

        // Publish back to queue with incremented retry count
        channel.sendToQueue(
          this.QUEUE_NAME,
          msg.content,
          {
            headers: { 'x-retry-count': newRetryCount },
          },
        );
        channel.ack(msg); // Ack original message

        this.logger.debug(`Requeued event with retry count ${newRetryCount}`);
      } else {
        // Permanent error or max retries exceeded → send to DLQ
        this.logger.error(
          `Sending to DLQ: ${error instanceof Error ? error.message : String(error)}`,
        );
        channel.nack(msg, false, false); // requeue: false → DLQ
      }
    }
  }

  /**
   * Determine if an error is transient (should retry).
   *
   * Transient errors:
   * - OptimisticLockError: Concurrent wallet update
   * - Network errors: Temporary connectivity issues
   * - Temporary DB errors: Connection pool exhaustion, locks
   */
  private isTransientError(error: unknown): boolean {
    if (error instanceof OptimisticLockError) {
      return true;
    }

    if (error instanceof Error) {
      // Prisma transaction errors
      if (error.message.includes('transaction') || error.message.includes('lock')) {
        return true;
      }

      // Network/timeout errors
      if (
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ECONNREFUSED')
      ) {
        return true;
      }
    }

    return false;
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
