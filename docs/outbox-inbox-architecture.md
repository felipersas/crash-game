# Outbox & Inbox Pattern — Arquitetura dos Serviços

## Visão Geral

Este documento descreve os padrões transactional outbox e inbox implementados em ambos os serviços (Games e Wallets), as decisões arquiteturais por trás deles e como garantem consistência na comunicação assíncrona.

---

## O Problema

Os serviços publicam eventos de domínio (BetPlaced, PlayerCashedOut, RoundCrashed, etc.) que movimentam dinheiro entre serviços. Antes desta implementação:

1. **Eventos eram publicados diretamente no RabbitMQ** após writes no banco — não atômico
2. **Sem inbox para eventos recebidos** — mensagens duplicadas (WalletDebited/WalletDebitFailed) poderiam causar processamento duplo
3. **DI tokens na camada de infraestrutura** — use cases importavam de infra, violando DDD
4. **Camada de domínio lia `process.env`** — acoplamento com ambiente em lógica pura

Se o serviço crashasse entre o write no banco e o publish no RabbitMQ, ou se o RabbitMQ estivesse temporariamente indisponível, **eventos que movimentam dinheiro seriam perdidos**.

---

## Arquitetura da Solução

### Outbox Pattern (eventos de saída)

```
┌─────────────────────────────────────────────────────────┐
│ Use Case / Handler                                       │
│                                                          │
│  1. Mutar aggregate de domínio                           │
│  2. pullEvents() do aggregate                            │
│  3. prisma.$transaction(tx => {                          │
│       repository.save(aggregate, tx)     // estado       │
│       outboxWriter.write(tx, events)     // eventos      │
│     })                                                   │
│  4. WebSocket broadcast (fire-and-forget, fora da tx)    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ OutboxProcessor (cron: a cada 1 segundo)                 │
│                                                          │
│  1. SELECT * FROM outbox_events WHERE status = 'PENDING' │
│  2. Para cada evento: publicar no RabbitMQ               │
│  3. UPDATE status = 'SENT'                               │
│  4. Em caso de falha: incrementar retry_count (máx 5)    │
└─────────────────────────────────────────────────────────┘
```

### Inbox Pattern (eventos de entrada)

```
┌─────────────────────────────────────────────────────────┐
│ Handler de Evento (ex: WalletDebited / WalletDebitFailed)│
│                                                          │
│  1. inboxRepository.tryCreate(key: `wallet-debit-${id}`) │
│  2. Se duplicado + PROCESSED → skip (idempotente)        │
│  3. Se duplicado + FAILED → retry                        │
│  4. Processar: confirmar/cancelar bet via transação      │
│  5. Marcar inbox event como PROCESSED ou FAILED          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ InboxProcessor (cron: a cada minuto)                     │
│                                                          │
│  1. Retry de eventos FAILED (máx 5 tentativas)           │
│  2. Cleanup de eventos processados há mais de 30 dias    │
└─────────────────────────────────────────────────────────┘
```

---

## Decisões de Design

### 1. Dois tokens DI para publicação: `EVENT_PUBLISHER` e `RABBITMQ_PUBLISHER`

**Problema:** Se `EVENT_PUBLISHER` apontasse para o RabbitMQ, o OutboxProcessor escreveria os eventos voltando para o outbox (loop infinito).

**Decisão:** Dividir em dois tokens:
- `EVENT_PUBLISHER` → escreve na tabela outbox
- `RABBITMQ_PUBLISHER` → publica no RabbitMQ

Use cases e handlers injetam `EVENT_PUBLISHER`. Apenas o `OutboxProcessor` injeta `RABBITMQ_PUBLISHER`.

### 2. Parâmetro `tx` opcional nos repositórios (compatível com código existente)

Em vez de criar uma abstração UnitOfWork, métodos de escrita dos repositórios aceitam um parâmetro `PrismaTransaction` opcional:

```typescript
async create(bet: Bet, tx?: PrismaTransaction): Promise<void> {
  const client = tx ?? this.prisma;
  await client.bet.create({ data: ... });
}
```

