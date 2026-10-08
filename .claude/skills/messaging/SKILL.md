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
- Use cases call `unitOfWork.commit(aggregateId, events, work)`: aggregate changes and
  outbox rows are written in ONE transaction (`PrismaUnitOfWork` + `OutboxWriter`)
- After commit `OutboxWriter.publishNow()` publishes best-effort; `OutboxProcessor` polls
  PENDING rows, marks them FAILED after max retries and purges old SENT rows
- Events are serialized with `serializeEvent` from `@crash/messaging` (bigint → string)

### Inbox (consuming side)
- `IdempotentInbox.process(idempotencyKey, eventType, payload, handler)`:
  first delivery runs the handler; duplicates of PROCESSED/in-flight events are skipped;
  FAILED or stale PENDING events are retried; failures increment `retryCount`
- Money movements (wallets) mark the inbox event PROCESSED inside their own commit
- `InboxProcessor` retries FAILED events every minute (bounded) and purges old rows

## Handler Pattern

```typescript
// infrastructure/messaging/rabbitmq/handlers/wallet-debited.handler.ts
@Injectable()
export class WalletDebitedEventHandler {
  constructor(
    private readonly confirmBetUseCase: ConfirmBetUseCase,
    private readonly inbox: IdempotentInbox,
  ) {}

  async handle(event: WalletDebitedMessage): Promise<void> {
    await this.inbox.process(`wallet-debit-${event.betId}`, 'WalletDebited', event, async () => {
      await this.confirmBetUseCase.execute({
        roundId: RoundId.from(event.roundId),
        betId: BetId.from(event.betId),
        playerId: PlayerId.from(event.playerId),
      });
    });
  }
}
```

Consumers are NestJS `@EventPattern` controllers (`WalletEventsController`,
`GamesEventsController`) that ack on success and reject (or re-queue transient errors).
Consumed payloads are typed as wire messages (`*Message` in `messaging/types`), where
bigint amounts arrive as strings — convert with `BigInt(...)`.

## RabbitMQ Configuration

- Exchange: `games.events` (fanout)
- NestJS ClientsModule with `Transport.RMQ`
- DLQ setup via `dlq-setup.service.ts`
- Consumer groups ensure each service gets its own copy

## Validation
- [ ] Events follow `DomainEvent` interface from `@crash/messaging`
- [ ] Event factory functions include version for optimistic locking
- [ ] Handlers wrapped in `IdempotentInbox` — safe to replay
- [ ] Events written through `unitOfWork.commit`, never published directly from use cases
- [ ] WS broadcast non-blocking (try/catch, log error)
- [ ] Saga states: PENDING → ACTIVE/CANCELLED for bets
- [ ] Money in events always `bigint` cents, never `number`
