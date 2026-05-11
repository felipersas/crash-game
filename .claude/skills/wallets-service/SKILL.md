---
name: wallets-service
description: Wallets service patterns — NestJS DDD, balance operations, optimistic locking, event-driven credits/debits
triggers:
  - "wallets service"
  - "wallet balance"
  - "debit wallet"
  - "credit wallet"
  - "wallet controller"
  - "wallet use case"
tags: [backend, nestjs, ddd, wallets, crash-game]
---

# Wallets Service

Patterns for `services/wallets/` — NestJS service managing player wallets with event sourcing.

## Purpose

Guide all changes to the wallets service following established DDD architecture and money handling conventions.

## Architecture

```
services/wallets/src/
├── domain/           # Wallet entity, Wallet events, Domain errors
├── application/      # Use cases (credit, debit, create, get), Repository interfaces, PlayerWalletResolver
├── infrastructure/   # Prisma repo, RabbitMQ handlers (inbox/outbox), DI tokens, Filters/Interceptors
└── presentation/     # WalletsController, DTOs, @UserContext decorator
```

## Key Patterns

### Wallet Entity
- `Wallet.create(playerId)` — new wallet with zero balance, emits `WalletCreatedEvent`
- `Wallet.restore(id, playerId, balanceCents, version)` — rehydration, no events
- `credit(amount: Money, reason: string)` — always succeeds, emits `MoneyCreditedEvent`
- `debit(amount: Money, reason: string)` — throws `InsufficientFundsError` if insufficient
- `canDebit(amount: Money): boolean` — non-throwing check
- `pullEvents()` — extract and clear domain events
- Optimistic locking via `version` field

### CRITICAL: Money Handling
- **NEVER use floating point** — always `bigint` cents or `Money` from `@crash/domain`
- `Money.fromCents(1000n)` — $10.00
- `Money.fromDecimal('1.00')` — $1.00
- `wallet.getBalance().toCents()` — returns `bigint`
- DB column: `BIGINT` / `NUMERIC` for cents

### Use Cases
```typescript
@Injectable()
export class DebitWalletUseCase implements IUseCase<DebitInput, DebitOutput> {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: IWalletRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}
}
```

### Event-Driven Operations
Wallets react to games events via RabbitMQ:
- `BetPlaced` → Debit wallet (async, at-least-once delivery)
- `PlayerCashedOut` → Credit wallet (payout)
- Reply with `WalletDebited` or `WalletDebitFailed` events

### Inbox/Outbox Pattern
- `inbox-processor.ts` — deduplicates incoming events
- `outbox-processor.ts` — ensures reliable event publishing
- `dlq-setup.service.ts` — dead letter queue for failed messages
- Handlers: `bet-placed.handler.ts`, `player-cashed-out.handler.ts`

### PlayerWalletResolver
`application/services/player-wallet-resolver.service.ts` — resolves or creates wallet for a player idempotently.

### DI Tokens
```typescript
export const WALLET_REPOSITORY = 'WALLET_REPOSITORY';
export const INBOX_REPOSITORY = 'INBOX_REPOSITORY';
```

## Routes (via Kong)
- `GET /wallets/me` — Get authenticated player's wallet
- `POST /wallets` — Create wallet for player
- `GET /wallets/health` — Health check

## Validation
- [ ] No `number` for money — always `bigint` / `Money`
- [ ] Wallet balance never negative — `canDebit()` check before `debit()`
- [ ] Domain events pulled after mutation
- [ ] Inbox pattern for idempotency on incoming events
- [ ] Optimistic lock version incremented on every mutation
- [ ] `InsufficientFundsError` thrown with context (current balance, attempted amount)
