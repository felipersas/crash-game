# Motor de Rounds - Lifecycle Completo

## Visão Geral

O microsserviço de Games gerencia rounds do Crash Game através de uma máquina de estados finitos orquestrada pelo `RoundLifecycleManager`. O sistema usa uma arquitetura de tripla camada de estado:

1. **In-memory** (`RoundLifecycleManager`) - Estado vivo do round atual, acesso instantaneo
2. **Redis** - Cache write-through para leitura sub-milissegundo em cashouts
3. **PostgreSQL** - Fonte de verdade persistente, historico, auditoria

**Decisão arquitetural**: O round atual vive em memoria porque o multiplicador muda a cada 100ms. PostgreSQL não suporta esse throughput de escrita sem degradar performance. Redis serve como ponte para leituras rapidas (cashout idempotência) e PostgreSQL garante durabilidade.

---

## Máquina de Estados

### Estados do Round (`RoundStatus`)

```
 ┌──────────┐   setTimeout(10s)   ┌──────────┐   multiplier >= crashPoint   ┌──────────┐
 │ BETTING  │ ──────────────────► │  ACTIVE  │ ───────────────────────────► │ CRASHED  │
 │ (10 seg) │                     │ multiplier│                              │  (fim)   │
 └──────────┘                     └──────────┘                              └──────────┘
      │                                │                                         │
      │ aceita apostas                    │ cashouts permitidos                     │ 5s delay
      │ via POST /games/bet            │ via POST /games/bet/cashout             │
      ▼                                ▼                                         ▼
  placeBet()                       cashOut()                            createNewRound()
```

| Estado | Descrição | Transições Permitidas | Acoes |
|--------|-----------|----------------------|-------|
| `BETTING` | Aceitando apostas (10s) | → `ACTIVE` | Jogadores colocam bets |
| `ACTIVE` | Multiplicador subindo, cashouts abertos | → `CRASHED` | Jogadores sacam a qualquer momento |
| `CRASHED` | Round encerrado, resultado definido | → novo round | Bets resolvidas, seed revelado |

### Estados da Aposta (`BetStatus`) - Saga Pattern

```
                    ┌──────────────────────────────────┐
                    │         BetPlacedEvent            │
                    │   (Games publica no RabbitMQ)     │
                    ▼                                  │
              ┌──────────┐                             │
              │ PENDING  │ ← Bet criada, aguardando   │
              │          │   confirmação da wallet     │
              └────┬─────┘                             │
                   │                                   │
          ┌────────┴────────┐                          │
          ▼                 ▼                          │
   WalletDebited     WalletDebitFailed          Timeout (30s)
   (sucesso)         (falha)                    (sem resposta)
          │                 │                          │
          ▼                 ▼                          ▼
   ┌──────────┐      ┌──────────┐              ┌──────────┐
   │  ACTIVE  │      │CANCELLED │              │CANCELLED │
   │ (confirmada)    │ (wallet  │              │(timeout) │
   └────┬─────┘      │ rejeitou)│              └──────────┘
        │            └──────────┘
   ┌────┴─────────────┐
   │                  │
   ▼                  ▼
┌──────────┐   ┌──────────┐
│CASHED_OUT│   │   LOST   │
│ (sacou)  │   │(crashou) │
└──────────┘   └──────────┘
```

**Decisão arquitetural**: O estado `PENDING` existe porque o débito na wallet é assíncrono via RabbitMQ. O jogador não pode ser penalizado por latência de rede entre serviços. Se a wallet confirmar após o crash, o bet é cancelado (não perdido). Se a wallet falhar, o jogador pode tentar novamente imediatamente (cancel-and-replace).

---

## Ciclo de Vida Completo

### 1. Inicialização do Serviço (`onModuleInit`)

**Arquivo**: `infrastructure/scheduling/round-lifecycle-manager.ts`

