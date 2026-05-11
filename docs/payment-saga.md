# Saga de Pagamentos — Fluxo Financeiro Completo

## Visão Geral

O sistema financeiro do Crash Game opera com dois fluxos assíncronos via RabbitMQ:

1. **Bet Debit Saga**: Jogador aposta → Wallet debita → Games confirma
2. **Cashout Credit Saga**: Jogador saca → Games registra → Wallet credita

Ambos os fluxos usam o **Saga Pattern** com **compensating transactions** para garantir consistência eventual entre os serviços. Nenhuma transação distribuída (2PC) é usada — o sistema é projetado para tolerância a falhas.

**Decisão arquitetural - Saga over 2PC**: Transações distribuídas (Two-Phase Commit) requerem coordinação sincrona entre serviços, o que é frágil e lento. O Saga Pattern permite que cada serviço opere independentemente, com compensações para falhas. Em um jogo real-time onde latência importa,Saga assíncrono é a única opção viável.

---

## Fluxo 1: Bet Debit Saga (Aposta)

### Diagrama de Sequência

```
 Jogador        Games Service       RabbitMQ         Wallets Service
  │                  │                  │                  │
  │  POST /games/bet │                  │                  │
  │─────────────────►│                  │                  │
  │                  │                  │                  │
  │                  │ 1. PlaceBetUseCase                  │
  │                  │    round.placeBet()                 │
  │                  │    bet.status = PENDING             │
  │                  │    betRepository.create(bet)        │
  │                  │    roundRepository.save(round)      │
  │                  │                  │                  │
  │                  │── BetPlacedEvent ─►│                  │
  │  202 Accepted    │                  │── BetPlacedEvent ─►│
  │◄─────────────────│                  │                  │
  │                  │                  │  2. BetPlacedEventHandler
  │  (polling:       │                  │     inbox.tryCreate()  ← idempotência
  │   GET /bets/:id) │                  │     resolveWallet()
  │                  │                  │     debitWalletUseCase
  │                  │                  │       .execute()  │
  │                  │                  │                  │
  │                  │                  │  ┌─── SUCESSO ───┐│
  │                  │                  │  │ wallet.debit()  ││
  │                  │                  │  │ outbox: Wallet  ││
  │                  │                  │  │  DebitedEvent   ││
  │                  │                  │  └────────┬───────┘│
  │                  │                  │           │        │
  │                  │◄─ WalletDebitedEvent ────────┘        │
  │                  │                  │                  │
  │                  │ 3. ConfirmBetUseCase                  │
  │                  │    bet.confirm()                      │
  │                  │    bet.status = ACTIVE                │
  │                  │    betRepository.update(bet)          │
  │                  │    WS: betConfirmed                   │
  │                  │                  │                  │
  │  GET /bets/:id   │                  │                  │
  │─────────────────►│                  │                  │
  │  {status: ACTIVE}│                  │                  │
  │◄─────────────────│                  │                  │
  │                  │                  │                  │
  │                  │                  │  ┌─── FALHA ────┐│
  │                  │                  │  │ Insufficient  ││
  │                  │                  │  │ FundsError    ││
  │                  │                  │  │ outbox: Wallet ││
  │                  │                  │  │ DebitFailed   ││
  │                  │                  │  └───────┬───────┘│
  │                  │                  │          │        │
  │                  │◄─ WalletDebitFailedEvent ───┘        │
  │                  │                  │                  │
  │                  │ 4. CancelBetUseCase                   │
  │                  │    bet.cancel(reason)                 │
  │                  │    bet.status = CANCELLED             │
  │                  │    betRepository.update(bet)          │
  │                  │    WS: betCancelled                   │
  │                  │                  │                  │
  │  GET /bets/:id   │                  │                  │
  │─────────────────►│                  │                  │
  │  {status:        │                  │                  │
  │   CANCELLED,     │                  │                  │
  │   reason: "Insuf-│                  │                  │
  │   ficient funds"}│                  │                  │
  │◄─────────────────│                  │                  │
  │                  │                  │                  │
  │  POST /games/bet │  (retry com novo valor)              │
  │─────────────────►│  cancel-and-replace                 │
  │                  │  permite nova aposta                 │
```

### Detalhamento de Cada Etapa

#### Etapa 1: PlaceBetUseCase (Games Service)

