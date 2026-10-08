---
name: games-service
description: Games service patterns — NestJS DDD, round lifecycle, bet saga, WebSocket broadcasting
triggers:
  - "games service"
  - "round lifecycle"
  - "bet placement"
  - "cash out"
  - "crash point"
  - "games controller"
  - "games use case"
tags: [backend, nestjs, ddd, games, crash-game]
---

# Games Service

Patterns for `services/games/` — NestJS service implementing the Crash Game domain.

## Purpose

Guide all changes to the games service following established DDD architecture and conventions.

## Architecture

```
services/games/src/
├── domain/           # Round (aggregate root) + Bet, VOs (CrashPoint, Multiplier, SeedChain),
│                     # events, errors, crypto/sha256, services/provably-fair
├── application/      # Use cases, ports (interfaces/), di.tokens.ts, services/
├── infrastructure/   # Prisma adapters + unit of work, outbox/inbox, RabbitMQ, Redis,
│                     # WebSocket, scheduling (lifecycle), BullMQ workers, di.tokens.ts
└── presentation/     # GamesController, DTOs (with static from())
```

Dependency rule: `domain` imports nothing from other layers; `application` imports only
`domain` and its own ports; never import `@/infrastructure/*` or Prisma from application.

## Key Patterns

### Entity Pattern
- Private constructor + static factories: `create()` for new aggregates (emit events),
  `restore(snapshot)` for rehydration (no events)
- `toPersistence()` returns the same snapshot shape `restore()` accepts
- Business rules live in the aggregate; validate BEFORE mutating
- Bets record `BetConfirmed`/`BetCancelled` themselves; `Round.pullEvents()` also drains
  the events of its bets — never build events in use cases
- `Money` from `@crash/domain` for amounts, `bigint` cents in outputs — never `number`

### Use Case Pattern
```typescript
@Injectable()
export class XxxUseCase implements IUseCase<XxxInput, XxxOutput> {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: XxxInput): Promise<XxxOutput> {
    const round = await this.roundRepository.findById(input.roundId);
    round.doSomething();                                   // domain rule + events
    await this.unitOfWork.commit(round.id, round.pullEvents(), (tx) =>
      this.roundRepository.save(round, tx),                // same transaction as outbox
    );
    this.broadcaster.broadcastXxx({ ... });                // best-effort, after commit
    return { ... };                                        // bigint money
  }
}
```

**Flow**: load aggregate → mutate (domain) → `unitOfWork.commit` (persist + outbox) →
side effects (broadcast, Redis, metrics) → output.

### Ports and DI Tokens
- `application/di.tokens.ts`: ports used by use cases (`ROUND_REPOSITORY`, `BET_REPOSITORY`,
  `UNIT_OF_WORK`, `GAME_BROADCASTER`, `ROUND_STATE_PROVIDER`, `AUTO_CASHOUT_REPOSITORY`, ...)
- `infrastructure/di.tokens.ts`: infra-only wiring (`RABBITMQ_PUBLISHER`, `GAMES_GATEWAY`,
  `REDIS_CLIENT`, queue names)
- `IUnitOfWork.commit(aggregateId, events, work?)` — `work` receives an opaque
  `TransactionContext` that repositories accept as `tx?`

### Round Lifecycle
- `RoundLifecycleManager` owns the live round (BETTING → ACTIVE → CRASHED) and delegates to
  `CreateRoundUseCase`, `StartRoundUseCase`, `CrashRoundUseCase`
- Rounds are created only from the provably fair `SeedChain`
- Ticks never overlap; timer callbacks never throw (game loop must survive failures)
- `BetTimeoutHandler` cancels stale PENDING bets one by one
- Optimistic locking via `version`: `OptimisticLockError` → reload + retry once

### Bet Saga
States: `PENDING → ACTIVE → CASHED_OUT | LOST` (or `CANCELLED`)
- Wallet replies reference a bet id: load with `findById` and check ownership (`loadOwnedBet`)
- A round crash cancels PENDING bets and marks ACTIVE bets LOST

### Messaging
- Outbox: `OutboxWriter` + `OutboxProcessor` (FAILED after max retries)
- Inbox: wrap consumers in `IdempotentInbox.process(key, type, payload, handler)`
- Wire messages are typed in `infrastructure/messaging/types` (amounts are strings)

### Prisma Interop
Mapping lives in the repository/mapper (`bet.mapper.ts`): rows → `restore(snapshot)`,
enums cast to `$Enums.*`. Detect Prisma errors with `Prisma.PrismaClientKnownRequestError`.

### WebSocket
- Server push only via `GamesGateway`, wrapped by `ResilientGameBroadcaster`
- Broadcast methods take one typed payload object; money converted to JSON numbers at the gateway

### HTTP
- Errors: `AllExceptionsFilter` from `@crash/http`, status per error code in
  `infrastructure/http/error-status.ts`
- `@UserContext()` from `@crash/http`; DTOs map outputs with `XxxDto.from(output)` and
  format money with `formatCents` (bigint), never `Number(cents) / 100`

## Routes (via Kong)
- `POST /games/bet` — Place bet (202, confirmation is asynchronous)
- `POST /games/bet/cashout` — Cash out (idempotent via `idempotencyKey`)
- `GET /games/bets/me` — Player's bets (paginated, with summary)
- `GET /games/bets/:betId` — Bet status (polling)
- `GET /games/rounds/current` — Current round state
- `GET /games/rounds/history` — Round history (paginated)
- `GET /games/rounds/:roundId/verify` — Provably fair verification
- `GET /games/health` — Health check

## Validation
- [ ] No `number` for money in domain/application — `Money` / `bigint` cents
- [ ] No infrastructure or Prisma import in `domain/` or `application/`
- [ ] Persistence + events go through `unitOfWork.commit`; events come from aggregates
- [ ] Side effects (broadcast, Redis) after commit and never fail the use case
- [ ] Domain errors extend `DomainError` with a stable code mapped in `error-status.ts`
- [ ] Use case inputs/outputs are interfaces; DTOs only in presentation
- [ ] Tests use `tests/helpers/mocks.ts` factories
