/**
 * DLQ Setup Service - Infrastructure Layer
 *
 * Asserts the dead-letter queue on startup so that the main consumer
 * queue can reference it via x-dead-letter-routing-key.
 */

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { connect } from 'amqp-connection-manager';
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';

@Injectable()
export class DlqSetupService implements OnModuleInit {
  private readonly logger = new Logger(DlqSetupService.name);

  async onModuleInit(): Promise<void> {
    const amqpUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672';

    try {
      const connection: AmqpConnectionManager = connect([amqpUrl]);
      const channel: ChannelWrapper = connection.createChannel({
        setup: (ch: ConfirmChannel) =>
          ch.assertQueue('wallets.games.events.dlq', { durable: true }),
      });

      await channel.waitForConnect();
      await channel.close();
      await connection.close();
      this.logger.log('DLQ queue asserted: wallets.games.events.dlq');
    } catch (error: unknown) {
      this.logger.error('Failed to assert DLQ queue:', error);
    }
  }
}