**Arquivo**: `services/games/src/application/use-cases/place-bet.use-case.ts`

```typescript
// Resumo da lógica:
1. Busca round atual (ou cria novo se não existe)
2. Verifica se jogador já tem bet neste round
   → Se PENDING ou CANCELLED: permite substituição (cancel-and-replace)
   → Se ACTIVE/CASHED_OUT/LOST: rejeita com DuplicateBetError
3. Cria bet em estado PENDING
4. Persiste bet e round no PostgreSQL
5. Publica BetPlacedEvent no RabbitMQ
6. Retorna 202 Accepted (confirmação e assíncrona)
```

**Decisão arquitetural - Bet em PENDING**: A aposta começa como `PENDING` porque o débito na wallet é assíncrono. O jogador não pode perder dinheiro que ainda não foi debitado. Se a wallet falhar, a bet é cancelada e o jogador pode tentar de novo.

**Decisão arquitetural - HTTP 202**: Retornar 202 Accepted em vez de 200 OK indica ao cliente que a solicitação foi recebida mas não completada. O cliente faz polling em `GET /games/bets/:betId` para saber o resultado.

#### Etapa 2: BetPlacedEventHandler (Wallets Service)

**Arquivo**: `services/wallets/src/infrastructure/messaging/rabbitmq/handlers/bet-placed.handler.ts`

```typescript
async handle(event: BetPlacedEvent): Promise<void> {
  // 1. IDEMPOTENCIA: Inbox pattern
  const idempotencyKey = `bet-${event.betId}`;
  const inboxEvent = await this.inboxRepository.tryCreate({
    idempotencyKey,
    eventType: 'BetPlaced',
    payload: event,
  });

  if (!inboxEvent) {
    // Já existe — verifica status
    const existing = await this.inboxRepository.findByIdempotencyKey(idempotencyKey);
    if (existing?.status === 'PROCESSED') return; // Já processou, ignora
    if (existing?.status === 'FAILED') { /* retry */ }
    else return; // Pendente, ignora (outro worker está processando)
  }

  try {
    // 2. Resolve wallet (cria automaticamente se não existe)
    const wallet = await this.playerWalletResolver.resolveWallet(event.playerId);

    // 3. Debita da wallet
    await this.debitWalletUseCase.execute({
      walletId: wallet.id,
      amount: event.amount,
      reason: `Bet placed in round ${event.roundId}`,
    });

    // 4. Publica confirmação via Outbox pattern
    await this.eventPublisher.publish(
      createWalletDebitedEvent(roundId, betId, playerId, amount, version)
    );

    // 5. Marca inbox como PROCESSED
    await this.inboxRepository.markAsProcessed(eventId, new Date());

  } catch (error) {
    // 6. Marca inbox como FAILED
    await this.inboxRepository.markAsFailed(eventId, errorMessage, 0);

    // 7. Publica falha para Games cancelar o bet
    await this.eventPublisher.publish(
      createWalletDebitFailedEvent(roundId, betId, playerId, amount, reason, version)
    );
  }
}
```

**Decisão arquitetural - Inbox Pattern**: Cada evento recebido e registrado na tabela `InboxEvent` com uma `idempotencyKey` única (ex: `bet-{betId}`). Se o RabbitMQ entregar o mesmo evento duas vezes (at-least-once delivery), o `tryCreate()` falha na unique constraint e o handler ignora a duplicata. Isso garante **exactly-once processing** apesar de **at-least-once delivery**.

**Decisão arquitetural - PlayerWalletResolver**: Se o jogador não tem wallet (primeira aposta), o resolver cria automaticamente via `CreateWalletUseCase`. Isso elimina a necessidade de um passo de "setup" antes de jogar. A criação é idempotente — se a wallet já existe, apenas retorna.

#### Etapa 3: WalletDebitedEventHandler (Games Service)

**Arquivo**: `services/games/src/infrastructure/messaging/rabbitmq/handlers/wallet-debited.handler.ts`

```typescript
async handle(event: WalletDebitedEvent): Promise<void> {
  await this.confirmBetUseCase.execute({
    roundId: event.roundId,
    betId: event.betId,
    playerId: event.playerId,
  });
  // → bet.confirm() → PENDING → ACTIVE
  // → betRepository.update(bet)
  // → WS broadcast: betConfirmed
}
```

