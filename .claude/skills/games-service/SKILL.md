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
├── domain/           # Entities (Round, Bet), VOs (CrashPoint, Multiplier, SeedChain), Events, Errors
├── application/      # Use cases (one per operation), Repository interfaces, Shared utils
├── infrastructure/   # Prisma repos, RabbitMQ pub/sub, Redis, WebSocket gateway, Scheduling, DI tokens
└── presentation/     # Controllers, DTOs, Decorators (@UserContext)
```

## Key Patterns

### Entity Pattern
- Private constructor + static factory methods: `static create()`, `static restore()`
- `toPersistence()` for infrastructure conversion
- `pullEvents()` for domain event extraction (event sourcing)
- Encapsulate ALL business rules — no getters/setters for mutation
- Use `Money` from `@crash/domain` — NEVER raw numbers for amounts

### Use Case Pattern
```typescript
@Injectable()
export class XxxUseCase implements IUseCase<Input, Output> {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepo: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepo: IBetRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: Input): Promise<Output> { ... }
}
```

**Use case flow**: Load aggregate → mutate → persist → pull events → publish batch → broadcast WS

### DI Tokens
All tokens in `infrastructure/di/tokens.ts`. Use `useExisting` for interface→impl aliasing:
```typescript
{ provide: GAME_BROADCASTER, useExisting: GAMES_GATEWAY },
```

### Round Lifecycle
- `RoundLifecycleManager` orchestrates: BETTING → ACTIVE → CRASHED
- `RoundCrashHandler` extracted for crash processing
- `BetTimeoutHandler` cancels stale PENDING bets via `findStalePendingBets(olderThan)`
- Optimistic locking via version field — handle `OptimisticLockError` with reload+retry

### Domain Events
All events defined in `domain/events/round.events.ts` with factory helpers (`createXxxEvent`).
Union type `GameDomainEvent` for type safety.

### Bet Saga
States: `PENDING → ACTIVE → CASHED_OUT | LOST` (or `CANCELLED`)
- PENDING: Created, waiting for wallet debit confirmation
- ACTIVE: Wallet confirmed, participating in round
- CASHED_OUT: Player cashed out at multiplier
- LOST: Round crashed before cash out
- CANCELLED: Wallet rejected or bet replaced

### Prisma Interop
Domain enums (`RoundStatus`, `BetStatus`) cast `as any` for Prisma (same strings, different types).
Typed `RoundRow`/`BetRow` interfaces for repository results — no `any`.

### WebSocket
- Server push only via `GamesGateway` (Socket.IO)
- Auth via Kong JWT passthrough
- CORS restricted to `localhost:3000` + `localhost:5173`
- Broadcast methods: `broadcastRoundStarted`, `broadcastBetPlaced`, `broadcastCrash`, etc.

## Routes (via Kong)
- `POST /games/bet` — Place bet
- `POST /games/cashout` — Cash out
- `GET /games/current` — Current round state
- `GET /games/history` — Round history (paginated)
- `GET /games/bets/me` — Player's bets
- `GET /games/verify/:roundId` — Provably fair verification
- `GET /games/health` — Health check

## Validation
- [ ] No raw `number` for money — always `Money` / `bigint` cents
- [ ] Domain events pulled and published after mutation
- [ ] WebSocket broadcast wrapped in try/catch (non-blocking)
- [ ] DI tokens used, not string literals
- [ ] Domain errors extend base, thrown from entities
- [ ] Use case inputs/outputs defined as interfaces (not DTOs)
