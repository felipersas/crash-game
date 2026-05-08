import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import type { GameDomainEvent } from '@/domain/events/round.events';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';

@Injectable()
export class RabbitMQEventPublisher
  implements IGameEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMQEventPublisher.name);
  private connection: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;

  async onModuleInit() {
    const amqpUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672';

    try {
      this.connection = connect([amqpUrl], {
        heartbeatIntervalInSeconds: 10,
        reconnectTimeInSeconds: 5,
      });

      this.connection.on('connect', () => {
        this.logger.log('RabbitMQ connected');
      });

      this.connection.on('disconnect', ({ err }) => {
        this.logger.warn('RabbitMQ disconnected:', err?.message);
      });

      this.channel = this.connection.createChannel({
        json: true,
        setup: (channel: ConfirmChannel) =>
          channel.assertExchange('games.events', 'fanout', { durable: true }),
      });

      this.channel.on('connect', () => {
        this.logger.log('RabbitMQ channel created');
      });

      await this.channel.waitForConnect();
    } catch (error: unknown) {
      this.logger.error('Failed to connect to RabbitMQ:', error);
    }
  }

  async onModuleDestroy() {
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

  async publish(event: GameDomainEvent): Promise<void> {
    if (!this.channel) {
      this.logger.warn('RabbitMQ channel not initialized, skipping event publish');
      return;
    }

    const serialized = JSON.stringify(event, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    const content = Buffer.from(serialized);
    const routingKey = event.eventType.toLowerCase();

    this.channel.publish('games.events', routingKey, content, {
      contentType: 'application/json',
      messageId: crypto.randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
    });

    this.logger.debug(`Published event: ${event.eventType}`);
  }

  async publishBatch(events: GameDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}
