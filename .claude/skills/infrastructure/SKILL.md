---
name: infrastructure
description: Infrastructure setup — Docker Compose, Kong API Gateway, Keycloak IdP, PostgreSQL, Redis, RabbitMQ
triggers:
  - "docker compose"
  - "kong config"
  - "keycloak"
  - "rabbitmq"
  - "redis"
  - "postgres"
  - "infrastructure"
  - "api gateway"
tags: [infrastructure, docker, kong, keycloak, rabbitmq, redis, crash-game]
---

# Infrastructure

Infrastructure patterns and configuration for the Crash Game stack.

## Purpose

Guide changes to Docker Compose, Kong routes, Keycloak realms, and infrastructure wiring.

## Docker Compose Stack

```
docker-compose.yml
├── postgres-games    # PostgreSQL 18, DB: games, port 5432
├── postgres-wallets  # PostgreSQL 18, DB: wallets, port 5433
├── rabbitmq          # RabbitMQ 3, ports 5672/15672 (admin/admin)
├── keycloak          # Keycloak, port 8080 (admin/admin), realm: crash-game
├── redis             # Redis 7, port 6379
├── kong              # API Gateway, ports 8000 (proxy) / 8001 (admin)
├── games-service     # NestJS, port 4001
└── wallets-service   # NestJS, port 4002
```

### Commands
```bash
bun run docker:up      # Start entire stack
bun run docker:down    # Stop containers
bun run docker:prune   # Remove everything (volumes, images, orphans)
```

## Kong API Gateway

- **DB-less, declarative**: `docker/kong/kong.yml`
- Auth: `bearer_jwt_verify` via JWKS discovery from Keycloak
- Route prefixes: `/games/*` → port 4001, `/wallets/*` → port 4002
- WebSocket passthrough: `/socket.io/` → games service

### Kong Route Pattern
```yaml
# docker/kong/kong.yml
services:
  - name: games-service
    url: http://games-service:4001
    routes:
      - name: games-api
        paths:
          - /games
        strip_path: false
    plugins:
      - name: bearer_jwt_verify
        config:
          uri_param_names: []
          claims_to_verify:
            - exp
```

## Keycloak

- **Realm**: `crash-game`
- **Client**: `crash-game-client` (public, PKCE S256)
- **Test user**: `player` / `player123`
- **Redirect URIs**: `http://localhost:3000/*`, `http://localhost:5173/*`
- **Kong plugin**: `kong-oidc` (nokia) patched for Kong 3.x, uses JWKS discovery

## RabbitMQ

- **Exchange**: `games.events` (fanout type)
- Games service publishes domain events
- Wallets service consumes: `BetPlaced`, `PlayerCashedOut`
- Games service consumes: `WalletDebited`, `WalletDebitFailed`
- **At-least-once delivery** with inbox/outbox pattern for idempotency

## Redis

- Used by `RedisService` in games service
- Stores current round state (persisted every 100ms during active phase)
- Used for idempotency cache (`IDEMPOTENCY_CACHE` token)
- `RoundState` interface: id, status, crashPoint, currentMultiplier, timestamps, version

## PostgreSQL

- Two separate databases: `games` and `wallets`
- User: `admin`, Password: `admin`
- Prisma ORM with migrations
- Optimistic locking via `version` column on Round and Wallet tables

## Environment Variables

Each service has `.env.example` — copy to `.env` for local development:
```bash
cp services/games/.env.example services/games/.env
cp services/wallets/.env.example services/wallets/.env
```

Infra credentials hardcoded in `docker-compose.yml` for local dev.

## Validation
- [ ] Kong routes match actual service endpoints
- [ ] New services registered in docker-compose.yml
- [ ] CORS origins match frontend dev servers
- [ ] RabbitMQ exchange type is fanout
- [ ] Keycloak client has correct redirect URIs
