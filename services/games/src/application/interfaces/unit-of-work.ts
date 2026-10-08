import type { GameDomainEvent } from '@/domain/events/round.events';

/**
 * Opaque handle to an open transaction.
 * Only infrastructure knows its shape; use cases just hand it to repositories.
 */
export type TransactionContext = { readonly __brand: 'TransactionContext' };

/**
 * Unit of Work - Application Layer
 *
 * Persists aggregate changes and appends their domain events to the
 * transactional outbox atomically. After commit, events are published
 * best-effort; the outbox processor retries anything left behind.
 */
export interface IUnitOfWork {
  commit(
    aggregateId: string,
    events: GameDomainEvent[],
    work?: (tx: TransactionContext) => Promise<void>,
  ): Promise<void>;
}