Transicao simples: `PENDING → ACTIVE`. A bet agora "vale" — o jogador esta oficialmente no round.

#### Etapa 4: WalletDebitFailedEventHandler (Games Service)

**Arquivo**: `services/games/src/infrastructure/messaging/rabbitmq/handlers/wallet-debit-failed.handler.ts`

```typescript
async handle(event: WalletDebitFailedEvent): Promise<void> {
  await this.cancelBetUseCase.execute({
    roundId: event.roundId,
    betId: event.betId,
    playerId: event.playerId,
    reason: event.reason, // "Insufficient funds", etc.
  });
  // → bet.cancel(reason) → PENDING → CANCELLED
  // → betRepository.update(bet)
  // → WS broadcast: betCancelled
  // → BetCancelledEvent published
}
```

**Compensating transaction**: A bet é cancelada e o jogador e notificado via WebSocket. O jogador pode tentar de novo imediatamente (cancel-and-replace).

---

## Fluxo 2: Cashout Credit Saga (Saque)

### Diagrama de Sequência

```
 Jogador        Games Service       RabbitMQ         Wallets Service
  │                  │                  │                  │
  │ POST /games/     │                  │                  │
  │  bet/cashout     │                  │                  │
  │─────────────────►│                  │                  │
  │                  │                  │                  │
  │                  │ 1. CashOutUseCase                   │
  │                  │    check bet status (PostgreSQL) │
  │                  │    load round (in-memory preferred) │
  │                  │    round.cashOut(playerId)          │
  │                  │    payout = bet × multiplier        │
  │                  │    bet.status = CASHED_OUT          │
  │                  │    betRepository.update(bet)        │
  │                  │    roundRepository.save(round)      │
  │                  │                  │                  │
  │  200 OK          │── PlayerCashedOutEvent ──►          │
  │  {payoutCents,   │                  │── PlayerCashedOutEvent ►│
  │   multiplier}    │                  │                  │
  │◄─────────────────│                  │                  │
  │                  │                  │  2. PlayerCashedOutEventHandler
  │                  │                  │     inbox.tryCreate()  ← idempotência
  │                  │                  │     resolveWallet()
  │                  │                  │     creditWalletUseCase
  │                  │                  │       .execute()  │
  │                  │                  │                  │
  │                  │                  │     wallet.credit(winAmount)
  │                  │                  │     inbox.markAsProcessed()
  │                  │                  │                  │
  │                  │                  │     → saldo do jogador atualizado
  │                  │                  │                  │
```

### Detalhamento

#### Etapa 1: CashOutUseCase (Games Service)

**Arquivo**: `services/games/src/application/use-cases/cash-out.use-case.ts`

```typescript
async execute(input: CashOutInput): Promise<CashOutOutput> {
  // 1. IDEMPOTENCIA via PostgreSQL (Bet status)
  // Cashout duplicado: se bet.status === CASHED_OUT, retorna resultado anterior
  const existingBet = await this.betRepository.findByPlayerAndRound(playerId, roundId);
        if (existingBet?.getStatus() === BetStatus.CASHED_OUT) { return existingBet; }
  }

  // 2. Carrega round — prefere in-memory (multiplicador mais preciso)
  const liveRound = this.roundStateProvider.getCurrentRound();
  if (liveRound?.getStatus() === RoundStatus.ACTIVE) {
    round = liveRound;
  } else {
    round = await this.roundRepository.findById(roundId); // Fallback
  }

  // 3. Carrega bet
  const bet = await this.betRepository.findByPlayerAndRound(playerId, roundId);

  // 4. Domain operation — calcula payout
  const payout = round.cashOut(playerId);
  // payout = Money.fromCents(bet.amount * multiplier)
  // bet.status = CASHED_OUT

  // 5. Persiste
  await this.betRepository.update(cashedOutBet);
  await this.roundRepository.save(round);

  // 6. Publica evento → Wallets credita
  await this.eventPublisher.publishBatch(round.pullEvents());

  // 7. WS broadcast: playerCashedOut
}
```

**Decisão arquitetural - Idempotencia via PostgreSQL**:
1. **Bet status check** — Se o bet já está `CASHED_OUT`, retorna o resultado anterior sem reprocessar
2. **Inbox Pattern** no Wallets — Garante que o evento de credito não processa duas vezes no Wallets service

