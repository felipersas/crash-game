import { Injectable, Inject, Logger } from '@nestjs/common';
import { type ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { GameDomainEvent } from '@/domain/events/round.events';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';

@Injectable()
export class RabbitMQEventPublisher implements IGameEventPublisher {
  private readonly logger = new Logger(RabbitMQEventPublisher.name);

  constructor(@Inject('GAMES_EVENTS_CLIENT') private readonly client: ClientProxy) {}

  async publish(event: GameDomainEvent): Promise<void> {
    const serialized = JSON.parse(
      JSON.stringify(event, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );

    await firstValueFrom(this.client.emit(event.eventType, serialized), {
      defaultValue: undefined,
    });

    this.logger.debug(`Published event: ${event.eventType}`);
  }

  async publishBatch(events: GameDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  isConnected(): boolean {
    return true;
  }
}
