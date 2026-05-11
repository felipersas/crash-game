# Arquitetura do Sistema - Crash Game

## Visão Geral

O Crash Game é um jogo de casino multiplayer em tempo real onde um multiplicador sobe exponencialmente a partir de 1.00x e "crasha" em um ponto predeterminado. Jogadores apostam antes do round e sacam (cash out) a qualquer momento durante o jogo. O objetivo é sacar antes do crash para multiplicar o valor apostado.

O sistema é composto por **dois microsserviços** (Games e Wallets) que se comunicam via **mensageria assíncrona** (RabbitMQ), com um **API Gateway** (Kong) e **Identity Provider** (Keycloak) na frente.

---

## Stack Tecnológica

| Componente | Tecnologia | Versão | Propósito |
|------------|-----------|--------|-----------|
| Runtime | Bun | latest | JavaScript/TypeScript runtime |
| Backend | NestJS | 10+ | Framework modular com DI |
| Linguagem | TypeScript | strict | Type safety em todas as camadas |
| DB Principal | PostgreSQL | 18 | Persistência relacional |
| Mensageria | RabbitMQ | 4.2 | Comunicação assíncrona entre serviços |
| API Gateway | Kong | 3.9 (DB-less) | Roteamento, autenticação JWT, rate limiting |
| Identity | Keycloak | 26.5 | OAuth2/OIDC com PKCE |
| Frontend | Next.js | 16 | SPA com WebSocket |
| ORM | Prisma | 5+ | Acesso ao PostgreSQL |

**Decisão arquitetural - NestJS**: Escolhido pela arquitetura modular nativa (modules, providers, controllers), dependency injection built-in, e suporte first-class para WebSocket, mensageria (RabbitMQ via @nestjs/microservices), e scheduling (crons). A estrutura modular do NestJS alinha naturalmente com DDD.

**Decisão arquitetural - Bun vs Node**: Bun oferece startup mais rápido, melhor performance para operações de filesystem (seed chain), e TypeScript nativo sem transpilação. Compatível com o ecossistema Node.js.

---

## Topologia do Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Next.js)                            │
│                    localhost:3000 / localhost:5173                      │
│                                                                         │
│  REST API ──────────────────── WebSocket (Socket.IO)                    │
│  (bet, cashout, history)      (multiplier, crash, bets em tempo real)  │
└───────────┬─────────────────────────────────┬───────────────────────────┘
            │                                 │
            ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         KONG API GATEWAY (DB-less)                      │