Duas camadas porque cada serviço é dono de sua própria idempotência. O Games garante "não cashout duplicado" via status do Bet e o Wallets garante "não crédito duplicado" via Inbox.

**Decisão arquitetural - winAmount inclui aposta original**: O `PlayerCashedOutEvent.winAmount` é o payout TOTAL (aposta + lucro), não apenas o lucro. A wallet credita o valor total. Motivo: o debito já aconteceu no Bet Debit Saga. O credito é o payout completo, resultando em:
- Wallet: -debit(betAmount) + credit(betAmount * multiplier) = net profit = betAmount * (multiplier - 1)

#### Etapa 2: PlayerCashedOutEventHandler (Wallets Service)

**Arquivo**: `services/wallets/src/infrastructure/messaging/rabbitmq/handlers/player-cashed-out.handler.ts`

```typescript
async handle(event: PlayerCashedOutEvent): Promise<void> {
  const idempotencyKey = `cashout-${event.betId}`;

  // 1. Inbox idempotência
  const inboxEvent = await this.inboxRepository.tryCreate({ idempotencyKey, ... });
  // ... (mesma lógica de dedup que BetPlaced)

  // 2. Resolve wallet
  const wallet = await this.playerWalletResolver.resolveWallet(event.playerId);

  // 3. Credita ganhos
  await this.creditWalletUseCase.execute({
    walletId: wallet.id,
    amount: event.winAmount,  // Payout TOTAL (bet + profit)
    reason: `Cash out at ${event.cashOutMultiplier}x in round ${event.roundId}`,
  });

  // 4. Marca inbox como PROCESSED
  await this.inboxRepository.markAsProcessed(eventId, new Date());
}
```

---

## Inbox Pattern — Idempotencia no Consumidor

### Problema que Resolve

RabbitMQ garante **at-least-once delivery** — mensagens podem ser entregues mais de uma vez em cenarios como:
- Consumer crash após processar mas antes de ACK
- Network partition entre consumer e broker
- Broker restart com mensagens não confirmadas

### Solucao: Inbox Table

```
┌─────────────────────────────────────────────────┐
│              InboxEvent Table                     │
├──────────┬──────────────┬──────────┬────────────┤
│ id (PK)  │ idempotency  │ status   │ payload    │
│          │ Key (UNIQUE) │          │            │
├──────────┼──────────────┼──────────┼────────────┤
│ uuid-1   │ bet-abc123   │ PROCESSED│ {...}      │
│ uuid-2   │ cashout-def  │ PROCESSED│ {...}      │
│ uuid-3   │ bet-ghi456   │ FAILED   │ {...}      │
└──────────┴──────────────┴──────────┴────────────┘
```

### Fluxo

```
Evento chega (BetPlacedEvent)
    │
    ├── inbox.tryCreate({ idempotencyKey: `bet-${betId}` })
    │       │
    │       ├── Sucesso (novo) → prossegue
    │       │
    │       └── Falha (unique constraint) → já existe
    │               │
    │               ├── status = PROCESSED → return (ignora)
    │               ├── status = FAILED → retry (reprocessa)
    │               └── status = PENDING → return (outro worker)
    │
    ├── Processa evento (debit/credit)
    │
    ├── markAsProcessed() ou markAsFailed()
    │
    └── Publica evento de resposta (WalletDebited/WalletDebitFailed)
```

**Decisão arquitetural - Inbox em ambos os serviços**: O Inbox pattern é implementado em ambos os serviços (Games e Wallets) porque ambos consomem eventos e precisam garantir idempotência. Cada serviço é responsável por sua própria proteção contra duplicatas.

### Limpeza

```typescript
// InboxProcessor — roda diariamente as 2AM
@Cron(CronExpression.EVERY_DAY_AT_2AM)
async cleanupOldEvents(): Promise<void> {
  const deletedCount = await this.inboxRepository.deleteOlderThan(30); // 30 dias
}
```

Eventos processados sao mantidos por 30 dias para auditoria e debugging.

---

## Outbox Pattern — Entrega Confiavel de Eventos

### Problema que Resolve

Se o serviço crashar **apos** processar uma operação (ex: debitar wallet) mas **antes** de publicar o evento de confirmação, o Games service nunca saberia que a operação foi concluida. O bet ficaria `PENDING` para sempre.

