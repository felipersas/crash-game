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

Project uses custom mock factory functions (NOT jest.fn or vi.fn):

```typescript
// Reusable mock helper
function mockFn<T extends (...args: any[]) => any>(impl?: T) {
  const fn: any = (...args: any[]) => {
    fn.callCount++;
    return fn._impl(...args);
  };
  fn._impl = impl || (() => {});
  fn.callCount = 0;
  fn.mockReturnValue = (v: any) => { fn._impl = () => v; };
  fn.mockResolvedValue = (v: any) => { fn._impl = () => Promise.resolve(v); };
  return fn as T & { callCount: number; mockReturnValue: (v: any) => void; mockResolvedValue: (v: any) => void; };
}
```

## Repository Mocks

```typescript
function createMockRoundRepository(overrides = {}) {
  return {
    findCurrentRound: mockFn(() => Promise.resolve(null)),
    create: mockFn(() => Promise.resolve()),
    save: mockFn(() => Promise.resolve()),
    findById: mockFn(() => Promise.resolve(null)),
    findHistory: mockFn(() => Promise.resolve([])),
    findHistoryCount: mockFn(() => Promise.resolve(0)),
    ...overrides,
  };
}

function createMockBetRepository(overrides = {}) {
  return {
    create: mockFn(() => Promise.resolve()),
    update: mockFn(() => Promise.resolve()),
    findById: mockFn(() => Promise.resolve(null)),
    findByRound: mockFn(() => Promise.resolve([])),
    findByPlayerAndRound: mockFn(() => Promise.resolve(null)),
    findByPlayerPaginated: mockFn(() => Promise.resolve([])),
    countByPlayer: mockFn(() => Promise.resolve(0)),
    ...overrides,
  };
}

function createMockEventPublisher() {
  return {
    publish: mockFn(() => Promise.resolve()),
    publishBatch: mockFn(() => Promise.resolve()),
    isConnected: mockFn(() => true),
  };
}

function createMockGamesGateway(overrides = {}) {
  return {
    broadcastBetPlaced: mockFn(() => {}),
    broadcastBetConfirmed: mockFn(() => {}),
    broadcastBetCancelled: mockFn(() => {}),
    broadcastPlayerCashedOut: mockFn(() => {}),
    broadcastRoundStarted: mockFn(() => {}),
    broadcastBettingEnded: mockFn(() => {}),
    broadcastMultiplierUpdate: mockFn(() => {}),
    broadcastCrash: mockFn(() => {}),
    ...overrides,
  };
}
```

## Use Case Test Pattern

```typescript
describe('XxxUseCase', () => {
  let roundRepository: ReturnType<typeof createMockRoundRepository>;
  let betRepository: ReturnType<typeof createMockBetRepository>;
  let eventPublisher: ReturnType<typeof createMockEventPublisher>;
  let gamesGateway: ReturnType<typeof createMockGamesGateway>;
  let useCase: XxxUseCase;

  beforeEach(() => {
    roundRepository = createMockRoundRepository();
    betRepository = createMockBetRepository();
    eventPublisher = createMockEventPublisher();
    gamesGateway = createMockGamesGateway();
    useCase = new XxxUseCase(
      roundRepository as any,
      betRepository as any,
      eventPublisher as any,
      gamesGateway as any,
    );
  });

  test('should do something', async () => {
    // Arrange
    const round = await Round.create(DEFAULT_ROUND_CONFIG);
    round.pullEvents(); // Clear creation events
    roundRepository.findCurrentRound.mockResolvedValue(round);

    // Act
    const result = await useCase.execute({ playerId: 'p1', amountCents: 1000n });

    // Assert
    expect(result.roundId).toBe(round.id);
    expect(betRepository.create.callCount).toBe(1);
    expect(eventPublisher.publishBatch.callCount).toBe(1);
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
- [ ] Mock factories used, not jest.fn/vi.fn
- [ ] `as any` cast for mock→use case construction
- [ ] `round.pullEvents()` called after `Round.create()` to clear initial events
- [ ] Event counts verified with `publishBatch.callCount`
- [ ] Domain errors tested with `expect(() => ...).toThrow(ErrorClass)`
- [ ] Money amounts use `bigint` literals (e.g., `1000n`)
