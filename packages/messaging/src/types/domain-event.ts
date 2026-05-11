/**
 * Base domain event interface.
 * All domain events across bounded contexts MUST extend this interface.
 */
export interface DomainEvent {
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateType?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly occurredAt: Date;
  readonly version: number;
}