```typescript
async onModuleInit() {
  // 1. Carrega seed chain do JSON criptografado ou gera nova (1000 seeds)
  this.currentSeedChain = await this.seedChainRepository.load();
  if (!this.currentSeedChain) {
    this.currentSeedChain = await SeedChain.generate(1000);
    await this.seedChainRepository.save(this.currentSeedChain);
  }

  // 2. Carrega round atual do PostgreSQL
  this.currentRound = await this.roundRepository.findCurrentRound();

  // 3. Se não existe round, cria novo. Se existe, resume.
  if (!this.currentRound) {
    await this.createNewRound();
  } else {
    this.resumeRound();
  }
}
```

**Ordem importa**: Seed chain carrega ANTES do round porque o round precisa de um seed para existir. Se a chain estiver baixa (< 10%), regenera automaticamente.

### 2. Criação do Round (`createNewRound`)

```
1. Verifica se seed chain precisa regenerar (< 10% restante = 100 seeds)
   → Se sim, gera nova chain de 1000 seeds e salva
2. Cria round: Round.createWithSeedChain(seedChain, config)
   → Status = BETTING
   → Seed hash publicado (commitment para provably fair)
   → bettingEndTime = agora + 10 segundos
3. Salva no PostgreSQL (round + bets vazio)
4. Avanca seed chain (current++) e salva no JSON criptografado
5. Publica RoundStartedEvent no RabbitMQ
6. Broadcast WebSocket: roundStarted { roundId, seedHash, bettingEndTime }
7. Agenda fim do betting com setTimeout
```

**Decisão arquitetural**: O seed é consumido (advance) ANTES do round começar. Isso garante que mesmo que o serviço crash antes do round acabar, o seed já foi consumido e não sera reutilizado. A persistência imediata do seed-chain.json com atomic write (temp file + rename) previne corrupção.

### 3. Fase de Betting (10 segundos)

O jogador faz aposta via `POST /games/bet` → `PlaceBetUseCase`:

```typescript
async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
  // 1. Busca round atual ou cria novo se não existe
  let round = await this.roundRepository.findCurrentRound();
  if (!round) {
    round = await Round.create(DEFAULT_ROUND_CONFIG);
    await this.roundRepository.create(round);
  }

  // 2. Verifica se jogador já tem bet neste round
  const existingBet = await this.betRepository.findByPlayerAndRound(playerId, round.id);

  if (existingBet) {
    // CANCEL-AND-REPLACE: permite retry após falha na wallet
    if (existingBet.getStatus() === BetStatus.PENDING || existingBet.getStatus() === BetStatus.CANCELLED) {
      // Cancela bet anterior (se PENDING) e remove do aggregate
      existingBet.cancel('Replaced by new bet attempt');
      await this.betRepository.update(existingBet);
      round.removeBet(input.playerId);
    } else {
      throw new DuplicateBetError(); // ACTIVE, CASHED_OUT, LOST → não pode substituir
    }
  }

  // 3. Cria nova bet em PENDING
  round.placeBet(input.playerId, input.playerName, amount);
  const bet = round.getBetByPlayer(input.playerId);

  // 4. Persiste bet e round separadamente
  await this.betRepository.create(bet);
  await this.roundRepository.save(round);

  // 5. Publica BetPlacedEvent no RabbitMQ → Wallets debita
  await this.eventPublisher.publishBatch(round.pullEvents());

  // 6. Broadcast WebSocket: betPlaced
  return { roundId: round.id, betId: bet.id, amountCents, status: round.getStatus() };
}
```

**Decisão arquitetural - Cancel-and-Replace**: Quando uma bet esta `PENDING` (wallet ainda não confirmou) ou `CANCELLED` (wallet rejeitou), o jogador pode colocar outra bet no mesmo round. Isso resolve o cenario onde:
1. Jogador aposta $10 → bet PENDING
2. Wallet falha (saldo insuficiente) → bet CANCELLED
3. Jogador deposita e tenta de novo → SEM cancel-and-replace, receberia `DuplicateBetError`

Sem esse padrao, o jogador ficaria bloqueado ate o proximo round mesmo tendo saldo disponivel.

