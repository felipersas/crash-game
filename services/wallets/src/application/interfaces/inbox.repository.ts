/**
 * Defines the contract for inbox event persistence.
 * Implements idempotency by tracking processed events via unique idempotency key.
 */
export interface IInboxRepository {
  /**
   * Try to create a new inbox event.
   * Returns null if idempotency key already exists (duplicate event).
   */
  tryCreate(input: InboxEventCreateInput): Promise<InboxEvent | null>;

  /**
   * Mark an inbox event as PROCESSED.
   */
  markAsProcessed(id: string, processedAt: Date): Promise<void>;

  /**
   * Mark an inbox event as FAILED with error message.
   */
  markAsFailed(id: string, errorMessage: string, retryCount: number): Promise<void>;

  /**
   * Increment retry count for an event.
   */
  incrementRetry(id: string): Promise<void>;

  /**
   * Find an inbox event by idempotency key.
   */
  findByIdempotencyKey(idempotencyKey: string): Promise<InboxEvent | null>;

  /**
   * Find an inbox event by ID.
   */
  findById(id: string): Promise<InboxEvent | null>;

  /**
   * Delete processed events older than specified days.
   * Returns count of deleted events.
   */
  deleteOlderThan(days: number): Promise<number>;
}

export interface InboxEventCreateInput {
  idempotencyKey: string;
  eventType: string;
  payload: unknown;
}

export interface InboxEvent {
  id: string;
  idempotencyKey: string;
  eventType: string;
  payload: unknown;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  processedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
}
