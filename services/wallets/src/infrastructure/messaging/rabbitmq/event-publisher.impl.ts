/**
 * RabbitMQ Event Publisher Implementation - Infrastructure Layer
 *
 * Publishes wallet domain events via NestJS Microservices ClientProxy.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { WalletDomainEvent } from '@/domain/events/wallet.events';
import type { IEventPublisher } from '@crash/messaging';

@Injectable()
export class RabbitMQEventPublisher implements IEventPublisher {
  private readonly logger = new Logger(RabbitMQEventPublisher.name);

  constructor(@Inject('WALLET_EVENTS_CLIENT') private readonly client: ClientProxy) {}

  async publish(event: WalletDomainEvent): Promise<void> {
    const serialized = JSON.parse(
      JSON.stringify(event, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );

    await firstValueFrom(this.client.emit(event.eventType, serialized), {
      defaultValue: undefined,
    });

    this.logger.debug(`Published event: ${event.eventType} (${event.aggregateId})`);
  }

  async publishBatch(events: WalletDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  isConnected(): boolean {
    return true;
  }
}
