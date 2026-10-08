import { Injectable, Inject } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { IEventPublisher, SerializedEvent } from '@crash/messaging';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { GAMES_EVENTS_CLIENT } from '@/infrastructure/di.tokens';

const EXCHANGE = 'games.events';

/**
 * Publishes serialized game events to the `games.events` fanout exchange.
 */
@Injectable()
export class RabbitMQEventPublisher implements IEventPublisher {
  constructor(
    @Inject(GAMES_EVENTS_CLIENT) private readonly client: ClientProxy,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async publish(event: SerializedEvent): Promise<void> {
    await firstValueFrom(this.client.emit(event.eventType, event), { defaultValue: undefined });
    this.metrics.incrRabbitPublished(EXCHANGE, event.eventType);
  }
}