**Decisão arquitetural - Bets persistidas separadamente**: Bets tem seu próprio repository (`BetRepository`) independente do Round aggregate. Motivo:
- Cashout atualiza o bet direto no DB (não precisa recarregar o aggregate inteiro)
- Queries de historico sao mais eficientes com tabela separada
- O Round aggregate mantem bets em memoria apenas para o round atual (Map<playerId, Bet>)

### 4. Transição BETTING → ACTIVE (`endBettingPhase`)

```typescript
private async endBettingPhase() {
  try {
    // 1. Calcula crash point a partir do seed (Provably Fair)
    await this.currentRound.startRound();
    //   → status = ACTIVE
    //   → crashPoint = CrashPoint.fromSeed(seed) — SHA-256 + 52 bits + house edge 4%
    //   → startedAt = new Date()

    // 2. Salva no PostgreSQL (com optimistic locking via campo version)
    await this.roundRepository.save(this.currentRound);
  } catch (error) {
    if (error instanceof OptimisticLockError) {
      // Recarrega do DB — outra instancia já transicionou
      const reloaded = await this.roundRepository.findById(this.currentRound.id);
      this.currentRound = reloaded;
      // Se já ACTIVE, apenas resume. Se ainda BETTING, retenta uma vez.
    }
  }

  // 3. Publica BettingPhaseEndedEvent
  // 4. Broadcast WebSocket: bettingEnded { roundId }
  // 5. Inicia atualizações do multiplicador
  this.startMultiplierUpdates();
}
```

**Decisão arquitetural - Optimistic Locking**: Usa campo `version` no Round. PostgreSQL rejeita writes com versão stale via Prisma. Isso permite multiplas instancias do Games service sem distributed locks — o primeiro a escrever vence, os outros fazem reload e adaptam.

### 5. Fase Active - Atualizações do Multiplicador

```typescript
private startMultiplierUpdates() {
  // setInterval a cada 100ms (10x por segundo)
  this.updateInterval = setInterval(() => {
    this.updateMultiplier();
  }, 100);
}

private updateMultiplier() {
  const elapsedSeconds = (Date.now() - this.roundStartTime.getTime()) / 1000;

  // 1. Atualiza multiplicador (formula exponencial)
  this.currentRound.updateMultiplier(elapsedSeconds);
  //   → currentMultiplier = e^(0.06 * elapsedSeconds)
  //   → Se multiplier >= crashPoint → round.crash()

  // 2. Persiste estado no Redis (fire-and-forget)
  this.persistToRedis();

  // 3. Broadcast WebSocket: multiplierUpdate { roundId, multiplier }

  // 4. Verifica se crashou
  if (this.currentRound.getStatus() === RoundStatus.CRASHED) {
    this.handleRoundCrashed();
  }
}
```

**Formula do multiplicador**: `M(t) = e^(0.06 * t)`

| Tempo | Multiplicador | Contexto |
|-------|--------------|----------|
| 0s | 1.00x | Inicio do round |
| 1s | 1.06x | Crescimento lento no inicio |
| 7s | 1.50x | Zone baixa (low risk) |
| 11.5s | 2.00x | Dobro do investimento |
| 18s | 3.00x | Zone media |
| 39s | 10.00x | Zone alta (high risk) |
| 77s | 100.00x | Extremamente raro (~0.96%) |

**Decisão arquitetural - 100ms**: Intervalo de 100ms balanceia suavidade visual (10 updates/segundo) com carga no servidor. WebSocket broadcast para TODOS os clientes conectados a cada tick, entao intervalos menores (ex: 50ms) dobrariam o trafego de rede sem ganho perceptivel ao usuario.

### 6. Cashout durante Active Phase

**Arquivo**: `application/use-cases/cash-out.use-case.ts`

