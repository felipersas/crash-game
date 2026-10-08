import type { SerializedEvent } from './serialization';

/**
 * Publishes serialized domain events to the message broker.
 * Implemented by the infrastructure layer of each bounded context and used by
 * its transactional outbox (immediate publish + polling fallback).
 */
export interface IEventPublisher {
  /**
   * @throws when the broker rejects or cannot receive the event; callers keep
   * the outbox entry pending so it is retried.
   */
  publish(event: SerializedEvent): Promise<void>;
}