### Solucao: Outbox Table

```
┌─────────────────────────────────────────────────┐
│             OutboxEvent Table                     │
├──────────┬────────────┬──────────┬───────────────┤
│ id (PK)  │ status     │ payload  │ retryCount    │
├──────────┼────────────┼──────────┼───────────────┤
│ uuid-1   │ SENT       │ {...}    │ 0             │
│ uuid-2   │ SENT       │ {...}    │ 0             │
│ uuid-3   │ PENDING    │ {...}    │ 2 (max 3)     │
└──────────┴────────────┴──────────┴───────────────┘
```

### Fluxo

```
Wallets processa operação (ex: debit)
    │
    ├── Salva evento na Outbox table (mesma transação DB)
    │       → status: PENDING
    │
    └── OutboxProcessor (cron 5s)
            │
            ├── Busca eventos PENDING (retryCount < 3)
            │
            ├── Publica no RabbitMQ
            │       │
            │       ├── Sucesso → status: SENT, sentAt: now
            │       │
            │       └── Falha → retryCount++
            │                  → se retryCount >= 3, para de tentar
            │
            └── Proxima execucao em 5s
```

**Decisão arquitetural - Outbox no Wallets**: O Wallets service usa Outbox porque as operações financeiras (debit/credit) e a publicação de eventos devem ser atomicas. Como não existe transação distribuida entre PostgreSQL e RabbitMQ, o Outbox pattern garante que:
1. Se o DB commitar mas o RabbitMQ estiver offline → evento fica PENDING e e publicado quando RabbitMQ voltar
2. Se o DB rollbackar → evento nunca e criado na outbox

**Decisão arquitetural - Max 3 retries**: Apos 3 tentativas, o evento para de ser processado automaticamente. Isso evita loop infinito em cenarios onde o problema e permanente (ex: evento mal formatado). Eventos com retryCount >= 3 ficam na tabela para investigação manual.

---

## Wallet Entity — Regras de Negocio

**Arquivo**: `services/wallets/src/domain/entities/wallet.entity.ts`

### Invariante Principal

> **O saldo da wallet NUNCA pode ser negativo.**

```typescript
debit(amount: Money, reason: string): void {
  if (!this.canDebit(amount)) {
    throw new InsufficientFundsError(this.balance.toCents(), amount.toCents());
  }
  this.balance = this.balance.subtract(amount);
}
```

### Operações

| Operação | Metodo | Quando | Pode Falhar? |
|----------|--------|--------|-------------|
| **Debit** | `wallet.debit(amount, reason)` | BetPlacedEvent recebido | Sim — InsufficientFundsError |
| **Credit** | `wallet.credit(amount, reason)` | PlayerCashedOutEvent recebido | Não — credit sempre funciona |

**Decisão arquitetural - Credit nunca falha**: O credito de ganhos sempre sucede porque e uma compensação — o jogador ganhou, o dinheiro e dele. Se por algum motivo a wallet não existir (edge case), o `PlayerWalletResolver` cria automaticamente.

### Optimistic Locking

```typescript
toPersistence() {
  return {
    id: this.id,
    playerId: this.playerId,
    balance: this.balance.toCents(),
    version: this.version, // Incrementado a cada operação
  };
}
```

Se dois cashouts do mesmo jogador chegarem simultaneamente, o segundo falha com version conflict e e retentado pelo Inbox/Outbox.

---

## Cenario de Falha e Recovery

### Cenario 1: Wallet Service Offline

```
1. Jogador aposta → bet PENDING
2. Games publica BetPlacedEvent
3. Wallets esta offline → evento fica na fila RabbitMQ
4. Jogador faz polling → status PENDING (esperando...)
5. Wallets volta ao ar
6. RabbitMQ entrega evento pendente
7. Wallets debita → WalletDebitedEvent → bet ACTIVE
```

**Resultado**: O jogador eventualmente ve o bet confirmado. Se o round crashar enquanto a wallet esta offline, o `BetTimeoutHandler` cancela o bet após 30s.

### Cenario 2: Duplicate BetPlacedEvent