```typescript
async execute(input: CashOutInput): Promise<CashOutOutput> {
  // 1. IDEMPOTÊNCIA: verifica Redis se já processou este cashout
  const cached = await this.idempotencyCache.checkCashoutIdempotency(input.idempotencyKey);
  if (cached) return cached; // Retorna resultado anterior sem reprocessar

  // 2. Carrega round — prefere IN-MEMORY do LifecycleManager
  const liveRound = this.roundStateProvider.getCurrentRound();
  if (liveRound && liveRound.getStatus() === RoundStatus.ACTIVE) {
    round = liveRound; // Multiplicador mais preciso (não depende de DB read)
  } else {
    round = await this.roundRepository.findById(roundId); // Fallback para DB
  }

  // 3. Carrega bet do jogador
  const bet = await this.betRepository.findByPlayerAndRound(playerId, roundId);

  // 4. Executa cashout na entidade (domain logic)
  const payout = round.cashOut(playerId);
  //   → bet.status = CASHED_OUT
  //   → payout = bet.amount * currentMultiplier (em cents, bigint)

  // 5. Persiste bet e round
  await this.betRepository.update(cashedOutBet);
  await this.roundRepository.save(round);

  // 6. Cache resultado no Redis (SET NX — atomico)
  await this.idempotencyCache.setCashoutIdempotency(idempotencyKey, result);

  // 7. Publica PlayerCashedOutEvent → Wallets credita os ganhos
  await this.eventPublisher.publishBatch(round.pullEvents());

  // 8. Broadcast WebSocket: playerCashedOut
}
```

**Decisão arquitetural - Idempotência com Redis SET NX**: O frontend gera um UUID v4 (`idempotencyKey`) para cada tentativa de cashout. Se o jogador clicar "Cash Out" duas vezes rápido (ou se houver retry de rede), o Redis `SET NX` garante que apenas o primeiro processa. O segundo retorna o resultado cacheado. TTL de 5 minutos ( Rounds não duram mais que isso).

**Decisão arquitetural - In-memory round preference**: O multiplicador no DB pode estar desatualizado (write a cada 100ms com latência de rede). O round in-memory tem o valor mais preciso. Se o round não estiver em memoria (edge case: failover), usa o DB como fallback.

**Decisão arquitetural - Payout em cents (bigint)**: `calculatePayout()` usa aritmetica de inteiros para evitar floating point:
```typescript
calculatePayout(betCents: bigint): bigint {
  const profitMultiplier = Math.floor((this.value - 1) * 100);
  return betCents + (betCents * BigInt(profitMultiplier)) / 100n;
}
```
O fator de multiplicação e truncado (floor) em vez de arredondado — o jogador nunca recebe centavos fracionarios. Isso e favoravel a casa e previne inconsistências.

### 7. Crash do Round — Delegação para RoundCrashHandler

**Decisão arquitetural - RoundCrashHandler dedicado**: A lógica de crash vive em uma classe separada (`RoundCrashHandler`) do orquestrador de lifecycle (`RoundLifecycleManager`). Motivos:
- **Single Responsibility**: RLM orquestra lifecycle; RCH resolve crash
- **Testabilidade**: Crash handling pode ser testado isoladamente
- **Clareza**: Cada classe tem um propósito único

**Arquivo**: `infrastructure/scheduling/round-crash-handler.ts`

```typescript
async handleRoundCrashed(inMemoryRound: Round): Promise<Round> {
  // 1. Para setInterval de updates (feito pelo RLM antes de chamar)

  // 2. Recarrega round do PostgreSQL (versão autoritativa)
  const latestRound = await this.roundRepository.findById(roundId);
  // POR QUE? Cashouts concorrentes pela API podem ter atualizado o round
  // no DB sem que o in-memory round saiba. O DB tem a versão mais recente.

  // 3. Re-aplica crash no round reloaded
  if (crashPoint) {
    latestRound.updateMultiplier(elapsedSinceStart);
    // Isso faz o round transicionar para CRASHED com o crashPoint correto
  }

  // 4. Salva no PostgreSQL (com optimistic lock — pode haver conflito)
  try {
    await this.roundRepository.save(latestRound);
  } catch (error) {
    if (error.code === 'P2025') {
      // Version conflict — outro processo já salvou. Continua com eventos in-memory.
    }
  }

  // 5. Resolve bets: ACTIVE → LOST, PENDING → CANCELLED
  await this.settleBets(latestRound);

  // 6. Registra metricas (crash point, round duration, RTP, bets perdidas)
  // 7. Deleta estado do Redis (round acabou)
  await this.redisService.deleteRound(roundId);

  // 8. Publica RoundCrashedEvent no RabbitMQ (com seed REVELADO!)
  await this.eventPublisher.publishBatch(latestRound.pullEvents());

  // 9. Broadcast WebSocket: crash { roundId, crashPoint, seed }
  // 10. RLM agenda proximo round (5s delay)
}
```

