import type { Channel } from 'amqplib';
import { Logger } from '@nestjs/common';

/**
 * Delayed message exchange configuration.
 *
 * Uses rabbitmq_delayed_message_exchange plugin to schedule
 * messages with delayed delivery.
 */
export class DelayedExchangeSetup {
  private static readonly logger = new Logger(DelayedExchangeSetup.name);

  /**
   * Exchange name for round lifecycle jobs.
   */
  static readonly EXCHANGE_NAME = 'round.lifecycle';

  /**
   * Queue name for round lifecycle jobs.
   */
  static readonly QUEUE_NAME = 'round.lifecycle';

  /**
   * Routing key (same as queue for direct binding).
   */
  static readonly ROUTING_KEY = 'round.lifecycle';

  /**
   * Setup the delayed message exchange and queue.
   * Call this when initializing the RabbitMQ channel.
   */
  static async setup(channel: Channel): Promise<void> {
    try {
      // Assert delayed message exchange
      await channel.assertExchange(
        this.EXCHANGE_NAME,
        'x-delayed-message',
        {
          durable: true,
          arguments: {
            'x-delayed-type': 'direct',
          },
        },
      );

      this.logger.log(
        `Delayed exchange '${this.EXCHANGE_NAME}' asserted successfully`,
      );

      // Assert queue
      await channel.assertQueue(this.QUEUE_NAME, {
        durable: true,
        arguments: {
          'x-delivery-limit': 10, // Max retries before dead letter
        },
      });

      this.logger.log(`Queue '${this.QUEUE_NAME}' asserted successfully`);

      // Bind queue to exchange
      await channel.bindQueue(
        this.QUEUE_NAME,
        this.EXCHANGE_NAME,
        this.ROUTING_KEY,
      );

      this.logger.log(
        `Queue '${this.QUEUE_NAME}' bound to exchange '${this.EXCHANGE_NAME}'`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to setup delayed exchange (plugin not available): ${error instanceof Error ? error.message : String(error)}`,
      );
      // Don't throw - allow service to start without delayed exchange
    }
  }

  /**
   * Get the delay value for a message.
   * Messages must have x-delay header set.
   */
  static getDelayOptions(delayMs: number): Record<string, unknown> {
    return {
      'x-delay': delayMs,
      contentType: 'application/json',
      deliveryMode: 2, // Persistent
      messageId: crypto.randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
    };
  }
}
