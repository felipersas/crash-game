/**
 * RabbitMQ Event Publisher Implementation - Infrastructure Layer
 *
 * Publishes wallet domain events to RabbitMQ exchange.
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import type { IEventPublisher } from '@/application/interfaces/event-publisher';
import { WalletDomainEvent } from '@/domain/events/wallet.events';

@Injectable()
export class RabbitMQEventPublisher
  implements IEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMQEventPublisher.name);
  private connection: any = null;
  private channel: any = null;

  async onModuleInit() {
    const amqpUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672';

    try {
      this.connection = await amqp.connect(amqpUrl);
      this.channel = await this.connection.createChannel();

      // Declare exchange for wallet events
      await this.channel.assertExchange('wallet.events', 'fanout', { durable: true });

      this.logger.log('RabbitMQ Event Publisher connected');
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

  async publish(event: WalletDomainEvent): Promise<void> {
    if (!this.channel) {
      this.logger.warn('RabbitMQ channel not initialized, skipping event publish');
      return;
    }

    // Convert BigInt to string for JSON serialization
    const serialized = JSON.stringify(event, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    const content = Buffer.from(serialized);
    const routingKey = event.eventType.toLowerCase();

    this.channel.publish('wallet.events', routingKey, content, {
      contentType: 'application/json',
      messageId: crypto.randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
    });
  }

  async publishBatch(events: WalletDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}
