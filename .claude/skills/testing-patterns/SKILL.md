---
name: testing-patterns
description: Testing patterns — Bun test runner, mock helpers, unit tests for use cases/entities, E2E with Docker
triggers:
  - "write test"
  - "unit test"
  - "e2e test"
  - "mock repository"
  - "test use case"
  - "test entity"
tags: [testing, bun, unit, e2e, crash-game]
---

# Testing Patterns

Testing conventions for the Crash Game project. Bun test runner for unit, E2E with Docker stack.

## Purpose

Ensure all tests follow consistent patterns with proper mocking, setup, and assertions.

## Test Runner

**Bun test** (`bun:test`):
```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
```

- Unit tests: `tests/unit/` — run with `bun run test`
- E2E tests: `tests/e2e/` — run with `bun run test:e2e` (requires `docker:up`)
- E2E helpers: `tests/e2e/helpers/` — compose.ts, jwt.ts, deterministic-seeds.ts

## Mock Helper Pattern

Project uses hand-rolled mocks (NOT jest.fn / vi.fn / bun `mock`). Each service has ONE
shared module — `tests/helpers/mocks.ts` — with `mockFn` and a factory per port. Do not
redefine mocks inside test files; pass `overrides` or call `mockResolvedValue` instead.

```typescript
import {
  FAKE_TX,
  mockFn,
  createMockRoundRepository,
  createMockBetRepository,
  createMockUnitOfWork,
  createMockBroadcaster,
  createMockMetrics,
} from '../../helpers/mocks';

const fn = mockFn(async (id: string) => null);
fn.mockResolvedValue(bet);       // also mockReturnValue / mockRejectedValue / mockImplementation
fn.calls;                        // [[arg1, arg2], ...]
fn.callCount;
```

`createMockUnitOfWork()` runs the `work` callback with `FAKE_TX` and records commits:
assert persisted events with `unitOfWork.commits` / `unitOfWork.committedEvents`, and
repository calls with `repo.save.calls` → `[[aggregate, FAKE_TX]]`.

## Use Case Test Pattern

```typescript
describe('XxxUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let unitOfWork: ReturnType<typeof createMockUnitOfWork>;
  let broadcaster: ReturnType<typeof createMockBroadcaster>;
  let useCase: XxxUseCase;

  beforeEach(() => {
    roundRepository = createMockRoundRepository();
    unitOfWork = createMockUnitOfWork();
    broadcaster = createMockBroadcaster();
    // Same order as the use case constructor
    useCase = new XxxUseCase(roundRepository as any, unitOfWork as any, broadcaster as any);
  });

  test('should do something', async () => {
    // Arrange
    const round = await Round.create(undefined, 'test-crash-10.0'); // deterministic crash point
    round.pullEvents(); // clear creation events
    roundRepository.findById.mockResolvedValue(round);

    // Act
    const result = await useCase.execute({ roundId: round.id });

    // Assert
    expect(unitOfWork.committedEvents.map((e) => e.eventType)).toEqual(['XxxHappened']);
    expect(roundRepository.save.calls).toEqual([[round, FAKE_TX]]);
    expect(result.amountCents).toBe(1000n);
  });
});
```

## Entity Test Pattern

```typescript
describe('XxxEntity', () => {
  test('should transition state correctly', async () => {
    const entity = await XxxEntity.create();
    entity.pullEvents(); // Clear creation events

    entity.doSomething();

    expect(entity.getStatus()).toBe(NewStatus);
    const events = entity.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('XxxHappened');
  });

  test('should throw on invalid state transition', () => {
    const entity = XxxEntity.restore(...);
    expect(() => entity.invalidAction()).toThrow(XxxDomainError);
  });
});
```

## E2E Test Pattern

E2E tests use real Docker services. Helpers provide:
- `compose.ts` — test infrastructure setup
- `jwt.ts` — JWT generation for auth
- `deterministic-seeds.ts` — predictable crash points

## Validation
- [ ] Mocks come from `tests/helpers/mocks.ts`, not redefined per file
- [ ] `as any` cast for mock → use case construction, in constructor order
- [ ] `round.pullEvents()` called after `Round.create()` to clear initial events
- [ ] Persisted events asserted through the unit of work mock (`commits` / `committedEvents`)
- [ ] Domain errors tested with `expect(() => ...).toThrow(ErrorClass)`
- [ ] Money amounts use `bigint` literals (e.g., `1000n`)
- [ ] Every bug fix gets a regression test describing the old wrong behavior
