---
name: messaging
description: Event-driven messaging patterns — RabbitMQ pub/sub, inbox/outbox, saga coordination, event schemas
triggers:
  - "rabbitmq"
  - "event publisher"
  - "domain event"
  - "inbox processor"
  - "outbox processor"
  - "message handler"
  - "saga"
  - "event driven"
tags: [messaging, rabbitmq, events, saga, crash-game]
---

# Messaging

Event-driven communication patterns between games and wallets services.

## Purpose

Guide all changes to messaging infrastructure, event schemas, and cross-service coordination.

## Architecture

```
Games Service                          Wallets Service
─────────────                          ────────────────
Round/ Bet aggregates                  Wallet aggregate
    │ pullEvents()                         │ pullEvents()
    ▼                                      ▼
EventPublisher ──RabbitMQ──→ GamesEventsController
    (fanout)              │               │
    │                     │               ▼
    │                     │    bet-placed.handler.ts
    │                     │    player-cashed-out.handler.ts
    │                     │               │
    │                     └───reply────────┤
    ▼                                     ▼
WalletEventsController           EventPublisher
  wallet-debited.handler.ts        (credit/debit)
  wallet-debit-failed.handler.ts
```

## Event Flow: Bet Placement (Saga)

```
1. Player places bet → Games creates Bet (PENDING)
2. Games publishes BetPlaced event → RabbitMQ
3. Wallets consumes BetPlaced → DebitWalletUseCase
4a. Success → Wallets publishes WalletDebited → Games confirms bet (ACTIVE)
4b. Failure → Wallets publishes WalletDebitFailed → Games cancels bet (CANCELLED)
```

## Event Flow: Cash Out

```
1. Player cashes out → Games calculates payout
2. Games publishes PlayerCashedOut event → RabbitMQ
3. Wallets consumes PlayerCashedOut → CreditWalletUseCase (payout)
```

## Event Schema Pattern

```typescript
// Domain events extend DomainEvent from @crash/messaging
export interface XxxEvent extends DomainEvent {
  readonly eventType: 'XxxEvent';
  readonly aggregateId: string;   // Round or Wallet ID
  readonly version: number;       // For optimistic locking
  readonly occurredAt: Date;
  // ... specific fields
}
```

### Games Events (published)
- `RoundStarted` — New round created, includes seedHash for provably fair
- `BettingPhaseEnded` — Round transitions to active
- `BetPlaced` — Player placed bet, includes betId + amountCents
- `PlayerCashedOut` — Player cashed out, includes multiplier + winAmount
- `RoundCrashed` — Round ended, reveals seed, includes stats
- `BetConfirmed` — Bet confirmed (WS notification)
- `BetCancelled` — Bet cancelled (WS notification)

### Games Events (consumed from wallets)
- `WalletDebited` — Wallet successfully debited → confirm bet
- `WalletDebitFailed` — Wallet debit failed → cancel bet

### Wallet Events (published)
- `WalletCreated`, `MoneyCredited`, `MoneyDebited`

## Inbox/Outbox Pattern

### Outbox (publishing side)
```typescript
// infrastructure/messaging/rabbitmq/outbox-processor.ts
// Ensures events are reliably published even if broker is temporarily down
```

### Inbox (consuming side)
```typescript
// infrastructure/messaging/rabbitmq/inbox-processor.ts
// Deduplicates incoming events to handle at-least-once delivery
// IInboxRepository tracks processed message IDs
```

## Handler Pattern

```typescript
// infrastructure/messaging/rabbitmq/handlers/wallet-debited.handler.ts
@Injectable()
export class WalletDebitedEventHandler {
  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepo: IBetRepository,
    private readonly confirmBetUseCase: ConfirmBetUseCase,
  ) {}

  @RabbitSubscribe({ exchange: 'games.events', queue: 'games.wallet-debited' })
  async handle(event: WalletDebitedEvent): Promise<void> {
    await this.confirmBetUseCase.execute({
      betId: event.betId,
      playerId: event.playerId,
      amountCents: event.amount,
    });
  }
}
```

## RabbitMQ Configuration

- Exchange: `games.events` (fanout)
- NestJS ClientsModule with `Transport.RMQ`
- DLQ setup via `dlq-setup.service.ts`
- Consumer groups ensure each service gets its own copy

## Validation
- [ ] Events follow `DomainEvent` interface from `@crash/messaging`
- [ ] Event factory functions include version for optimistic locking
- [ ] Handlers idempotent (inbox pattern) — safe to replay
- [ ] WS broadcast non-blocking (try/catch, log error)
- [ ] Saga states: PENDING → ACTIVE/CANCELLED for bets
- [ ] Money in events always `bigint` cents, never `number`