**Decisão arquitetural - Reload before crash**: Imagine este cenario:
```
T=10.0s  Multiplier atinge crashPoint (2.50x)
T=10.0s  RLM detecta crash in-memory
T=10.0s  Enquanto isso, jogador B faz cashout via API
         → API carrega round do DB (ainda ACTIVE)
         → Salva bet CASHED_OUT no DB
         → Incrementa version no DB
T=10.0s  RLM tenta salvar crash no DB...
         → SEM reload: salvaria sobre a versão antiga, perdendo o cashout!
         → COM reload: carrega versão com cashout, depois aplica crash
```

**Decisão arquitetural - PENDING → CANCELLED no crash**: Bets que ainda estavam aguardando confirmação da wallet quando o round crasha são canceladas (não perdidas). Motivo: a wallet pode nunca ter debitado — não e justo perder dinheiro que nunca saiu da conta.

---

## Redis — Cache de Alta Velocidade

### Arquivo: `infrastructure/redis/redis.service.ts`

### Por que Redis?

| Razao | Detalhe |
|-------|---------|
| **Cashout instantaneo** | Multiplicador muda a cada 100ms. Cashout precisa saber o valor atual em sub-milissegundo. DB round-trip = 5-10ms. Redis = 0.1ms. |
| **Idempotencia atomica** | `SET NX` (set if not exists) e atomico no Redis — garante que o mesmo cashout nunca processa duas vezes, sem distributed locks. |
| **Graceful degradation** | Se Redis cair, o round continua funcionando in-memory + PostgreSQL. `persistToRedis()` e fire-and-forget com catch de erros. |

**Decisão arquitetural - Redis como cache, não source of truth**: PostgreSQL e a fonte de verdade. Redis e write-through cache para leitura rapida. Se Redis cair, perde-se apenas o cache do round ativo — o round continua em memoria e e restauravel do DB.

### Chaves Redis

| Chave | TTL | Propósito |
|-------|-----|-----------|
| `crash:round:{roundId}` | 300s (5min) | Estado atual do round (status, multiplier, timestamps) |
| `crash:idempotency:cashout:{uuid}` | 300s (5min) | Resultado de cashout já processado (evita duplicação) |

TTL de 5 minutos porque rounds nunca duram mais que isso (10s betting + tempo ativo ~ 1-2 min max).

### Estrutura do RoundState no Redis

```json
{
  "id": "uuid-do-round",
  "status": "ACTIVE",
  "crashPoint": 2.47,
  "currentMultiplier": 1.85,
  "bettingEndTime": "2026-05-10T22:30:00.000Z",
  "startedAt": "2026-05-10T22:30:10.000Z",
  "crashedAt": null,
  "version": 5,
  "lastUpdatedAt": 1746819015000
}
```

### Fluxo de Escrita Redis (Fire-and-Forget)

```
setInterval (100ms)
    │
    ├── round.updateMultiplier(elapsed)     [in-memory]
    ├── persistToRedis()                    [async, fire-and-forget]
    │       └── redis.set(`crash:round:${id}`, state, EX=300s)
    │           .catch(log warning)         ← erros não bloqueiam o round
    ├── broadcast WebSocket                 [async]
    └── check crash                         [in-memory]
```

---

## Resiliencia

### Restart do Servidor

`resumeRound()` trata cada estado:

| Estado no DB | Acao |
|-------------|------|
| `CRASHED` | Cria novo round imediatamente |
| `BETTING` | Verifica se betting já devia ter acabado. Se sim, transiciona. Se não, agenda setTimeout. |
| `ACTIVE` | Retoma updates do multiplicador de onde parou (usando `startedAt` do DB) |