│                            localhost:8000                                │
│                                                                         │
│  ┌──────────────────────┐    ┌───────────────────────┐                  │
│  │  bearer_jwt_verify   │    │   Rate Limiting       │                  │
│  │  (JWKS discovery)    │    │   CORS                │                  │
│  └──────────────────────┘    └───────────────────────┘                  │
│                                                                         │
│  /games/*  ──────────────────────────►  Games Service :4001            │
│  /wallets/* ─────────────────────────►  Wallets Service :4002          │
└─────────────────────────────────────────────────────────────────────────┘
            │                                 │
            ▼                                 ▼
┌───────────────────────┐         ┌───────────────────────┐
│   GAMES SERVICE       │         │   WALLETS SERVICE     │
│   localhost:4001      │         │   localhost:4002      │
│                       │         │                       │
│  DB: games (PG)       │         │  DB: wallets (PG)     │
│  Inbox + Outbox       │         │  Inbox + Outbox       │
│  (padrões de         │         │  (padrões de         │
│  WebSocket Gateway    │         │   resiliência)        │
└───────────┬───────────┘         └───────────┬───────────┘
            │                                  │
            │      ┌──────────────────┐        │
            │      │    RabbitMQ      │        │
            └─────►│  localhost:5672  │◄───────┘
                   │                  │
                   │  Exchange:       │
                   │  games.events    │
                   │  (fanout)        │
                   │                  │
                   │  wallets consome │
                   │  games events    │
                   │                  │
                   │  games consome   │
                   │  wallet events   │
                   └──────────────────┘
```

**Decisão arquitetural - API Gateway (Kong)**: Centraliza autenticação (JWT verify via JWKS do Keycloak), roteamento e rate limiting. Os serviços não precisam saber sobre autenticação — recebem claims do JWT já validados pelo Kong. Kong DB-less com configuração declarativa (`kong.yml`) simplifica deploy e versionamento.

**Decisão arquitetural - Comunicação assíncrona (RabbitMQ)**: Games e Wallets NÃO se chamam diretamente por REST. Toda comunicação financeira é via eventos no RabbitMQ. Motivos:
1. **Desacoplamento temporal**: Se Wallets estiver offline, eventos ficam na fila e são processados quando voltar
2. **Resiliencia**: Falha na wallet não derruba o Games service
3. **Auditabilidade**: Cada evento é registrado (inbox/outbox patterns)
4. **At-least-once delivery**: RabbitMQ garante que eventos não se perdem

---

## Monorepo Structure

```
fullstack-challenge/
├── services/
│   ├── games/                # Microsserviço de Games
│   │   ├── src/
│   │   │   ├── domain/       # Entidades, VOs, eventos, erros
│   │   │   ├── application/  # Use cases, interfaces (ports)
│   │   │   ├── infrastructure/ # DB, RabbitMQ, WebSocket, Scheduling
│   │   │   └── presentation/  # Controllers, DTOs, Decorators
│   │   ├── data/             # seed-chain.json (criptografado)
│   │   └── prisma/           # Schema + migrations (DB "games")
│   │
│   └── wallets/              # Microsserviço de Wallets
│       ├── src/
│       │   ├── domain/       # Entidade Wallet, eventos, erros
│       │   ├── application/  # Use cases (debit, credit, resolve wallet)
│       │   ├── infrastructure/ # DB, RabbitMQ, Inbox/Outbox
│       │   └── presentation/  # Controllers, DTOs
│       └── prisma/           # Schema + migrations (DB "wallets")
│
├── packages/
│   ├── domain/               # @crash/domain — Money value object
│   ├── messaging/            # @crash/messaging — Event interfaces
│   ├── eslint-config/        # @crash/eslint — Shared lint rules
│   └── observability/        # @crash/observability — Metrics (Prometheus)
│
├── frontend/                 # Frontend Next.js
├── docker/                   # Kong config, Grafana dashboards, etc.
└── docker-compose.yml        # Infra completa
```

**Decisão arquitetural - Monorepo com packages compartilhados**: Tipos compartilhados (`@crash/domain`, `@crash/messaging`) vivem em `packages/` é sao importados pelos serviços. Isso garante que o `Money` value object e o contrato de eventos são idênticos em ambos os serviços, evitando drift de tipos.

---

## DDD Layer Structure (Cada Serviço)

### Domain Layer (`src/domain/`)

O coração do negocio. **Zero dependências externas**. Contem:

| Componente | Exemplo | Regra |
|-----------|---------|-------|
| **Entities** | `Round`, `Bet`, `Wallet` | Aggregate roots com identidade propria |
| **Value Objects** | `Money`, `Multiplier`, `CrashPoint`, `SeedChain` | Imutaveis, sem identidade, validação no constructor |
| **Domain Events** | `RoundStartedEvent`, `BetPlacedEvent` | Representam fatos que aconteceram no dominio |
| **Domain Errors** | `InsufficientFundsError`, `DuplicateBetError` | Erros com semanticas de negocio |

**Decisão arquitetural - Value Objects imutaveis**: Value objects como `Money` é `Multiplier` não tem setters. Operações retornam novas instancias. Isso previne bugs de mutação acidental é torna o código thread-safe por natureza.

**Decisão arquitetural - Domain Events no aggregate**: Entidades acumulam eventos internamente (`private events: GameDomainEvent[]`) é expoe `pullEvents()` para a camada de aplicação publicar. Isso mantem a entidade como source of truth para eventos sem acoplamento a infraestrutura de mensageria.

### Application Layer (`src/application/`)

Orquestra casos de uso. **Depende apenas de interfaces (ports)**, nunca de implementações concretas.

| Componente | Exemplo | Regra |
|-----------|---------|-------|
| **Use Cases** | `PlaceBetUseCase`, `CashOutUseCase` | Um metodo `execute()` por caso de uso |
| **Interfaces (Ports)** | `IRoundRepository`, `IBetRepository` | Contratos que a infra implementa |
| **DTOs de entrada/saida** | `PlaceBetInput`, `CashOutOutput` | Tipagem forte na borda da aplicação |

**Decisão arquitetural - Use Cases como boundary**: Cada caso de uso é uma classe dedicada com um único metodo `execute()`. Segue o Command Pattern — fácilita testar isoladamente, adicionar logs/metricas específicos, é entender o que cada operação faz.

**Decisão arquitetural - Dependency Inversion**: Use cases dependem de interfaces (`IRoundRepository`), não de implementações (`PrismaRoundRepository`). Implementações sao registradas via DI do NestJS com `useExisting`:

```typescript
providers: [
  PrismaRoundRepository, // implementação concreta
  {
    provide: ROUND_REPOSITORY, // token da interface
    useExisting: PrismaRoundRepository, // bind
  },
]
```

### Infrastructure Layer (`src/infrastructure/`)

Implementa as interfaces definidas na Application. Conta com detalhes tecnicos.

| Componente | Exemplo | Tecnologia |
|-----------|---------|------------|
| **Persistence** | `PrismaRoundRepository` | Prisma ORM + PostgreSQL |
| **Messaging** | `RabbitMQEventPublisher` | @nestjs/microservices + RabbitMQ |
| **WebSocket** | `GamesGateway` | @nestjs/websockets + Socket.IO |
| **Scheduling** | `RoundLifecycleManager`, `BetTimeoutHandler` | @nestjs/schedule |
| **Crypto** | `AESCipher` | Web Crypto API (AES-256-GCM) |

### Presentation Layer (`src/presentation/`)

Ponto de entrada HTTP. Controllers é DTOs.

| Componente | Exemplo | Regra |
|-----------|---------|-------|
| **Controllers** | `GamesController` | Delegam para use cases, não tem lógica de negocio |
| **DTOs** | `PlaceBetRequestDto`, `CashOutResponseDto` | Validação com class-validator |
| **Decorators** | `@UserContext()` | Extrai claims do JWT (playerId, username) |

**Decisão arquitetural - Controllers finos**: Controllers apenas recebem HTTP request, convertem DTOs, chamam use case, é retornam response. Zero lógica de negocio. Isso mantem a presentation como mecanismo de entrega (delivery mechanism) é não como camada de lógica.

---

## Shared Packages

### @crash/domain — Money Value Object

```typescript
// packages/domain/src/money.vo.ts
export class Money {
  static fromCents(cents: bigint): Money;
  static fromDecimal(decimal: string): Money;
  static zero(): Money;

  toCents(): bigint;           // Sempre bigint, nunca number
  add(other: Money): Money;
  subtract(other: Money): Money;
  isLessThan(other: Money): boolean;
  isGreaterThan(other: Money): boolean;
  equals(other: Money): boolean;
}
```

**Decisão arquitetural - NUNCA usar floating point para dinheiro**: `Money` opera exclusivamente com `bigint` (inteiros de precisao arbitratia). Valores sao armazenados em **cents** (centavos). $10.50 = 1050 cents. A conversão para decimal acontece apenas na presentation layer (DTOs). Isso elimina erros de precisao como `0.1 + 0.2 !== 0.3`.

### @crash/messaging — Event Interfaces

```typescript
// packages/messaging/src/event.types.ts
export interface DomainEvent {
  readonly eventType: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly version: number;
}

export interface IEventPublisher {
  publish(event: DomainEvent): Promise<void>;
  publishBatch(events: DomainEvent[]): Promise<void>;
}
```

**Decisão arquitetural**: Contrato compartilhado entre Games é Wallets garante que ambos serviços falam a mesma "linguagem" de eventos. `IEventPublisher` é implementado por cada serviço com seu RabbitMQ client.

### @crash/observability — Metrics

```typescript
// packages/observability/src/metrics-recorder.service.ts
export interface MetricsRecorderService {
  incrBet(status: string, amount: number): void;
  incrPayout(amount: number): void;
  incrWalletOp(type: string, amount: number): void;
  observeCrashPoint(value: number): void;
  observeRoundDuration(seconds: number): void;
  setRtp(value: number): void;
  setWsConnections(count: number): void;
  incrWsBroadcast(event: string): void;
  incrRabbitPublished(exchange: string, eventType: string): void;
  incrRabbitConsumed(queue: string, eventType: string): void;
}
```

**Decisão arquitetural**: Metricas sao registradas em ambas os serviços com a mesma interface. Exportadas via Prometheus (`/metrics`) é visualizadas em Grafana dashboards. Permite monitorar RTP (Return to Player), volume de bets, latencia de cashout, etc.

---

## Autenticação é Autorização

### Fluxo de Autenticação (Keycloak + Kong)

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Frontend │────►│  Kong    │────►│ Keycloak │────►│  Kong    │
│          │     │ Gateway  │     │  (JWKS)  │     │ Gateway  │
│ POST     │     │ verify   │     │  .well-  │     │ inject   │
│ /games/  │     │ JWT      │     │ known/   │     │ headers  │
│  bet     │     │ signature│     │ openid/  │     │          │
│          │     │ via JWKS │     │ certs    │     │ x-user-id│
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                         │
                                                         ▼
                                                   ┌──────────┐
                                                   │  Games   │
                                                   │ Service  │
                                                   │          │
                                                   │@UserCtx()│
                                                   │ extrai   │
                                                   │ playerId │
                                                   └──────────┘
```

**Decisão arquitetural - bearer_jwt_verify no Kong**: O plugin `kong-oidc` (nokia) foi substituido por `bearer_jwt_verify` com JWKS discovery. Motivo:
1. Kong não precisa chamar Keycloak a cada request (JWKS é cacheado)
2. Latencia menor — verificação criptografica local vs round-trip ao Keycloak
3. Keycloak pode ficar temporariamente indisponível sem afetar requests de usuarios já autenticados

### Keycloak Configuration

| Propriedade | Valor |
|------------|-------|
| Realm | `crash-game` |
| Client ID | `crash-game-client` |
| Client Type | Public (PKCE S256) |
| Test User | `player` / `player123` |
| Redirect URIs | `http://localhost:3000/*`, `http://localhost:5173/*` |

### @UserContext() Decorator

```typescript
// No controller:
@Post('bet')
async placeBet(@UserContext() user: UserContextType, @Body() dto: PlaceBetRequestDto) {
  // user.playerId → extracted from JWT "sub" claim
  // user.username → extracted from JWT "preferred_username" claim
}

// Implementação:
export const UserContext = createParamDecorator((data, ctx) => {
  const request = ctx.switchToHttp().getRequest();
  return {
    playerId: request.headers['x-user-id'] || request.headers['x-consumer-custom-id'],
    username: request.headers['x-username'] || 'anonymous',
  };
});
```

---

## Database-per-Service

**Decisão arquitetural**: Cada serviço tem seu próprio banco PostgreSQL:

| Serviço | Database | Tables |
|---------|----------|--------|
| Games | `games` | `Round`, `Bet`, `OutboxEvent`, `InboxEvent` |
| Wallets | `wallets` | `Wallet`, `WalletTransaction`, `OutboxEvent`, `InboxEvent` |

Serviços NUNCA acessam o banco do outro. Toda comunicação de dados é via eventos RabbitMQ. Isso garante:
1. **Schema independence**: Cada serviço evolui seu schema livremente
2. **Scaling independence**: Cada banco escala independentemente
3. **Failure isolation**: Problema no DB de wallets não afeta o DB de games

---

## Exchanges é Filas RabbitMQ

### Configuração

| Nome | Tipo | Publisher | Consumer |
|------|------|-----------|----------|
| `games.events` | fanout | Games Service | Wallets Service |
| `wallet.events` | fanout | Wallets Service | Games Service |

**Decisão arquitetural - Fanout exchange**: Permite que multiplos consumidores recebam os mesmos eventos sem configuração adicional. Se um novo serviço precisar consumir eventos de games (ex: Analytics), basta adicionar uma queue binding na fanout exchange.

### Fluxo de Eventos

```
Games Service                    RabbitMQ                     Wallets Service
─────────────                    ────────                     ───────────────
BetPlacedEvent ─────────────► games.events ────────► BetPlacedEventHandler
                                     │                       │
                                     │                  debit wallet
                                     │                       │
WalletDebitedEvent ◄──── wallet.events ◄──── OutboxProcessor
      │
WalletDebitedEventHandler
      │
confirm bet (PENDING → ACTIVE)


PlayerCashedOutEvent ─────► games.events ────────► PlayerCashedOutEventHandler
                                     │                       │
                                     │                  credit wallet
                                     │                  (winAmount)
```

---

## WebSocket — Server Push Only

**Decisão arquitetural**: WebSocket é **apenas server → client**. Acoes do jogador (bet, cashout) sao via **REST API**. Motivos:
1. **Seguranca**: Requests REST passam pelo Kong com autenticação JWT. WebSocket não tem header de autenticação por mensagem.
2. **Idempotencia**: REST fácilita implementar idempotência (chave no body). WebSocket não tem semantica de request/response.
3. **Simplicidade**: WebSocket é stateful é dificil de escalar horizontalmente. Minimizar uso fácilita operação.

### Eventos WebSocket (Server → Client)

| Evento | Quando | Dados |
|--------|--------|-------|
| `roundStarted` | Novo round criado | `{ roundId, seedHash, bettingEndTime }` |
| `bettingEnded` | Betting phase acabou | `{ roundId }` |
| `multiplierUpdate` | A cada 100ms | `{ roundId, multiplier }` |
| `crash` | Round crashou | `{ roundId, crashPoint, seed }` |
| `betPlaced` | Jogador apostou | `{ roundId, betId, playerId, playerName, amountCents }` |
| `betConfirmed` | Wallet confirmou | `{ roundId, betId, playerId, playerName, amountCents }` |
| `betCancelled` | Wallet rejeitou | `{ roundId, betId, playerId, playerName, amountCents, reason }` |
| `playerCashedOut` | Jogador sacou | `{ roundId, betId, playerId, playerName, multiplier, payoutCents }` |

### CORS Restrito

```typescript
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
  },
})
```

**Decisão arquitetural**: CORS restrito a localhost para desenvolvimento. Em producao, seria configurado via env vars para os dominios permitidos.

---

## API Routes (via Kong)

| Metodo | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/games/bet` | JWT | Colocar aposta (retorna 202 Accepted) |
| `POST` | `/games/bet/cashout` | JWT | Sacar no multiplicador atual (idempotente) |
| `GET` | `/games/rounds/current` | - | Estado do round atual |
| `GET` | `/games/rounds/history` | - | Historico paginado de rounds |
| `GET` | `/games/rounds/:id/verify` | - | Verificar provably fair |
| `GET` | `/games/bets/me` | JWT | Historico de apostas do jogador |
| `GET` | `/games/bets/:betId` | - | Status de uma aposta (polling) |
| `GET` | `/games/health` | - | Health check |
| `GET` | `/wallets/me` | JWT | Saldo da wallet |
| `POST` | `/wallets` | JWT | Criar wallet |
| `GET` | `/wallets/health` | - | Health check |

**Decisão arquitetural - 202 Accepted para bet**: O endpoint de aposta retorna HTTP 202 (Accepted) em vez de 200 ou 201. Motivo: a aposta é criada em estado `PENDING` é a confirmação (wallet debit) é assíncrona. O cliente faz polling em `GET /games/bets/:betId` para saber quando o status muda para `ACTIVE`.

---

## Domain Rules

### Game Service

| Regra | Implementação |
|-------|--------------|
| Uma aposta por jogador por round | `DuplicateBetError` — com cancel-and-replace para PENDING/CANCELLED |
| Aposta minima: $1.00 (100 cents) | `BetBelowMinimumError` |
| Aposta maxima: $1,000.00 (100000 cents) | `BetAboveMaximumError` |
| Crash point predeterminado (provably fair) | Seed chain com commit-reveal |
| Multiplicador: e^(0.06 * t) | `Multiplier.afterDuration()` |
| Betting phase: 10 segundos | `DEFAULT_ROUND_CONFIG.bettingDurationMs = 10000` |
| Gap entre rounds: 5 segundos | `setTimeout(..., 5000)` |

### Wallet Service

| Regra | Implementação |
|-------|--------------|
| Saldo nunca pode ser negativo | `InsufficientFundsError` — check before debit |
| Uma wallet por jogador | `PlayerWalletResolver` — cria automaticamente se não existe |
| Operações financeiras em cents (bigint) | `Money` value object com `bigint` interno |
| Idempotencia em debito/credito | Inbox pattern com unique constraint |
