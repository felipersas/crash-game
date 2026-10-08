---
name: domain-modeling
description: DDD patterns for this project — entities, value objects, domain events, domain errors, Money value object
triggers:
  - "domain entity"
  - "value object"
  - "domain event"
  - "domain error"
  - "money value object"
  - "seed chain"
  - "crash point"
  - "multiplier"
tags: [ddd, domain, patterns, crash-game]
---

# Domain Modeling

DDD patterns specific to this Crash Game project. Shared between games and wallets services.

## Purpose

Ensure all domain code follows consistent DDD patterns with proper encapsulation, event sourcing, and money handling.

## Shared Package: `@crash/domain`

```
packages/
├── domain/           # Shared kernel: Money, formatCents, typed ids, IdempotencyKey,
│                     # Pagination, DomainError base + shared errors
├── messaging/        # DomainEvent, serializeEvent, IEventPublisher
├── http/             # AllExceptionsFilter (status by error code), @UserContext
├── observability/    # MetricsRecorderService, METRICS_RECORDER, MetricsInterceptor
├── eslint-config/    # Shared ESLint config
└── prettier-config/  # Shared Prettier config
```

### Money Value Object (`@crash/domain`)
```typescript
import { Money } from '@crash/domain';

Money.fromCents(1000n)       // $10.00
Money.fromDecimal('1.00')    // $1.00
Money.zero()                 // $0.00

money.toCents()              // bigint: 1000n
money.add(other)             // Money
money.subtract(other)        // Money
money.isGreaterThan(other)   // boolean
money.isLessThan(other)      // boolean
money.equals(other)          // boolean
money.toDecimal()            // "10.00" (bigint arithmetic)

formatCents(-50n)            // "-0.50" — signed values such as profit
```

**CRITICAL**: Never use `number` for money. Always `bigint` cents or `Money`.

## Entity Pattern

```typescript
export class XxxEntity {
  readonly id: string;
  private version: number;
  private events: XxxDomainEvent[];

  private constructor(id: string, ...) { ... }

  // Factory: create new (emits events)
  static async create(...): Promise<XxxEntity> {
    const id = crypto.randomUUID();
    const entity = new XxxEntity(id, ...);
    entity.addEvent(createXxxCreatedEvent(...));
    return entity;
  }

  // Factory: restore from DB (no events) — takes the same snapshot toPersistence() returns
  static restore(snapshot: XxxSnapshot): XxxEntity {
    return new XxxEntity(snapshot.id, ...);
  }

  // Business methods mutate state + emit events
  doSomething(): void {
    // Validate state
    if (this.status !== ExpectedStatus) throw new InvalidStateError(...);
    // Mutate
    this.status = NewStatus;
    this.version++;
    // Emit event
    this.addEvent(createXxxEvent(...));
  }

  // Extract events for publishing
  pullEvents(): XxxDomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  // For persistence
  toPersistence(): XxxSnapshot { return { ... }; }

  private addEvent(event: XxxDomainEvent): void { this.events.push(event); }
}
```

## Value Object Pattern

```typescript
export class XxxValueObject {
  private constructor(private readonly value: number) {}

  static fromValue(v: number): XxxValueObject {
    // Validate
    if (v < 0) throw new Error('...');
    return new XxxValueObject(v);
  }

  getValue(): number { return this.value; }

  // Business behavior
  calculatePayout(betCents: bigint): bigint { ... }
  shouldCrashAt(currentMultiplier: number): boolean { ... }
}
```

Project VOs: `CrashPoint`, `Multiplier`, `SeedChain`

## Domain Events

```typescript
// domain/events/xxx.events.ts
export interface XxxHappenedEvent extends DomainEvent {
  readonly eventType: 'XxxHappened';
  readonly aggregateId: string;
  readonly version: number;
  readonly occurredAt: Date;
  // ... specific fields
}

// Factory helper
export function createXxxHappenedEvent(aggregateId: string, ..., version: number): XxxHappenedEvent {
  return {
    ...createBaseEvent(aggregateId, version),
    eventType: 'XxxHappened',
    ...
  };
}

// Union type
export type XxxDomainEvent = XxxHappenedEvent | YyyHappenedEvent | ...;
```

## Domain Errors

```typescript
// domain/errors/domain.errors.ts
import { DomainError } from '@crash/domain';

export class XxxError extends DomainError {
  constructor(context: Money) {
    super(`Descriptive, user-facing message with $${context.toDecimal()}`, 'XXX_CODE');
  }
}
```

- Every error extends the shared `DomainError` (one base for all contexts) and has a
  stable `code`; map the code to an HTTP status in `infrastructure/http/error-status.ts`
- Value objects throw domain errors too — never `throw new Error(...)` in `domain/`
- Messages never contain internal ids; money is formatted with `toDecimal`/`formatCents`

Project errors: `RoundNotAcceptingBetsError`, `DuplicateBetError`, `InsufficientFundsError`,
`BetBelowMinimumError`, `InvalidMultiplierError`, `OptimisticLockError`, etc.

## Validation
- [ ] Private constructor + static factories only
- [ ] All mutations validate state before changing
- [ ] `version` incremented on every mutation
- [ ] Events emitted for all state changes
- [ ] `toPersistence()` returns plain object (no methods)
- [ ] Domain errors extend `DomainError` with a stable code and contextual message
- [ ] Validate all inputs before mutating any state
- [ ] Child entities record their own events; the aggregate root drains them in `pullEvents()`
- [ ] Money never represented as `number`