**Motivo:** Mais simples que um padrão UnitOfWork completo. Pragmático para NestJS+Prisma. Código que não precisa de transações funciona sem alteração.

### 3. Use cases injetam `PrismaService` + `OutboxWriter` diretamente

A interface `IGameEventPublisher` (do package compartilhado `@crash/messaging`) não tem método `writeWithinTransaction(tx, events)`. Opções consideradas:
1. Modificar interface compartilhada → quebraria o outro serviço
2. Criar abstração UnitOfWork → overengineering
3. **Injetar diretamente** → aceito como compromisso pragmático

A violação de camada é contida: apenas use cases que precisam de operações atômicas conhecem PrismaService e OutboxWriter.

### 4. Broadcasts WebSocket ficam fora das transações

Broadcasts WebSocket são fire-and-forget — notificações de UI. Não fazem parte da garantia de consistência:
- Se broadcast falha → outbox ainda tem o evento para entrega inter-serviços
- Se broadcast sucede mas a transação sofre rollback → sem dano (cliente vê dados stale brevemente)

### 5. Chaves de idempotência do inbox usam prefixos de domínio

- `wallet-debit-${betId}` para eventos WalletDebited
- `wallet-debit-fail-${betId}` para eventos WalletDebitFailed

Garante exactly-once processing mesmo com redelivery do RabbitMQ.

### 6. `process.env` removido da camada de domínio

`SeedChain.generate()` antes lia `process.env.DETERMINISTIC_SEED` diretamente. Agora aceita parâmetro opcional, injetado da camada de infraestrutura (`RoundLifecycleManager`). Mantém a camada de domínio pura e testável sem manipulação de ambiente.

---

## Paridade entre Serviços

Ambos os serviços possuem arquitetura idêntica:

| Componente | Games | Wallets |
|-----------|-------|---------|
| `OutboxWriter` | ✅ | ✅ |
| `$transaction` nos use cases | ✅ | ✅ |
| `RABBITMQ_PUBLISHER` token | ✅ | ✅ |
| `OutboxProcessor` (poll + publish) | ✅ | ✅ |
| `InboxProcessor` (retry de falhas) | ✅ | ✅ |
| Inbox pattern nos handlers | ✅ | ✅ |
| DI tokens na camada de aplicação | ✅ | ✅ |

---

## Fluxo de Eventos (end-to-end)

```
1. Jogador aposta
   PlaceBetUseCase (games) → $transaction { criar Bet + salvar Round + escrever Outbox }
   OutboxProcessor (games) → poll → publicar BetPlacedEvent no RabbitMQ → marcar SENT

2. Wallet debita jogador
   BetPlacedHandler (wallets) → inbox tryCreate → DebitWalletUseCase → $transaction { salvar Wallet + escrever Outbox }
   OutboxProcessor (wallets) → poll → publicar WalletDebitedEvent → marcar SENT

3. Games confirma aposta
   WalletDebitedHandler (games) → inbox tryCreate → confirmar bet → $transaction { atualizar Bet + escrever Outbox }
   OutboxProcessor (games) → poll → publicar BetConfirmedEvent → marcar SENT

4. Jogador saca (cash out)
   CashOutUseCase (games) → $transaction { atualizar Bet + salvar Round + escrever Outbox }
   OutboxProcessor (games) → poll → publicar PlayerCashedOutEvent → marcar SENT

5. Wallet credita ganhos
   PlayerCashedOutHandler (wallets) → inbox tryCreate → CreditWalletUseCase → $transaction { salvar Wallet + escrever Outbox }
   OutboxProcessor (wallets) → poll → publicar MoneyCreditedEvent → marcar SENT

6. Round crasha
   RoundCrashHandler (games) → $transaction { escrever eventos no Outbox }
   OutboxProcessor (games) → poll → publicar RoundCrashedEvent → marcar SENT
```

Cada evento que movimenta dinheiro é persistido atomicamente com a mudança de estado e entregue de forma confiável via outbox pattern em ambos os serviços.