### Conflitos de Concorrencia

| Mecanismo | Onde | Garantia |
|-----------|------|----------|
| **Optimistic Locking** | Round entity (campo `version`) | PostgreSQL rejeita writes com versão stale via Prisma |
| **Cashout Idempotencia** | Redis `SET NX` | Mesmo cashout nunca processa duas vezes |
| **Reload on Crash** | `RoundCrashHandler` | Antes de salvar crash, recarrega do DB para pegar cashouts concorrentes |
| **Bet Timeout** | `BetTimeoutHandler` | Bets PENDING ha mais de 30s são canceladas automaticamente |

### Bet Timeout Handler

**Arquivo**: `infrastructure/scheduling/bet-timeout.handler.ts`

```typescript
@Cron(CronExpression.EVERY_30_SECONDS)
async cancelStalePendingBets(): Promise<void> {
  const staleThreshold = new Date(Date.now() - 30_000); // 30 segundos
  const staleBets = await this.betRepository.findStalePendingBets(staleThreshold);

  for (const bet of staleBets) {
    await this.cancelBetUseCase.execute({
      roundId: bet.roundId,
      betId: bet.id,
      playerId: bet.playerId,
      reason: 'Wallet confirmation timeout - bet was not confirmed within expected time',
    });
  }
}
```

**Decisão arquitetural - Timeout de 30s**: A comúnicação Games → RabbitMQ → Wallets → RabbitMQ → Games tem latencia tipica de 100-500ms. 30 segundos e um limite generoso que cobre:
- Wallet service temporariamente fora do ar
- Falha de entrega de mensagem (RabbitMQ retry)
- Otimistic lock conflicts em cascata

Após 30s, e mais seguro cancelar e deixar o jogador tentar de novo (cancel-and-replace) do que esperar indefinidamente.

---

## Timer Summary

| Timer | Intervalo | Propósito | Arquivo |
|-------|-----------|-----------|---------|
| `setInterval` | 100ms | Atualizar multiplicador + Redis + WebSocket | RLM |
| `setTimeout` (betting end) | ~10s | Transicionar BETTING → ACTIVE | RLM |
| `setTimeout` (next round) | 5s | Criar novo round após crash | RLM |
| `@Cron(EVERY_30_SECONDS)` | 30s | Cancelar bets PENDING expiradas | BetTimeoutHandler |
| `@Cron(EVERY_SECOND)` | 1s | Debug logging (ticker) | RLM |

---

## Arquivos Envolvidos

| Arquivo | Camada | Funcao |
|---------|--------|--------|
| `round-lifecycle-manager.ts` | Infrastructure | Orquestração do ciclo de vida |
| `round-crash-handler.ts` | Infrastructure | Resolucao do crash (DB, bets, eventos) |
| `bet-timeout.handler.ts` | Infrastructure | Cancelamento de bets PENDING expiradas |
| `redis.service.ts` | Infrastructure | Cache Redis + idempotência de cashout |
| `games.gateway.ts` | Infrastructure | WebSocket broadcasts (server push only) |
| `round.entity.ts` | Domain | Entidade Round — regras de negocio, state machine |
| `bet.entity.ts` | Domain | Entidade Bet — saga PENDING → ACTIVE/CANCELLED |
| `multiplier.value-object.ts` | Domain | Formula do multiplicador e^(k*t) |
| `crash-point.value-object.ts` | Domain | Crash point com house edge 4% |
| `place-bet.use-case.ts` | Application | Criar aposta com cancel-and-replace |
| `cash-out.use-case.ts` | Application | Processar cashout com idempotência |
| `confirm-bet.use-case.ts` | Application | Confirmar aposta (apos wallet debitar) |
| `cancel-bet.use-case.ts` | Application | Cancelar aposta (wallet falhou/timeout) |
| `games.controller.ts` | Presentation | REST endpoints (bet, cashout, verify, history) |
