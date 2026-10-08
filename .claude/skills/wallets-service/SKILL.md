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
├── domain/           # Wallet aggregate, wallet events, domain errors
├── application/      # Use cases, ports (interfaces/), integration events (events/), di.tokens.ts
├── infrastructure/   # Prisma adapters + unit of work, outbox/inbox, RabbitMQ consumer, di.tokens.ts
└── presentation/     # WalletsController, DTOs (with static from())
```

Same layering and conventions as the games service (see games-service skill): ports in
`application/di.tokens.ts`, `IUnitOfWork` + `TransactionContext`, no infrastructure import
from application, shared `@crash/http` filter/`UserContext`.

## Key Patterns

### Wallet Entity
- `Wallet.create(playerId)` — zero balance, emits `WalletCreated`
- `Wallet.restore(id, playerId, balanceCents, version)` — rehydration, no events
- `credit(amount: Money, reason)` / `debit(amount: Money, reason)` — bump `version`, emit
  `MoneyCredited` / `MoneyDebited`; `debit` throws `InsufficientFundsError`
- Optimistic locking via `version` (`OptimisticLockError` on conflict)

### CRITICAL: Money Handling
- **NEVER use floating point** — `bigint` cents or `Money` from `@crash/domain`
- Format with `formatCents` / `Money.toDecimal()`; API balance is a string of cents
- DB column: `BIGINT` cents

### Use Cases
- `CreateWalletUseCase` — idempotent creation
- `GetWalletUseCase`
- `CreditWalletUseCase` — credit by player (cash-out payouts)
- `DebitBetStakeUseCase` — bet saga step: debit + `WalletDebited` reply (or
  `WalletDebitFailed` for business rejections) committed in ONE transaction

### Exactly-once money movements
Consumers run inside `IdempotentInbox.process(key, type, payload, handler)`; the handler
receives the inbox event id and the use case marks it PROCESSED inside the same
`unitOfWork.commit`, so a retry can never debit or credit twice.
Only transient errors (`OptimisticLockError`, DB connectivity) are retried; business
rejections are final outcomes.

### Event-Driven Operations
- `BetPlaced` → `DebitBetStakeUseCase` → `WalletDebited` | `WalletDebitFailed`
- `PlayerCashedOut` → `CreditWalletUseCase` (payout)
- Saga replies are integration events in `application/events/bet-stake.events.ts`

## Routes (via Kong)
- `GET /wallets/me` — Get authenticated player's wallet
- `POST /wallets` — Create wallet for player
- `GET /wallets/health` — Health check

## Validation
- [ ] No `number` for money — `bigint` / `Money`
- [ ] Wallet balance never negative — `debit()` enforces it
- [ ] Money movements committed with their events and inbox mark in one `unitOfWork.commit`
- [ ] Business rejections are replied, not retried; transient errors are rethrown
- [ ] Optimistic lock version incremented on every mutation
- [ ] Domain errors extend `DomainError` with a code mapped in `infrastructure/http/error-status.ts`
