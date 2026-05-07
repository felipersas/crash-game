import type { DomainEvent } from './domain-event';

/**
 * Defines the contract for publishing domain events to message broker.
 * Implemented by Infrastructure layer of each bounded context.
 * 
 * @example
 * // Wallet Service implements for WalletDomainEvent
 * // Games Service implements for GameDomainEvent
 */
export interface IEventPublisher<TEvent extends DomainEvent = DomainEvent> {
  /**
   * Publish a domain event to the message broker.
   * Should handle connection errors gracefully.
   */
  publish(event: TEvent): Promise<void>;

  /**
   * Publish multiple events in batch.
   * More efficient than publishing one by one.
   */
  publishBatch(events: TEvent[]): Promise<void>;

  /**
   * Check if the publisher is connected to the broker.
   */
  isConnected(): boolean;
}
