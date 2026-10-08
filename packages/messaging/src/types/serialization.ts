import type { DomainEvent } from './domain-event';

/**
 * JSON-safe wire representation of a domain event:
 * bigint fields become decimal strings and Dates become ISO strings.
 */
export type SerializedEvent = Record<string, unknown> & {
  readonly eventType: string;
  readonly aggregateId: string;
};

export function serializeEvent(event: DomainEvent): SerializedEvent {
  return JSON.parse(
    JSON.stringify(event, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ) as SerializedEvent;
}
