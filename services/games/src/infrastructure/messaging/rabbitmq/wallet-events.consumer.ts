/**
 * RabbitMQ Consumer for Wallet Events - Infrastructure Layer
 *
 * Consumes confirmation events from the Wallets service via the wallet.events exchange.
 * Updates bet states based on wallet debit results:
 * - WalletDebitedEvent → Confirm bet (PENDING → ACTIVE)
 * - WalletDebitFailedEvent → Cancel bet (PENDING → CANCELLED)
 */

import { Injectable, Logger, Inject, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { connect, type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import { ROUND_REPOSITORY } from '@/infrastructure/di/tokens';
import type { WalletDebitedEvent, WalletDebitFailedEvent } from '../types/wallet.events';

type WalletEvent = WalletDebitedEvent | WalletDebitFailedEvent;

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
   */
  private async handleMessage(
    msg: ConsumeMessage,
    channel: ConfirmChannel,
  ): Promise<void> {
    const { content, fields } = msg;

    try {
      const event: WalletEvent = JSON.parse(content.toString());

      this.logger.debug(
        `Processing wallet event: ${event.eventType} (deliveryTag: ${fields.deliveryTag})`,
      );

      // Dispatch to appropriate handler based on event type
      switch (event.eventType) {
        case 'WalletDebited':
          await this.handleWalletDebited(event);
          break;

        case 'WalletDebitFailed':
          await this.handleWalletDebitFailed(event);
          break;

        default: {
          // Type assertion for unknown event types
          const unknownEvent = event as WalletEvent & { eventType: string };
          this.logger.warn(`Unhandled event type: ${unknownEvent.eventType}`);
          break;
        }
      }

      // Acknowledge message
      channel.ack(msg);
      this.logger.debug(`Wallet event ${event.eventType} processed successfully`);
    } catch (error: unknown) {
      this.logger.error(
        `Error processing wallet event: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Negative acknowledge without requeue for processing errors
      // (events are idempotent, retry could cause duplicate operations)
      channel.nack(msg, false, false);
    }
  }

  /**
   * Handle successful wallet debit - confirm the bet.
   */
  private async handleWalletDebited(event: WalletDebitedEvent): Promise<void> {
    this.logger.debug(
      `Confirming bet ${event.betId} for player ${event.playerId} in round ${event.roundId}`,
    );

    const round = await this.roundRepository.findById(event.roundId);
    if (!round) {
      this.logger.warn(`Round ${event.roundId} not found for bet ${event.betId}`);
      return;
    }

    const bet = round.getBetByPlayer(event.playerId);
    if (!bet) {
      this.logger.warn(`Bet ${event.betId} not found in round ${event.roundId}`);
      return;
    }

    // Confirm the bet (PENDING → ACTIVE)
    bet.confirm();

    // Save and emit events
    await this.roundRepository.save(round);
    const events = round.pullEvents();
    // Note: We might want to emit BetConfirmedEvent here

    this.logger.log(`Bet ${event.betId} confirmed for player ${event.playerId}`);
  }

  /**
   * Handle failed wallet debit - cancel the bet.
   */
  private async handleWalletDebitFailed(event: WalletDebitFailedEvent): Promise<void> {
    this.logger.debug(
      `Cancelling bet ${event.betId} for player ${event.playerId} in round ${event.roundId}: ${event.reason}`,
    );

    const round = await this.roundRepository.findById(event.roundId);
    if (!round) {
      this.logger.warn(`Round ${event.roundId} not found for bet ${event.betId}`);
      return;
    }

    const bet = round.getBetByPlayer(event.playerId);
    if (!bet) {
      this.logger.warn(`Bet ${event.betId} not found in round ${event.roundId}`);
      return;
    }

    // Cancel the bet (PENDING → CANCELLED)
    bet.cancel(event.reason);

    // Remove from round's bets (optional, depending on requirements)
    // For now, we keep it with CANCELLED status for audit trail

    // Save and emit events
    await this.roundRepository.save(round);
    const events = round.pullEvents();
    // Note: We might want to emit BetCancelledEvent here

    this.logger.log(`Bet ${event.betId} cancelled for player ${event.playerId}: ${event.reason}`);
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
