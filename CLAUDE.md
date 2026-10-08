# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fullstack challenge for a Crash Game — multiplayer real-time casino game. Backend services (games + wallets) communicate via message broker (RabbitMQ), frontend connects via REST + WebSocket.

**Tech Stack:**
- Runtime: Bun
- Backend: NestJS + TypeScript (strict mode)
- Databases: PostgreSQL 18 (databases: `games`, `wallets`)
- Message Broker: RabbitMQ
- API Gateway: Kong (DB-less, declarative)
- IdP: Keycloak (realm: `crash-game`)
- Frontend: Vite/Next.js/TanStack Start (candidate implements)

## Commands

### Root (monorepo)
```bash
bun run docker:up      # Start entire stack (infra + services)
bun run docker:down    # Stop containers
bun run docker:prune   # Remove everything (volumes, images, orphans)
```

### Games Service
```bash
cd services/games
bun run dev            # Watch mode
bun run start          # Production
bun run typecheck      # tsc --noEmit
bun run test           # Unit tests (tests/unit)
bun run test:e2e       # E2E tests (requires docker:up)
```

### Wallets Service
```bash
cd services/wallets
bun run dev            # Watch mode
bun run start          # Production
bun run typecheck      # tsc --noEmit
bun run test           # Unit tests (tests/unit)
bun run test:e2e       # E2E tests (requires docker:up)
```

## Architecture

### Monorepo Structure
```
services/
├── games/       # Game service (rounds, bets, crash logic)
├── wallets/     # Wallet service (balance, credit/debit)
packages/        # Shared packages: @crash/domain, @crash/messaging, @crash/http, @crash/observability
frontend/        # Frontend (to be implemented)
```

### DDD Layer Structure (each service)
```
src/
├── domain/          # Entities, value objects, domain logic
├── application/     # Use cases, application services
├── infrastructure/  # DB, message broker, external integrations
└── presentation/    # Controllers, DTOs
```

### Service Communication
- **Games → Wallet**: Async via RabbitMQ/SQS for credit/debit operations
- **REST API**: All endpoints accessed via Kong gateway (`localhost:8000`)
- **WebSocket**: Server → client push only (real-time game state)

### API Routes (via Kong)
- Games: `http://localhost:8000/games/*` → service port `4001`
- Wallets: `http://localhost:8000/wallets/*` → service port `4002`

### Infrastructure Services
- PostgreSQL: `localhost:5432` (user: `admin`, pass: `admin`)
- RabbitMQ: `localhost:5672` (admin/admin), UI: `localhost:15672`
- Keycloak: `localhost:8080` (admin/admin), realm: `crash-game`
- Kong Admin: `localhost:8001`

### Keycloak Test User
- Username: `player` / Password: `player123`
- Client ID: `crash-game-client` (public, PKCE S256)
- Redirect URIs: `http://localhost:3000/*`, `http://localhost:5173/*`

## Domain Rules

### Game Service
- **Round**: Aggregate managing round lifecycle (betting → active → crashed)
- **Bet**: One bet per player per round
- **Crash Point**: Pre-determined via provably fair algorithm
- Bets: min `1.00`, max `1,000.00`

### Wallet Service
- **NEVER use floating point for money** — use integer cents (BIGINT/NUMERIC/Decimal)
- **Wallet**: One per player, balance must never go negative

### Game Flow
1. Betting phase (configurable window, e.g., 10s)
2. Round starts: multiplier rises from `1.00x`
3. Players cash out anytime (bet × current multiplier)
4. Crash: pre-determined point, non-cashed bets lose

## Critical Implementation Notes

- **Monetary precision**: Always use integers (cents) or decimal types — never `number` for money
- **Service communication**: Design events for at-least-once delivery with idempotency
- **WebSocket**: Server push only; player actions (bet/cashout) via REST
- **Provably fair**: Crash point must be verifiable by players post-round
- **Tests required**: Unit tests for domain logic, E2E for API flows

## Environment Setup

Each service has `.env.example` — copy to `.env` before running outside Docker:
```bash
cp services/games/.env.example services/games/.env
cp services/wallets/.env.example services/wallets/.env
```

Infra credentials are hardcoded in `docker-compose.yml` for local dev (no root `.env` needed).

## Git Commit Rules

- **Semantic commits in English** — Use conventional commits format:
  - `feat:` new feature
  - `fix:` bug fix
  - `refactor:` code refactoring
  - `test:` adding/updating tests
  - `docs:` documentation
  - `chore:` maintenance tasks
- **Granular commits** — One logical change per commit, small and focused
- **NO co-author** — Never add `Co-Authored-By: Claude` or similar to commits

## Repository Skills (MANDATORY)

When working in specific areas of the codebase, read and follow the relevant skill file BEFORE making any code changes. These skills contain the exact patterns, conventions, and coding standards that MUST be followed:

| Skill | File | When to Use |
|-------|------|-------------|
| **games-service** | `.claude/skills/games-service/SKILL.md` | Any change to `services/games/` — use cases, entities, round lifecycle, bet saga, WebSocket |
| **wallets-service** | `.claude/skills/wallets-service/SKILL.md` | Any change to `services/wallets/` — balance ops, credit/debit, inbox/outbox |
| **frontend** | `.claude/skills/frontend/SKILL.md` | Any change to `frontend/` — components, hooks, store, WebSocket client, API layer |
| **domain-modeling** | `.claude/skills/domain-modeling/SKILL.md` | Creating/modifying entities, value objects, domain events, errors, or Money usage |
| **testing-patterns** | `.claude/skills/testing-patterns/SKILL.md` | Writing unit or E2E tests — mock factories, entity tests, use case tests |
| **infrastructure** | `.claude/skills/infrastructure/SKILL.md` | Docker, Kong routes, Keycloak, RabbitMQ config, environment changes |
| **messaging** | `.claude/skills/messaging/SKILL.md` | Event schemas, RabbitMQ handlers, inbox/outbox, saga coordination between services |

### How to Use Skills

1. **Identify the area** you're working on (games, wallets, frontend, tests, etc.)
2. **Read the skill file** before making changes — it contains project-specific patterns
3. **Follow the validation checklist** at the end of each skill before completing work
4. **Multiple skills may apply** — e.g., adding a new use case requires both `games-service` and `testing-patterns`
