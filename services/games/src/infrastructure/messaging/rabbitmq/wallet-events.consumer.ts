/**
 * RabbitMQ Consumer for Wallet Events - Infrastructure Layer
 *
 * Consumes confirmation events from the Wallets service via the wallet.events exchange.
 * Dispatches events to appropriate handlers for bet state updates.
 */

import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { connect, type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { WalletDebitedEventHandler } from './handlers/wallet-debited.handler';
import { WalletDebitFailedEventHandler } from './handlers/wallet-debit-failed.handler';
import type { WalletDomainEvent } from '../types/wallet.events';

/**
 * Consumer for wallet confirmation events from the Wallets service.
 *
 * Listens to the wallet.events fanout exchange and processes:
 * - WalletDebitedEvent → Confirm bet (PENDING → ACTIVE)
 * - WalletDebitFailedEvent → Cancel bet (PENDING → CANCELLED)
 */
@Injectable()
export class WalletEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalletEventsConsumer.name);
  private readonly EXCHANGE_NAME = 'wallet.events';
  private readonly QUEUE_NAME = 'games.wallet.events';
  private connection: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;
  private consumerTag: string | null = null;

  constructor(
    private readonly walletDebitedEventHandler: WalletDebitedEventHandler,
    private readonly walletDebitFailedEventHandler: WalletDebitFailedEventHandler,
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
          // Assert the fanout exchange (created by Wallets service)
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

      this.logger.log('Wallet events consumer started');
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
    const event = JSON.parse(msg.content.toString()) as WalletDomainEvent;

    try {
      this.logger.debug(`Received event: ${event.eventType}`);

      switch (event.eventType) {
        case 'WalletDebited':
          await this.walletDebitedEventHandler.handle(event);
          break;

        case 'WalletDebitFailed':
          await this.walletDebitFailedEventHandler.handle(event);
          break;

        default: {
          const unknownEvent = event as WalletDomainEvent & { eventType: string };
          this.logger.warn(`Unhandled event type: ${unknownEvent.eventType}`);
          break;
        }
      }

      channel.ack(msg);
      this.logger.debug(`Wallet event ${event.eventType} processed successfully`);
    } catch (error: unknown) {
      this.logger.error(
        `Error processing wallet event: ${error instanceof Error ? error.message : String(error)}`,
      );

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
