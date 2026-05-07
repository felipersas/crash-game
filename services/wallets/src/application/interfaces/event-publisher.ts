import { WalletDomainEvent } from '@/domain/events/wallet.events';

/**
 * Defines the contract for publishing domain events to message broker.
 * Implemented by Infrastructure layer (RabbitMQ).
 */
export interface IEventPublisher {
  /**
   * Publish a wallet domain event to the message broker.
   * Should handle connection errors gracefully.
   */
  publish(event: WalletDomainEvent): Promise<void>;

  /**
   * Publish multiple events in batch.
   * More efficient than publishing one by one.
   */
  publishBatch(events: WalletDomainEvent[]): Promise<void>;

  /**
   * Check if the publisher is connected to the broker.
   */
  isConnected(): boolean;
}
