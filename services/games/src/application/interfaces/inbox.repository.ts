export type InboxEventStatus = 'PENDING' | 'PROCESSED' | 'FAILED';

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
  status: InboxEventStatus;
  processedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
}

/**
 * Inbox persistence: tracks consumed events by idempotency key so that
 * at-least-once delivery never applies the same event twice.
 */
export interface IInboxRepository {
  /**
   * Returns null when the idempotency key already exists (duplicate event).
   */
  tryCreate(input: InboxEventCreateInput): Promise<InboxEvent | null>;

  findByIdempotencyKey(idempotencyKey: string): Promise<InboxEvent | null>;

  markAsProcessed(id: string): Promise<void>;

  /**
   * Marks the event FAILED and increments its retry count.
   */
  markAsFailed(id: string, errorMessage: string): Promise<void>;

  /**
   * FAILED events that still have retries left.
   */
  findFailed(maxRetries: number): Promise<InboxEvent[]>;

  /**
   * Deletes PROCESSED events older than the given number of days.
   */
  deleteProcessedOlderThan(days: number): Promise<number>;
}
