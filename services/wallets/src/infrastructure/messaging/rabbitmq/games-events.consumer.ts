/**
 * RabbitMQ Consumer for Games Events - Infrastructure Layer
 *
 * Consumes domain events from the Games service via the games.events exchange.
 * Dispatches events to appropriate handlers for wallet operations.
 */

import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { connect, type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { BetPlacedEventHandler } from './handlers/bet-placed.handler';
import { PlayerCashedOutEventHandler } from './handlers/player-cashed-out.handler';
import type { GameDomainEvent } from '../types/games.events';

/**
 * Consumer for game events from the Games service.
 *
 * Listens to the games.events fanout exchange and processes:
 * - BetPlacedEvent → Debit wallet for bet amount
 * - PlayerCashedOutEvent → Credit wallet for winnings
 */
@Injectable()
export class GamesEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GamesEventsConsumer.name);
  private readonly EXCHANGE_NAME = 'games.events';
  private readonly QUEUE_NAME = 'wallets.games.events';
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

          // Create a dedicated queue for this service
          await channel.assertQueue(this.QUEUE_NAME, { durable: true });

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
   * Handle a single message.
   * Note: json: true only affects outgoing messages. Incoming messages
   * are always Buffers that need manual parsing.
   */
  private async handleMessage(
    msg: ConsumeMessage,
    channel: ConfirmChannel,
  ): Promise<void> {
    // Parse Buffer to JSON (json: true only affects publisher, not consumer)
    const event = JSON.parse(msg.content.toString()) as GameDomainEvent;

    try {
      this.logger.debug(`Received event: ${event.eventType}`);

      // Dispatch to appropriate handler based on event type
      switch (event.eventType) {
        case 'BetPlaced':
          await this.betPlacedEventHandler.handle(event);
          break;

        case 'PlayerCashedOut':
          await this.playerCashedOutEventHandler.handle(event);
          break;

        default: {
          // Handle unknown event types (shouldn't happen with proper typing)
          const unknownEvent = event as GameDomainEvent & { eventType: string };
          this.logger.warn(`Unhandled event type: ${unknownEvent.eventType}`);
          break;
        }
      }

      // Acknowledge message
      channel.ack(msg);
      this.logger.debug(`Event ${event.eventType} processed successfully`);
    } catch (error: unknown) {
      this.logger.error(
        `Error processing event: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Negative acknowledge without requeue for processing errors
      // (events are idempotent, retry could cause duplicate operations)
      channel.nack(msg, false, false);
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