```
1. RabbitMQ entrega BetPlacedEvent pela primeira vez
2. Wallets processa, debita, mas crasha antes do ACK
3. RabbitMQ redelivers o evento
4. Wallets tenta inbox.tryCreate() → unique constraint falha
5. Busca existente → status = PROCESSED
6. Ignora — não debita duas vezes
```

**Resultado**: Exactly-once processing garantido pelo Inbox pattern.

### Cenario 3: Cashout e Crash Simultaneos

```
T=10.000s  Multiplicador atinge crashPoint
T=10.000s  RLM detecta crash in-memory
T=10.001s  Jogador clica cashout (via API, caminho separado)
T=10.001s  CashOutUseCase carrega round in-memory (ainda ACTIVE)
T=10.001s  Executa cashOut() → bet.status = CASHED_OUT
T=10.001s  Salva no DB (version++)

T=10.002s  RoundCrashHandler executa
T=10.002s  Recarrega round do DB (versão com cashout)
T=10.002s  Ve que bet já esta CASHED_OUT → não marca como LOST
T=10.002s  Salva crash no DB
```

**Resultado**: O cashout e honrado. O reload-before-crash garante que cashouts concorrentes não sao perdidos.

### Cenario 4: Jogador tenta após wallet failure

```
1. Jogador aposta $100 → bet PENDING
2. Wallet debita falha (saldo insuficiente)
3. WalletDebitFailedEvent → bet CANCELLED
4. Jogador deposita $100
5. Jogador aposta $100 novamente
6. PlaceBetUseCase: existingBet.status = CANCELLED → cancel-and-replace
7. Remove bet cancelada do aggregate
8. Cria nova bet PENDING
9. Nova bet segue fluxo normal
```

**Resultado**: O jogador pode tentar de novo sem esperar o proximo round.

---

## Resumo dos Patterns

| Pattern | Onde | Problema que Resolve |
|---------|------|---------------------|
| **Saga** | Games + Wallets | Consistência eventual sem 2PC |
| **Inbox** | Games + Wallets consumers | Exactly-once processing com at-least-once delivery |
| **Outbox** | Games + Wallets publishers | Eventos nunca se perdem após commit de DB |
| **Cancel-and-Replace** | Games PlaceBet | Retry após falha na wallet sem esperar novo round |
| **Bet Status Idempotency** | Games CashOut (PostgreSQL) | Cashout duplicado não reprocessa |
| **Optimistic Locking** | Ambos (version field) | Concorrência sem distributed locks |
| **Compensating Transaction** | WalletDebitFailed → CancelBet | Rollback automático do bet quando wallet falha |
| **Timeout Handler** | Games (30s cron) | Limpeza de bets PENDING órfãos |

---

## Arquivos Envolvidos

### Games Service

| Arquivo | Camada | Funcao |
|---------|--------|--------|
| `place-bet.use-case.ts` | Application | Cria bet PENDING, publica BetPlacedEvent |
| `cash-out.use-case.ts` | Application | Processa cashout com idempotência |
| `confirm-bet.use-case.ts` | Application | Confirma bet (PENDING → ACTIVE) após wallet debitar |
| `cancel-bet.use-case.ts` | Application | Cancela bet (PENDING → CANCELLED) após wallet falhar |
| `wallet-debited.handler.ts` | Infrastructure | Consome WalletDebitedEvent |
| `wallet-debit-failed.handler.ts` | Infrastructure | Consome WalletDebitFailedEvent |
| `bet-timeout.handler.ts` | Infrastructure | Cancela bets PENDING expiradas |

### Wallets Service

| Arquivo | Camada | Funcao |
|---------|--------|--------|
| `wallet.entity.ts` | Domain | Aggregate root com debit/credit + invariantes |
| `debit-wallet.use-case.ts` | Application | Debita da wallet com optimistic lock |
| `credit-wallet.use-case.ts` | Application | Credita na wallet |
| `player-wallet-resolver.service.ts` | Application | Resolve/cria wallet automaticamente |
| `bet-placed.handler.ts` | Infrastructure | Consome BetPlacedEvent com Inbox pattern |
| `player-cashed-out.handler.ts` | Infrastructure | Consome PlayerCashedOutEvent com Inbox pattern |
| `outbox-processor.ts` | Infrastructure | Publica eventos pendentes (cron 5s) |
| `inbox-processor.ts` | Infrastructure | Limpa inbox antigo (cron diario) |
